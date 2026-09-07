import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool, audit } from '../../../../packages/db/index.js';
import {
  DomainError,
  licenseStatus,
  defaultPolicy,
  beautyDePolicy,
} from '../../../../packages/domain/src/index.js';
import { actor, admin, demoLogin } from '../common/auth.js';
import { mutate } from '../common/idempotency.js';
import { config } from '../common/config.js';
import {
  supabaseLogin,
  supabaseRefresh,
  supabaseSignup,
  supabaseEstablishSession,
  supabaseForgotPassword,
  bootstrapOrganization,
  setupOrganization,
  supabaseAuth,
} from '../integrations/supabase-auth.js';
import {
  assertPlatformApiAccess,
  platformSearch,
  platformCheck,
} from './platform.js';
import {
  search,
  getAsset,
  publicAsset,
  assetSelect,
  createCreator,
  updatePolicy,
  consent,
  publish,
  ownedAsset,
  publicPassportForAsset,
} from './marketplace.js';
import {
  ingestIdentityEvent,
  isIdentityEvent,
  simulateIdentitySandbox,
  startIdentitySession,
} from './identity-kyc.js';
import {
  createRequest,
  approveRequest,
  createQuote,
  createOrder,
  acceptOrder,
  getOrder,
  listOrders,
  listRequests,
  previewRightsCheck,
} from './licensing.js';
import {
  checkout,
  simulatePayment,
  stripeClient,
} from './payments.js';
import { ingestStripeCheckoutEvent } from './stripe-events.js';
import {
  createConnectOnboardingLink,
  getConnectStatus,
  ingestConnectAccountEvent,
  ingestThinConnectNotification,
  isConnectAccountEvent,
} from './stripe-connect.js';
import { ingestStripeRefundEvent, isRefundEvent, requestRefund } from './stripe-refunds.js';
import {
  creatorMoneySummary,
  ingestMoneyMovementEvent,
  isMoneyMovementEvent,
  listMoneyOverview,
  reviewDispute,
} from './stripe-money.js';
import {
  acknowledgeDifference,
  listExternalReconciliation,
  runExternalReconciliation,
} from './stripe-reconciliation.js';
import { verifyPayload, signingKeys } from '../integrations/signing.js';
const uuid = (id: string) => z.uuid().parse(id);
const reasonSchema = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
/** Legacy base64url (32) or RN-LIC-YYYY-######. */
const tokenSchema = z
  .string()
  .regex(/^(?:[A-Za-z0-9_-]{32}|RN-LIC-\d{4}-\d{6})$/);
const idem = (req: Request) =>
  typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
