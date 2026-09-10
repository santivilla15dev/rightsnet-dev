import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { campaignAccess, findCampaign } from './campaigns.js';
import { closeDealRequestsForTalent } from './campaign-deal-builder.js';
import { mutate } from '../common/idempotency.js';

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
const inventorySchema = pageSchema
  .extend({
    organization_id: z.string().uuid(),
    q: z.string().trim().max(100).default(''),
    source: z.enum(['all', 'marketplace', 'existing']).default('all'),
    availability: z.enum(['all', 'current', 'expiring', 'not_current']).default('all'),
  })
  .strict();
type Grant = {
  id: string;
  asset_id: string;
  source_type: string;
  source_id: string;
  status: string;
  valid_from: Date | string;
  valid_until: Date | string;
  payload: {
    rights?: unknown;
    territories?: unknown;
    industry?: unknown;
    approval?: unknown;
    scope_snapshot?: { channels?: unknown; duration_days?: unknown };
  };
};
export function grantTemporalStatus(
  grant: Pick<Grant, 'status' | 'valid_from' | 'valid_until'>,
  now: Date,
) {
  if (grant.status !== 'ACTIVE') return grant.status;
  if (new Date(grant.valid_until).getTime() <= now.getTime()) return 'EXPIRED';
  if (new Date(grant.valid_from).getTime() > now.getTime()) return 'SCHEDULED';
  return 'CURRENT';
}
function projectGrant(grant: Grant, now: Date) {
  return {
    id: grant.id,
    source_type: grant.source_type,
    source_id: grant.source_id,
    status: grant.status,
    temporal_status: grantTemporalStatus(grant, now),
    valid_from: grant.valid_from,
    valid_until: grant.valid_until,
    rights: grant.payload.rights ?? null,
    territories: grant.payload.territories ?? null,
    industry: grant.payload.industry ?? null,
    approval: grant.payload.approval ?? null,
    channels: grant.payload.scope_snapshot?.channels ?? null,
    duration_days: grant.payload.scope_snapshot?.duration_days ?? null,
  };
}
const currentSql = "g.status='ACTIVE' AND g.valid_from <= $2 AND g.valid_until > $2";
const sourceSql =
  "($3='all' OR g.source_type=CASE WHEN $3='marketplace' THEN 'MARKETPLACE_LICENSE' ELSE 'EXISTING_AGREEMENT' END)";

export async function talentInventory(user: Actor, query: unknown, now = new Date()) {
  const f = inventorySchema.parse(query);
  const can_edit = await campaignAccess(pool, user, f.organization_id);
  const rows = (
    await pool.query(
      `SELECT a.id AS asset_id, a.status AS asset_status, c.display_name
     FROM assets a JOIN creators c ON c.id=a.creator_id
     WHERE (EXISTS(SELECT 1 FROM rights_grants g WHERE g.asset_id=a.id AND g.grantee_organization_id=$1 AND ${sourceSql})
       OR ($3 IN ('all','existing') AND EXISTS(SELECT 1 FROM external_agreements e WHERE e.asset_id=a.id AND e.organization_id=$1 AND e.status IN ('draft','pending_confirm'))))
     AND ($4='all'
       OR ($4='current' AND EXISTS(SELECT 1 FROM rights_grants g WHERE g.asset_id=a.id AND g.grantee_organization_id=$1 AND ${sourceSql} AND ${currentSql}))
       OR ($4='expiring' AND EXISTS(SELECT 1 FROM rights_grants g WHERE g.asset_id=a.id AND g.grantee_organization_id=$1 AND ${sourceSql} AND ${currentSql} AND g.valid_until <= $2::timestamptz + interval '30 days'))
       OR ($4='not_current' AND NOT EXISTS(SELECT 1 FROM rights_grants g WHERE g.asset_id=a.id AND g.grantee_organization_id=$1 AND ${sourceSql} AND ${currentSql})))
     AND strpos(lower(c.display_name), lower($5)) > 0
     ORDER BY c.display_name, a.id LIMIT $6 OFFSET $7`,
      [f.organization_id, now, f.source, f.availability, f.q, f.limit + 1, f.offset],
    )
  ).rows as { asset_id: string; asset_status: string; display_name: string }[];
  const items = rows.slice(0, f.limit);
  const ids = items.map((i) => i.asset_id);
  const [grants, pending] = await Promise.all([
    pool.query(
      `SELECT g.* FROM rights_grants g WHERE g.grantee_organization_id=$1 AND g.asset_id=ANY($2::uuid[])
      AND ($3='all' OR g.source_type=CASE WHEN $3='marketplace' THEN 'MARKETPLACE_LICENSE' ELSE 'EXISTING_AGREEMENT' END)
      ORDER BY g.valid_until DESC,g.id`,
      [f.organization_id, ids, f.source],
    ),
    pool.query(
      `SELECT asset_id,count(*)::int AS count FROM external_agreements WHERE organization_id=$1
      AND asset_id=ANY($2::uuid[]) AND status IN ('draft','pending_confirm') GROUP BY asset_id`,
      [f.organization_id, ids],
    ),
  ]);
  return {
    organization_id: f.organization_id,
    can_edit,
    evaluated_at: now.toISOString(),
    items: items.map((item) => ({
      ...item,
      grants: (grants.rows as Grant[])
        .filter((g) => g.asset_id === item.asset_id)
        .map((g) => projectGrant(g, now)),
      pending_agreements:
        f.source === 'marketplace'
          ? 0
          : (pending.rows.find((p) => p.asset_id === item.asset_id)?.count ?? 0),
    })),
    next_offset: rows.length > f.limit ? f.offset + f.limit : null,
  };
}

