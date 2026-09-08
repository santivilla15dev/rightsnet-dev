import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed, demoIds } from '../packages/db/seed.js';
import {
  backfillMarketplaceRightsGrants,
  upsertRightsGrantFromLicense,
} from '../packages/db/rights-grants.js';
import {
  buildMarketplaceGrantPayload,
  grantDimensionsFromScope,
  type Usage,
} from '../packages/domain/src/index.js';
import type { Actor } from '../apps/api/src/common/auth.js';
import {
  createRequest,
  createQuote,
  createOrder,
  acceptOrder,
} from '../apps/api/src/modules/licensing.js';
import {
  checkout,
  simulatePayment,
  processPaymentEvents,
  issueLicenses,
} from '../apps/api/src/modules/payments.js';
import { listRightsGrants, getRightsGrant } from '../apps/api/src/modules/rights-grants.js';

describe('RightsGrant marketplace projection', () => {
  let buyer: Actor;
  let creator: Actor;
  let assetId: string;

  const usage = (): Usage => ({
    campaign_name: 'Grant ' + randomUUID().slice(0, 8),
    operation: 'synthetic_video',
    purpose: 'commercial_advertising',
    category: 'beauty',
    territories: ['ES'],
    channels: ['instagram'],
    duration_days: 30,
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    exclusivity: 'none',
    sublicensing: false,
    training: false,
    voice_clone: false,
  });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!url.pathname.endsWith('_test'))
      throw new Error('Tests require a dedicated database ending _test');
    const name = url.pathname.slice(1);
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe test DB name');
    url.pathname = '/postgres';
    const management = new pg.Pool({ connectionString: url.toString() });
    if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
      await management.query('CREATE DATABASE ' + name);
    await management.end();
    await migrate();
    await seed();
    const users = (await pool.query('SELECT * FROM users')).rows;
    buyer = users.find((u) => u.id === demoIds.buyer);
    creator = users.find((u) => u.id === demoIds.creator);
    await pool.query("UPDATE assets SET status='published' WHERE relationship_status='reviewed'");
    assetId = (
      await pool.query(
        'SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE c.user_id=$1',
        [creator.id],
      )
    ).rows[0].id;
  });

  afterAll(() => pool.end());

  it('buildMarketplaceGrantPayload derives dims from frozen scope (not live policy)', () => {
    const grantId = randomUUID();
    const payload = buildMarketplaceGrantPayload({
      grantId,
      grantorUserId: demoIds.creator,
      granteeOrganizationId: demoIds.org,
      assetId: demoIds.rightsCoreAsset,
      licenseId: randomUUID(),
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      status: 'ACTIVE',
      scope: {
        operation: 'synthetic_video',
        purpose: 'commercial_advertising',
        category: 'beauty',
        territories: ['ES', 'DE'],
      },
    });
    expect(payload.schema_version).toBe('rightsnet.rights-grant/0.1');
    expect(payload.source.type).toBe('MARKETPLACE_LICENSE');
    expect(payload.rights.synthetic_video).toBe('ALLOW');
    expect(payload.industry).toEqual(['beauty']);
    expect(payload.territories).toEqual(['ES', 'DE']);
    expect(payload.grantee_organization_id).toBe(demoIds.org);
    const dims = grantDimensionsFromScope({ industry: 'sportswear', generation_type: 'synthetic_image' });
    expect(dims.industry).toEqual(['sportswear']);
    expect(dims.rights.synthetic_image).toBe('ALLOW');
  });

  it('issueLicenses projects MARKETPLACE_LICENSE grant; idempotent; Adidas org empty', async () => {
    const r = await transaction((db) =>
      createRequest(db, buyer, {
        organization_id: demoIds.org,
        asset_id: assetId,
        usage: usage(),
      }),
    );
    const q = await transaction((db) => createQuote(db, buyer, { request_id: r.id }));
    const o = await transaction((db) => createOrder(db, buyer, { quote_id: q.id }));
    await transaction((db) =>
      acceptOrder(db, buyer, o.id, { accepted: true, document_hash: o.contract_hash }),
    );
    await checkout(buyer, o.id);
    await simulatePayment(buyer, o.id, true);
    await processPaymentEvents();
    await issueLicenses();

    const license = (
      await pool.query('SELECT * FROM licenses WHERE order_id=$1', [o.id])
    ).rows[0];
    expect(license).toBeTruthy();

    const grants = (
      await pool.query(
        "SELECT * FROM rights_grants WHERE source_type='MARKETPLACE_LICENSE' AND source_id=$1",
        [license.id],
      )
    ).rows;
    expect(grants).toHaveLength(1);
    expect(grants[0].grantee_organization_id).toBe(demoIds.org);
    expect(grants[0].asset_id).toBe(assetId);
    expect(grants[0].status).toBe('ACTIVE');
    expect(grants[0].payload.schema_version).toBe('rightsnet.rights-grant/0.1');

    await upsertRightsGrantFromLicense(pool, {
      license,
      order: {
        id: o.id,
        organization_id: o.organization_id,
        asset_id: o.asset_id,
        scope: o.scope,
      },
      asset: { id: assetId, user_id: creator.id },
    });
    const again = (
      await pool.query(
        "SELECT count(*)::int AS n FROM rights_grants WHERE source_type='MARKETPLACE_LICENSE' AND source_id=$1",
        [license.id],
      )
    ).rows[0].n;
    expect(again).toBe(1);

    const nike = await listRightsGrants({
      organization_id: demoIds.org,
      asset_id: assetId,
    });
    expect(nike.items.length).toBeGreaterThanOrEqual(1);
    expect(nike.surface).toBe('rights_grant');

    const adidas = await listRightsGrants({
      organization_id: demoIds.otherOrg,
      asset_id: assetId,
    });
    expect(adidas.items).toHaveLength(0);

    const one = await getRightsGrant(grants[0].id);
    expect(one.id).toBe(grants[0].id);

    const bf = await backfillMarketplaceRightsGrants(pool);
    expect(bf.created).toBe(0);
  });

  it('ships report-output but not public generation verify routes', async () => {
    const { readFile } = await import('node:fs/promises');
    const controllers = await readFile(
      new URL('../apps/api/src/modules/controllers.ts', import.meta.url),
      'utf8',
    );
    expect(controllers).toMatch(/authorize-generation/);
    expect(controllers).toMatch(/report-output/);
    expect(controllers).not.toMatch(/verify-generation/);
  });
});
