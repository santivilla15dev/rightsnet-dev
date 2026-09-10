import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { findCampaign } from './campaigns.js';
import { getCampaignClearance } from './campaign-clearance.js';
import { getCampaignFlight } from './campaign-flight.js';
import { mutate } from '../common/idempotency.js';
import type { Actor } from '../common/auth.js';

const PasTokenSchema = z.string().regex(/^RN-PAS-\d{4}-\d{6}$/);
const allowEntry = z
  .object({
    type: z.enum(['email', 'org']),
    value: z.string().trim().min(1).max(320),
  })
  .strict();
const issueBody = z
  .object({
    allowlist: z.array(allowEntry).min(1).max(20),
    expires_at: z.iso.datetime(),
    label: z.string().max(80).optional().default(''),
  })
  .strict();

async function nextPublicPassportToken(db: DB): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = (
    await db.query(
      `INSERT INTO campaign_passport_seq(year, last_value) VALUES($1, 1)
       ON CONFLICT (year) DO UPDATE SET last_value = campaign_passport_seq.last_value + 1
       RETURNING last_value`,
      [year],
    )
  ).rows[0] as { last_value: number };
  return `RN-PAS-${year}-${String(row.last_value).padStart(6, '0')}`;
}

function normalizeAllowlist(list: z.infer<typeof allowEntry>[]) {
  const seen = new Set<string>();
  const out: { type: 'email' | 'org'; value: string }[] = [];
  for (const entry of list) {
    const value =
      entry.type === 'email' ? entry.value.trim().toLowerCase() : entry.value.trim().toLowerCase();
    if (entry.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new DomainError('VALIDATION', 400, 'Email de allowlist inválido.');
    if (entry.type === 'org') z.string().uuid().parse(value);
    const key = `${entry.type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: entry.type, value });
  }
  if (!out.length) throw new DomainError('VALIDATION', 400, 'Allowlist obligatoria.');
  return out;
}

function mapRow(row: Record<string, unknown>, now = new Date()) {
  const expires = new Date(row.expires_at as string | Date);
  const status =
    row.status === 'REVOKED'
      ? 'REVOKED'
      : expires.getTime() <= now.getTime()
        ? 'EXPIRED'
        : (row.status as string);
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    organization_id: String(row.organization_id),
    public_token: String(row.public_token),
    status,
    allowlist: row.allowlist as { type: string; value: string }[],
    label: String(row.label ?? ''),
    expires_at: expires.toISOString(),
    revoked_at: row.revoked_at ? new Date(row.revoked_at as string | Date).toISOString() : null,
    created_at: new Date(row.created_at as string | Date).toISOString(),
    verify_path: `/verify/campaign-passport/${row.public_token}`,
  };
}

async function actorById(id: string): Promise<Actor> {
  const row = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  return row as Actor;
}

async function bumpCampaign(
  db: DB,
  user: Actor,
  campaignId: string,
  action: string,
  details: object,
) {
  const updated = (
    await db.query(
      'UPDATE campaigns SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',
      [campaignId],
    )
  ).rows[0];
  await audit(db, user.id, action, campaignId, { ...details, revision: updated.revision });
  return updated.revision as number;
}

export async function listCampaignPassports(user: Actor, id: string) {
  const campaign = await findCampaign(pool, user, id);
  const rows = (
    await pool.query(
      `SELECT * FROM campaign_passports WHERE campaign_id=$1 ORDER BY created_at DESC, id DESC`,
      [id],
    )
  ).rows;
  return {
    campaign_id: id,
    can_edit: campaign.can_edit,
    items: rows.map((r) => mapRow(r)),
  };
}

export async function issueCampaignPassport(user: Actor, id: string, body: unknown, key?: string) {
  const data = issueBody.parse(body);
  const allowlist = normalizeAllowlist(data.allowlist);
  const expires = new Date(data.expires_at);
  const now = new Date();
  if (!(expires.getTime() > now.getTime()))
    throw new DomainError('VALIDATION', 400, 'La caducidad debe ser futura.');
  if (expires.getTime() > now.getTime() + 30 * 86400000)
    throw new DomainError('VALIDATION', 400, 'La caducidad máxima es de 30 días.');
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/passports`, key, data, async (db) => {
    const campaign = await findCampaign(db, user, id, true);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const active = (
      await db.query(
        `SELECT count(*)::int AS n FROM campaign_passports WHERE campaign_id=$1 AND status='ACTIVE' AND expires_at > now()`,
        [id],
      )
    ).rows[0].n;
    if (active >= 10)
      throw new DomainError('PASSPORT_LIMIT', 409, 'Máximo de 10 passports activos por campaña.');
    const token = await nextPublicPassportToken(db);
    const row = (
      await db.query(
        `INSERT INTO campaign_passports(
           id,campaign_id,organization_id,public_token,status,allowlist,label,expires_at,created_by)
         VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8) RETURNING *`,
        [
          randomUUID(),
          id,
          campaign.organization_id,
          token,
          JSON.stringify(allowlist),
          data.label,
          expires.toISOString(),
          user.id,
        ],
      )
    ).rows[0];
    await bumpCampaign(db, user, id, 'campaign.passport_issued', {
      passport_id: row.id,
      public_token: token,
    });
    return mapRow(row);
  });
}

export async function revokeCampaignPassport(
  user: Actor,
  id: string,
  passportId: string,
  body: unknown,
  key?: string,
) {
  z.string().uuid().parse(passportId);
  z.object({}).strict().parse(body ?? {});
  await findCampaign(pool, user, id, true);
  return mutate(
    user.id,
    `campaigns/${id}/passports/${passportId}/revoke`,
    key,
    {},
    async (db) => {
      await findCampaign(db, user, id, true);
      await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
      const row = (
        await db.query(`SELECT * FROM campaign_passports WHERE id=$1 AND campaign_id=$2`, [
          passportId,
          id,
        ])
      ).rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 404);
      if (row.status === 'REVOKED') return mapRow(row);
      const updated = (
        await db.query(
          `UPDATE campaign_passports
           SET status='REVOKED',revoked_at=now(),revoked_by=$2,updated_at=now()
           WHERE id=$1 AND status='ACTIVE' RETURNING *`,
          [passportId, user.id],
        )
      ).rows[0];
      if (!updated) return mapRow(row);
      await bumpCampaign(db, user, id, 'campaign.passport_revoked', {
        passport_id: passportId,
        public_token: updated.public_token,
      });
      return mapRow(updated);
    },
  );
}