export async function campaignTalent(
  user: Actor,
  id: string,
  query: unknown = {},
  now = new Date(),
) {
  const f = pageSchema.strict().parse(query);
  const campaign = await findCampaign(pool, user, id);
  const rows = (
    await pool.query(
      `SELECT t.asset_id,t.selected_grant_id,t.created_at,c.display_name,a.status AS asset_status,
      g.id,g.source_type,g.source_id,g.status,g.valid_from,g.valid_until,g.payload
     FROM campaign_talent t JOIN assets a ON a.id=t.asset_id JOIN creators c ON c.id=a.creator_id
     LEFT JOIN rights_grants g ON g.id=t.selected_grant_id AND g.asset_id=t.asset_id AND g.grantee_organization_id=$2
     WHERE t.campaign_id=$1 ORDER BY t.created_at,t.asset_id LIMIT $3 OFFSET $4`,
      [id, campaign.organization_id, f.limit + 1, f.offset],
    )
  ).rows;
  return {
    campaign_id: id,
    can_edit: campaign.can_edit,
    revision: campaign.revision,
    evaluated_at: now.toISOString(),
    items: rows.slice(0, f.limit).map((row) => ({
      asset_id: row.asset_id,
      display_name: row.display_name,
      asset_status: row.asset_status,
      selected_grant_id: row.selected_grant_id,
      selected_grant: row.id ? projectGrant(row, now) : null,
      added_at: row.created_at,
    })),
    next_offset: rows.length > f.limit ? f.offset + f.limit : null,
  };
}

async function eligibleAsset(db: DB, org: string, asset: string) {
  const row = (
    await db.query(
      `SELECT a.id FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1 AND (
      EXISTS(SELECT 1 FROM rights_grants WHERE asset_id=a.id AND grantee_organization_id=$2)
      OR EXISTS(SELECT 1 FROM external_agreements WHERE asset_id=a.id AND organization_id=$2 AND status IN ('draft','pending_confirm'))
      OR (a.status='published' AND a.relationship_status='reviewed' AND a.policy_id IS NOT NULL
        AND c.identity_status='verified' AND c.identity_expires_at>now() AND c.adult_verified=true))`,
      [asset, org],
    )
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
}
export async function addCampaignTalent(user: Actor, id: string, body: unknown, key?: string) {
  const data = z
    .object({
      asset_id: z.string().uuid(),
      selected_grant_id: z.string().uuid().nullable().default(null),
    })
    .strict()
    .parse(body);
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/talent`, key, data, async (db) => {
    const campaign = await findCampaign(db, user, id, true);
    await eligibleAsset(db, campaign.organization_id, data.asset_id);
    if (
      data.selected_grant_id &&
      !(
        await db.query(
          'SELECT 1 FROM rights_grants WHERE id=$1 AND asset_id=$2 AND grantee_organization_id=$3',
          [data.selected_grant_id, data.asset_id, campaign.organization_id],
        )
      ).rowCount
    )
      throw new DomainError('NOT_FOUND', 404);
    // Serialize additions/removals for this campaign, including same-key retry races.
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const prior = (
      await db.query(
        'SELECT selected_grant_id FROM campaign_talent WHERE campaign_id=$1 AND asset_id=$2',
        [id, data.asset_id],
      )
    ).rows[0];
    if (prior) {
      if (prior.selected_grant_id !== data.selected_grant_id)
        throw new DomainError(
          'TALENT_ALREADY_LINKED',
          409,
          'Este talento ya está vinculado con otra selección de derechos.',
        );
      return { asset_id: data.asset_id, linked: true, changed: false };
    }
    await db.query(
      'INSERT INTO campaign_talent(campaign_id,asset_id,selected_grant_id,added_by) VALUES($1,$2,$3,$4)',
      [id, data.asset_id, data.selected_grant_id, user.id],
    );
    const updated = (
      await db.query(
        'UPDATE campaigns SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',
        [id],
      )
    ).rows[0];
    await audit(db, user.id, 'campaign.talent_added', id, { ...data, revision: updated.revision });
    return { asset_id: data.asset_id, linked: true, changed: true };
  });
}
export async function removeCampaignTalent(
  user: Actor,
  id: string,
  asset: string,
  body: unknown,
  key?: string,
) {
  z.string().uuid().parse(asset);
  z.object({}).strict().parse(body);
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/talent/${asset}/remove`, key, {}, async (db) => {
    await findCampaign(db, user, id, true);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const removed = await db.query(
      'DELETE FROM campaign_talent WHERE campaign_id=$1 AND asset_id=$2',
      [id, asset],
    );
    if (removed.rowCount) {
      await closeDealRequestsForTalent(db, id, asset);
      const updated = (
        await db.query(
          'UPDATE campaigns SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',
          [id],
        )
      ).rows[0];
      await audit(db, user.id, 'campaign.talent_removed', id, {
        asset_id: asset,
        revision: updated.revision,
      });
    }
    return { asset_id: asset, linked: false, changed: !!removed.rowCount };
  });
}