@Controller('v1')
export class PublicController {
  @Get('health') async health() {
    await pool.query('SELECT 1');
    return { status: 'ok', environment: config.env, commerce: 'sandbox_only' };
  }
  @Get('config') info() {
    return {
      sandbox: true,
      auth: config.auth,
      payments: config.payments,
      identity: config.identity,
      rights_core_purchases: config.rightsCorePurchases,
      platform_api_enabled: config.platformApiEnabled,
      live_commerce: false,
    };
  }
  @Get('search') search(@Query() q: Record<string, unknown>) {
    return search(q);
  }
  @Get('assets/:id') async asset(@Param('id') id: string) {
    return publicAsset(await getAsset(pool, id));
  }
  @Get('assets/:id/passport') async passport(@Param('id') id: string) {
    const asset = await getAsset(pool, id);
    return publicPassportForAsset(asset.id);
  }
  @Get('public/licenses/:token/verify') async verify(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    tokenSchema.parse(token);
    res.setHeader('Cache-Control', 'no-store');
    const l = (await pool.query('SELECT * FROM licenses WHERE public_token=$1', [token])).rows[0];
    if (!l) throw new DomainError('NOT_FOUND', 404);
    const valid = verifyPayload(l.payload, l.signature, l.key_id);
    return {
      license_id: l.id,
      public_token: l.public_token,
      status: licenseStatus(l, valid),
      signature_valid: valid,
      starts_at: l.starts_at,
      ends_at: l.ends_at,
      scope: l.payload.scope,
      key_id: l.key_id,
      checked_at: new Date().toISOString(),
      sandbox: true,
    };
  }
  @Get('public/signing-key') key() {
    const { kid, pem } = signingKeys();
    return { key_id: kid, algorithm: 'Ed25519', public_key: pem };
  }
  /** Rights Check preview — no auth, no persisted request. */
  @Post('public/rights-check') @HttpCode(200) async rightsCheckPreview(@Body() body: unknown) {
    return previewRightsCheck(pool, body);
  }
}
@Controller('v1')
export class AccountsController {
  @Post('auth/sandbox') @HttpCode(200) login(@Body() body: unknown) {
    const data = z
      .object({ role: z.enum(['buyer', 'creator', 'admin', 'viewer', 'other', 'new_creator']) })
      .strict()
      .parse(body);
    return demoLogin(data.role);
  }
  @Post('auth/supabase/login') @HttpCode(200) async supabaseSignIn(@Body() body: unknown) {
    const data = z
      .object({
        email: z.string().trim().email().max(200),
        password: z.string().min(8).max(200),
      })
      .strict()
      .parse(body);
    return supabaseLogin(data.email, data.password);
  }
  @Post('auth/supabase/signup') @HttpCode(200) async supabaseRegister(@Body() body: unknown) {
    const data = z
      .object({
        email: z.string().trim().email().max(200),
        password: z.string().min(8).max(200),
        display_name: z.string().trim().min(2).max(80).optional(),
      })
      .strict()
      .parse(body);
    return supabaseSignup(data);
  }
  @Post('auth/supabase/session') @HttpCode(200) async supabaseSession(@Body() body: unknown) {
    const data = z
      .object({
        access_token: z.string().min(20).max(8000),
        refresh_token: z.string().min(10).max(8000),
        expires_in: z.number().int().positive().max(86400).optional(),
      })
      .strict()
      .parse(body);
    return supabaseEstablishSession(data);
  }
  @Post('auth/supabase/forgot-password') @HttpCode(200) async supabaseForgot(
    @Body() body: unknown,
  ) {
    const data = z
      .object({ email: z.string().trim().email().max(200) })
      .strict()
      .parse(body);
    return supabaseForgotPassword(data.email);
  }
  @Post('auth/supabase/refresh') @HttpCode(200) async supabaseRenew(@Body() body: unknown) {
    const data = z
      .object({ refresh_token: z.string().min(10).max(4000) })
      .strict()
      .parse(body);
    return supabaseRefresh(data.refresh_token);
  }
  @Post('auth/logout') @HttpCode(200) async logout(@Req() req: Request) {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (token) {
      if (config.auth === 'sandbox')
        await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
          createHash('sha256').update(token).digest('hex'),
        ]);
      else if (config.auth === 'supabase') await supabaseAuth().signOut(token);
    }
    return { ok: true };
  }
  @Get('me') async me(@Req() req: Request) {
    const user = await actor(req);
    const organizations = (
      await pool.query(
        'SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1',
        [user.id],
      )
    ).rows;
    const hasCreator = !!(
      await pool.query('SELECT 1 FROM creators WHERE user_id=$1 LIMIT 1', [user.id])
    ).rowCount;
    return {
      ...user,
      organizations,
      has_creator: hasCreator,
      sandbox: config.auth === 'sandbox',
    };
  }
  @Post('organizations/setup') @HttpCode(200) async setupOrg(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    const data = z
      .object({
        legal_name: z.string().trim().min(2).max(120),
        website: z.string().trim().max(300).optional().or(z.literal('')),
        country: z.enum(['AT', 'DE', 'ES']),
        member_role: z.enum(['owner', 'employee', 'agency']),
      })
      .strict()
      .parse(body ?? {});
    return setupOrganization(user.id, user.display_name, {
      legal_name: data.legal_name,
      website: data.website || undefined,
      country: data.country,
      member_role: data.member_role,
    });
  }
  @Post('organizations/bootstrap') @HttpCode(200) async bootstrapOrg(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    const data = z
      .object({
        org_name: z.string().trim().min(2).max(120).optional(),
        country: z.enum(['AT', 'DE', 'ES']).optional(),
      })
      .strict()
      .parse(body ?? {});
    return bootstrapOrganization(user.id, user.display_name, data);
  }
  @Post('organizations') async organization(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    const data = z
      .object({
        legal_name: z.string().trim().min(3).max(100),
        country: z.enum(['AT', 'DE', 'ES']),
      })
      .strict()
      .parse(body);
    return mutate(user.id, 'organizations', idem(req), body, async (db) => {
      const id = randomUUID();
      await db.query('INSERT INTO organizations(id,legal_name,country) VALUES($1,$2,$3)', [
        id,
        data.legal_name,
        data.country,
      ]);
      await db.query("INSERT INTO organization_members VALUES($1,$2,'owner')", [id, user.id]);
      await audit(db, user.id, 'organization.created', id);
      return { id, ...data, verified: false };
    });
  }
  @Get('creator') async creator(@Req() req: Request) {
    const user = await actor(req);
    const assets = (
      await pool.query(assetSelect + ' WHERE c.user_id=$1 ORDER BY a.created_at', [user.id])
    ).rows;
    for (const a of assets) {
      a.consented = !!(
        await pool.query('SELECT 1 FROM consents WHERE policy_id=$1 AND user_id=$2', [
          a.policy_id,
          user.id,
        ])
      ).rowCount;
      a.files = (
        await pool.query('SELECT id,mime_type,scan_status FROM asset_files WHERE asset_id=$1', [
          a.id,
        ])
      ).rows;
    }
    const connect = assets.length ? await getConnectStatus(user) : null;
    const money = assets.length ? await creatorMoneySummary(user) : null;
    const default_policy = config.rightsCorePurchases
      ? beautyDePolicy({
          policy_id: '00000000-0000-4000-8000-000000000001',
          asset_id: '00000000-0000-4000-8000-000000000002',
          creator_id: '00000000-0000-4000-8000-000000000003',
          territories: { AT: 'ALLOW', DE: 'ALLOW' },
          industries: {
            beauty: 'ALLOW',
            lifestyle: 'ALLOW',
            fashion: 'ALLOW',
            alcohol: 'DENY',
            gambling: 'DENY',
            tobacco: 'DENY',
            political_advertising: 'DENY',
            adult: 'DENY',
          },
          channels: { instagram: 'ALLOW', tiktok: 'ALLOW', youtube: 'ALLOW' },
          durations: { '30': 'ALLOW', '90': 'ALLOW' },
          operations: { synthetic_image: 'ALLOW', synthetic_video: 'ALLOW' },
          pricing: {
            revision: 1,
            currency: 'EUR',
            duration_prices_minor: { '30': 50000, '90': 120000 },
          },
        })
      : defaultPolicy;
    return { assets, default_policy, connect, money };
  }
  @Post('creators/me/identity-session') async identitySession(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    const data = z.object({ asset_id: z.uuid() }).strict().parse(body ?? {});
    return mutate(user.id, 'identity-session/' + data.asset_id, idem(req), body, (db) =>
      startIdentitySession(db, user, data.asset_id),
    );
  }
  @Get('creator/connect') async connectStatus(@Req() req: Request) {
    return getConnectStatus(await actor(req));
  }
  @Post('creator/connect/onboarding-link') @HttpCode(200) async connectLink(@Req() req: Request) {
    // Account Links expire quickly; always mint a fresh URL. Never cache or persist it.
    return createConnectOnboardingLink(await actor(req));
  }
  @Post('creators') async create(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    return mutate(user.id, 'creators', idem(req), body, (db) => createCreator(db, user, body));
  }
  @Post('assets/:id/policies') async policy(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'policy/' + id, idem(req), body, (db) =>
      updatePolicy(db, user, id, body),
    );
  }
  @Post('assets/:id/consent') async consent(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'consent/' + id, idem(req), body, (db) => consent(db, user, id, body));
  }
  @Post('assets/:id/publish') async publish(@Req() req: Request, @Param('id') id: string) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'publish/' + id, idem(req), {}, (db) => publish(db, user, id));
  }
  @Post('assets/:id/submit') async submit(@Req() req: Request, @Param('id') id: string) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'submit/' + id, idem(req), {}, async (db) => {
      const a = await ownedAsset(db, id, user);
      if (a.status === 'suspended') throw new DomainError('ASSET_SUSPENDED', 409);
      if (!(await db.query('SELECT 1 FROM consents WHERE policy_id=$1', [a.policy_id])).rowCount)
        throw new DomainError('CONSENT_REQUIRED');
      if (!(await db.query('SELECT 1 FROM asset_files WHERE asset_id=$1', [id])).rowCount)
        throw new DomainError(
          'EVIDENCE_REQUIRED',
          422,
          'Sube una imagen de prueba para revisar el vínculo.',
        );
      await db.query("UPDATE assets SET status='pending_review' WHERE id=$1", [id]);
      await audit(db, user.id, 'asset.submitted', id);
      return { status: 'pending_review' };
    });
  }
  @Post('assets/:id/identity-sandbox') async identity(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'identity/' + id, idem(req), {}, (db) =>
      simulateIdentitySandbox(db, user, id),
    );
  }
  @Post('assets/:id/files') async upload(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    uuid(id);
    const data = z
      .object({ base64: z.string().max(2800000), mime_type: z.enum(['image/png', 'image/jpeg']) })
      .strict()
      .parse(body);
    const buffer = Buffer.from(data.base64, 'base64');
    if (!buffer.length || buffer.length > 2097152) throw new DomainError('FILE_TOO_LARGE');
    const valid =
      data.mime_type === 'image/png'
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!valid) throw new DomainError('INVALID_IMAGE');
    return mutate(
      user.id,
      'upload/' + id,
      idem(req),
      { hash: createHash('sha256').update(buffer).digest('hex') },
      async (db) => {
        const a = await ownedAsset(db, id, user);
        if (!['draft', 'rejected'].includes(a.status))
          throw new DomainError('EDIT_DRAFT_REQUIRED', 409);
        const fid = randomUUID(),
          storage = path.resolve('.local/uploads');
        await mkdir(storage, { recursive: true, mode: 0o700 });
        await writeFile(path.join(storage, fid), buffer, { mode: 0o600, flag: 'wx' });
        await db.query(
          "INSERT INTO asset_files(id,asset_id,storage_key,sha256,mime_type,size_bytes,scan_status) VALUES($1,$2,$3,$4,$5,$6,'pending')",
          [
            fid,
            id,
            fid,
            createHash('sha256').update(buffer).digest('hex'),
            data.mime_type,
            buffer.length,
          ],
        );
        await db.query("UPDATE assets SET relationship_status='pending' WHERE id=$1", [id]);
        return { id: fid, scan_status: 'pending', sandbox: true };
      },
    );
  }
  @Get('files/:id') async file(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const user = await actor(req);
    const f = (
      await pool.query(
        'SELECT f.*,c.user_id FROM asset_files f JOIN assets a ON a.id=f.asset_id JOIN creators c ON c.id=a.creator_id WHERE f.id=$1',
        [uuid(id)],
      )
    ).rows[0];
    if (!f || (f.user_id !== user.id && user.role !== 'admin'))
      throw new DomainError('NOT_FOUND', 404);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="evidence.bin"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(await readFile(path.resolve('.local/uploads', f.storage_key)));
  }
  @Get('favorites') async favorites(@Req() req: Request) {
    const user = await actor(req);
    return (
      await pool.query('SELECT asset_id FROM favorites WHERE user_id=$1', [user.id])
    ).rows.map((r) => r.asset_id);
  }
  @Post('favorites/:id') async favorite(@Req() req: Request, @Param('id') id: string) {
    const user = await actor(req);
    await getAsset(pool, uuid(id));
    await pool.query('INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, id]);
    return { saved: true };
  }
  @Delete('favorites/:id') async unfavorite(@Req() req: Request, @Param('id') id: string) {
    const user = await actor(req);
    await pool.query('DELETE FROM favorites WHERE user_id=$1 AND asset_id=$2', [user.id, uuid(id)]);
    return { saved: false };
  }
}
@Controller('v1')
export class CommerceController {
  @Post('license-requests') async request(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    return mutate(user.id, 'requests', idem(req), body, (db) => createRequest(db, user, body));
  }
  @Get('license-requests') async requests(@Req() req: Request) {
    return listRequests(await actor(req));
  }
  @Post('license-requests/:id/decision') async approval(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'approval/' + id, idem(req), body, (db) =>
      approveRequest(db, user, id, body),
    );
  }
  @Post('quotes') async quote(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    return mutate(user.id, 'quotes', idem(req), body, (db) => createQuote(db, user, body));
  }
  @Post('orders') async order(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    return mutate(user.id, 'orders', idem(req), body, (db) => createOrder(db, user, body));
  }
  @Get('orders') async orders(@Req() req: Request) {
    return listOrders(await actor(req));
  }
  @Get('orders/:id') async orderDetail(@Req() req: Request, @Param('id') id: string) {
    const o = await getOrder(pool, await actor(req), uuid(id));
    const license = (
      await pool.query(
        'SELECT id,public_token,status,starts_at,ends_at FROM licenses WHERE order_id=$1',
        [id],
      )
    ).rows[0];
    const awaitingPaymentConfirm = Boolean(
      (
        await pool.query(
          `SELECT 1 FROM provider_events
           WHERE status='pending' AND payload->>'order_id'=$1
           LIMIT 1`,
          [id],
        )
      ).rowCount,
    );
    const awaitingLicense = Boolean(
      !license &&
        ((
          await pool.query(
            `SELECT 1 FROM outbox
             WHERE order_id=$1 AND status='pending' AND kind='license.issue'
             LIMIT 1`,
            [id],
          )
        ).rowCount ||
          ['paid', 'issuing'].includes(o.status)),
    );
    return {
      ...o,
      license,
      awaiting_payment_confirm: awaitingPaymentConfirm,
      awaiting_license: awaitingLicense,
    };
  }
  @Post('orders/:id/acceptance') async accept(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    uuid(id);
    return mutate(user.id, 'accept/' + id, idem(req), body, (db) =>
      acceptOrder(db, user, id, body),
    );
  }
  @Post('orders/:id/checkout') async checkout(@Req() req: Request, @Param('id') id: string) {
    return checkout(await actor(req), uuid(id));
  }
  @Post('orders/:id/simulate-payment') async payment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { success } = z.object({ success: z.boolean() }).strict().parse(body);
    return simulatePayment(await actor(req), uuid(id), success);
  }
  @Get('licenses') async licenses(@Req() req: Request) {
    const user = await actor(req);
    const rows = (
      await pool.query(
        `SELECT l.*,c.display_name,c.portrait,o.scope,o.price FROM licenses l JOIN orders o ON o.id=l.order_id JOIN assets a ON a.id=o.asset_id JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1 OR EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.organization_id AND m.user_id=$1) ORDER BY l.created_at DESC LIMIT 100`,
        [user.id],
      )
    ).rows;
    return rows.map((l) => ({
      ...l,
      verification_status: licenseStatus(l, verifyPayload(l.payload, l.signature, l.key_id)),
    }));
  }
  @Get('licenses/:id/certificate') async certificate(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const user = await actor(req);
    const l = (await pool.query('SELECT * FROM licenses WHERE id=$1', [uuid(id)])).rows[0];
    if (!l) throw new DomainError('NOT_FOUND', 404);
    await getOrder(pool, user, l.order_id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rightsnet-${l.id}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(
      JSON.stringify(
        {
          payload: l.payload,
          signature: l.signature,
          key_id: l.key_id,
          verify_url: `${config.webUrl}/verify/${l.public_token}`,
        },
        null,
        2,
      ),
    );
  }
  @Post('incidents') async incident(@Req() req: Request, @Body() body: unknown) {
    const user = await actor(req);
    const data = z
      .object({
        asset_id: z.uuid().optional(),
        license_id: z.uuid().optional(),
        category: z.enum(['rights', 'misuse', 'payment', 'other']),
        details: z.string().trim().min(10).max(2000),
      })
      .strict()
      .parse(body);
    return mutate(user.id, 'incidents', idem(req), body, async (db) => {
      if (data.asset_id) await getAsset(db, data.asset_id, user);
      if (data.license_id) {
        const l = (await db.query('SELECT order_id FROM licenses WHERE id=$1', [data.license_id]))
          .rows[0];
        if (!l) throw new DomainError('NOT_FOUND', 404);
        await getOrder(db, user, l.order_id);
      }
      const id = randomUUID();
      await db.query(
        'INSERT INTO incidents(id,reporter_id,asset_id,license_id,category,details) VALUES($1,$2,$3,$4,$5,$6)',
        [id, user.id, data.asset_id ?? null, data.license_id ?? null, data.category, data.details],
      );
      return { id, status: 'open' };
    });
  }
}
@Controller('v1/admin')
export class AdminController {
  @Get('overview') async overview(@Req() req: Request) {
    admin(await actor(req));
    const [assets, events, orders, incidents, journals, organizations, outbox, money] =
      await Promise.all([
        pool.query(assetSelect + ' ORDER BY a.created_at DESC LIMIT 100'),
        pool.query('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100'),
        pool.query(
          'SELECT o.*,c.display_name,l.id as license_id,l.status as license_status FROM orders o JOIN assets a ON a.id=o.asset_id JOIN creators c ON c.id=a.creator_id LEFT JOIN licenses l ON l.order_id=o.id ORDER BY o.created_at DESC LIMIT 100',
        ),
        pool.query('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 100'),
        pool.query(
          'SELECT j.*,json_agg(e.*) as entries FROM journals j JOIN ledger_entries e ON e.journal_id=j.id GROUP BY j.id ORDER BY j.created_at DESC LIMIT 100',
        ),
        pool.query('SELECT * FROM organizations'),
        pool.query("SELECT * FROM outbox WHERE status<>'done'"),
        listMoneyOverview(),
      ]);
    return {
      assets: assets.rows,
      events: events.rows,
      orders: orders.rows,
      incidents: incidents.rows,
      journals: journals.rows,
      organizations: organizations.rows,
      outbox: outbox.rows,
      transfers: money.transfers,
      disputes: money.disputes,
      payouts: money.payouts,
      money_note: money.note,
    };
  }
  @Post('assets/:id/review') async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = z
      .object({
        decision: z.enum(['approve', 'reject']),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(body);
    return mutate(user.id, 'review/' + id, idem(req), body, async (db) => {
      const a = (await db.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!a) throw new DomainError('NOT_FOUND', 404);
      if (a.status !== 'pending_review') throw new DomainError('INVALID_STATE', 409);
      await db.query(
        'INSERT INTO reviews(id,asset_id,actor_id,decision,reason) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), id, user.id, data.decision, data.reason],
      );
      await db.query('UPDATE assets SET relationship_status=$2,status=$3 WHERE id=$1', [
        id,
        data.decision === 'approve' ? 'reviewed' : 'rejected',
        data.decision === 'approve' ? 'draft' : 'rejected',
      ]);
      await db.query('UPDATE asset_files SET scan_status=$2 WHERE asset_id=$1', [
        id,
        data.decision === 'approve' ? 'clean' : 'rejected',
      ]);
      await audit(db, user.id, 'asset.sandbox_reviewed', id, data);
      return { reviewed: true, sandbox: true };
    });
  }
  @Post('assets/:id/suspend') async suspend(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = reasonSchema.parse(body);
    return mutate(user.id, 'suspend/' + id, idem(req), body, async (db) => {
      const r = await db.query("UPDATE assets SET status='suspended' WHERE id=$1 RETURNING id", [
        id,
      ]);
      if (!r.rowCount) throw new DomainError('NOT_FOUND', 404);
      await audit(db, user.id, 'asset.suspended', id, data);
      return { status: 'suspended' };
    });
  }
  @Post('licenses/:id/status') async status(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = z
      .object({
        status: z.enum(['suspended', 'revoked', 'issued']),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(body);
    return mutate(user.id, 'status/' + id, idem(req), body, async (db) => {
      const l = (await db.query('SELECT * FROM licenses WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!l) throw new DomainError('NOT_FOUND', 404);
      if (l.status === 'revoked') throw new DomainError('REVOCATION_FINAL', 409);
      await db.query('UPDATE licenses SET status=$2 WHERE id=$1', [id, data.status]);
      await db.query(
        'INSERT INTO license_status_events(id,license_id,actor_id,status,reason) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), id, user.id, data.status, data.reason],
      );
      await audit(db, user.id, 'license.status_changed', id, data);
      return { status: data.status };
    });
  }
  @Post('orders/:id/refund') async refund(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = reasonSchema.parse(body);
    return mutate(user.id, 'refund/' + id, idem(req), body, (db) =>
      requestRefund(db, user, id, data.reason),
    );
  }
  @Post('organizations/:id/verify') async org(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = reasonSchema.parse(body);
    return mutate(user.id, 'orgverify/' + id, idem(req), body, async (db) => {
      if (
        !(await db.query('UPDATE organizations SET verified=true WHERE id=$1 RETURNING id', [id]))
          .rowCount
      )
        throw new DomainError('NOT_FOUND', 404);
      await audit(db, user.id, 'organization.sandbox_verified', id, data);
      return { verified: true, sandbox: true };
    });
  }
  @Post('incidents/:id/resolve') async resolve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = reasonSchema.parse(body);
    return mutate(user.id, 'resolve/' + id, idem(req), body, async (db) => {
      if (
        !(await db.query("UPDATE incidents SET status='resolved' WHERE id=$1 RETURNING id", [id]))
          .rowCount
      )
        throw new DomainError('NOT_FOUND', 404);
      await audit(db, user.id, 'incident.resolved', id, data);
      return { status: 'resolved' };
    });
  }
  @Get('reconciliation') async reconcile(@Req() req: Request) {
    admin(await actor(req));
    // Internal double-entry check only — never triggers Stripe balance import.
    const [unbalanced, unissued, failed, openDisputes] = await Promise.all([
      pool.query(
        "SELECT j.id FROM journals j LEFT JOIN ledger_entries e ON e.journal_id=j.id GROUP BY j.id HAVING count(e.id)<2 OR coalesce(sum(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END),0)<>0",
      ),
      pool.query(
        "SELECT id,status FROM orders WHERE status IN ('paid','issuing','paid_requires_review')",
      ),
      pool.query("SELECT id,error FROM provider_events WHERE status='failed'"),
      pool.query(
        "SELECT id,provider_ref,status,review_status FROM disputes WHERE review_status IN ('open','escalated')",
      ),
    ]);
    return {
      checked_at: new Date().toISOString(),
      unbalanced: unbalanced.rows,
      unissued: unissued.rows,
      failed_events: failed.rows,
      open_disputes: openDisputes.rows,
      provider_reconciliation:
        config.payments === 'sandbox'
          ? 'sandbox_internal_only'
          : 'use_POST_/v1/admin/reconciliation/external',
      note: 'Este endpoint solo equilibra journals locales; la conciliación Stripe es POST /v1/admin/reconciliation/external',
    };
  }
  @Get('reconciliation/external') async externalReconStatus(@Req() req: Request) {
    admin(await actor(req));
    return listExternalReconciliation();
  }
  @Post('reconciliation/external') async runExternalRecon(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    const data = z
      .object({
        account_ref: z.string().min(1).max(128).optional(),
        recover_events: z.boolean().optional(),
      })
      .strict()
      .parse(body ?? {});
    // Not wrapped in mutate/transaction: import can span many Stripe pages.
    return runExternalReconciliation({
      accountRef: data.account_ref,
      recoverEvents: data.recover_events,
      actorId: user.id,
    });
  }
  @Post('reconciliation/differences/:id/ack') async ackDiff(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = reasonSchema.parse(body);
    return mutate(user.id, 'recon-ack/' + id, idem(req), body, () =>
      acknowledgeDifference(user, id, data.reason),
    );
  }
  @Get('money') async money(@Req() req: Request) {
    admin(await actor(req));
    return listMoneyOverview();
  }
  @Post('disputes/:id/review') async disputeReview(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = await actor(req);
    admin(user);
    uuid(id);
    const data = z
      .object({
        decision: z.enum(['acknowledge', 'escalate', 'close']),
        note: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(body);
    return mutate(user.id, 'dispute-review/' + id, idem(req), body, (db) =>
      reviewDispute(db, user, id, data),
    );
  }
}
/** RightsNet Connect (partner-gated). Not Stripe Connect. */
@Controller('v1/platform')
export class PlatformController {
  @Get('search') async search(@Req() req: Request, @Query() q: Record<string, unknown>) {
    assertPlatformApiAccess(await actor(req));
    return platformSearch(q);
  }
  @Post('check') @HttpCode(200) async check(@Req() req: Request, @Body() body: unknown) {
    assertPlatformApiAccess(await actor(req));
    return platformCheck(body);
  }
}
@Controller('v1/webhooks')
export class WebhooksController {
  @Post('stripe') @HttpCode(200) async stripe(@Req() req: Request & { rawBody?: Buffer }) {
    if (config.payments !== 'stripe' || !process.env.STRIPE_WEBHOOK_SECRET)
      throw new DomainError('STRIPE_NOT_CONFIGURED', 503);
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !req.rawBody)
      throw new DomainError('INVALID_SIGNATURE', 400);
    let event;
    try {
      event = stripeClient().webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new DomainError('INVALID_SIGNATURE', 400);
    }
    await ingestStripeCheckoutEvent(event);
    if (isConnectAccountEvent(event)) await ingestConnectAccountEvent(event);
    if (isRefundEvent(event)) await ingestStripeRefundEvent(event);
    if (isMoneyMovementEvent(event)) await ingestMoneyMovementEvent(event);
    if (isIdentityEvent(event)) await ingestIdentityEvent(event);
    return { received: true };
  }

  /**
   * Thin Accounts v2 notifications (requirements / capability).
   * Use Stripe CLI: --forward-thin-to .../v1/webhooks/stripe/thin
   * Secret: STRIPE_THIN_WEBHOOK_SECRET or fallback STRIPE_WEBHOOK_SECRET.
   */
  @Post('stripe/thin') @HttpCode(200) async stripeThin(
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    if (config.payments !== 'stripe')
      throw new DomainError('STRIPE_NOT_CONFIGURED', 503);
    const secret =
      process.env.STRIPE_THIN_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret)
      throw new DomainError(
        'STRIPE_NOT_CONFIGURED',
        503,
        'Falta STRIPE_THIN_WEBHOOK_SECRET o STRIPE_WEBHOOK_SECRET.',
      );
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !req.rawBody)
      throw new DomainError('INVALID_SIGNATURE', 400);
    return ingestThinConnectNotification(req.rawBody, signature, secret);
  }
}