export async function publicVerifyCampaignPassport(token: string) {
  const publicToken = PasTokenSchema.parse(token);
  const row = (
    await pool.query(`SELECT * FROM campaign_passports WHERE public_token=$1`, [publicToken])
  ).rows[0];
  // Generic 404: invalid, revoked, or expired — do not distinguish.
  if (!row || row.status === 'REVOKED') throw new DomainError('NOT_FOUND', 404);
  const now = new Date();
  if (new Date(row.expires_at).getTime() <= now.getTime()) throw new DomainError('NOT_FOUND', 404);

  const issuer = await actorById(row.created_by);
  const campaign = await findCampaign(pool, issuer, row.campaign_id);
  const clearance = await getCampaignClearance(issuer, row.campaign_id, now);
  const flight = await getCampaignFlight(issuer, row.campaign_id, now);
  const openDeal = (
    await pool.query(
      `SELECT count(*)::int AS n FROM campaign_deal_requests
       WHERE campaign_id=$1 AND status='SENT'`,
      [row.campaign_id],
    )
  ).rows[0].n;
  const talentCount = (
    await pool.query(`SELECT count(*)::int AS n FROM campaign_talent WHERE campaign_id=$1`, [
      row.campaign_id,
    ])
  ).rows[0].n;

  return {
    token: publicToken,
    status: 'ACTIVE' as const,
    evaluated_at: now.toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
    campaign: { id: campaign.id, name: campaign.name },
    clearance: { status: clearance.status, score: clearance.score },
    preflight: { status: flight.preflight.status },
    postflight: { status: flight.postflight.status },
    talent_count: talentCount,
    open_deal_requests: openDeal,
    flags: {
      authority: false,
      media_verified: false,
      legal_clearance: false,
    },
  };
}
