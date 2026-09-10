import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import {
  CampaignUsageSchema,
  type CampaignUsage,
} from '../../../../packages/domain/src/rights-core/campaign-clearance.js';
import {
  evaluateCampaignClearance,
  type ClearanceTalent,
} from '../../../../packages/domain/src/rights-core/campaign-clearance.js';
import { findCampaign } from './campaigns.js';
import { getCampaignClearance } from './campaign-clearance.js';
import { mutate } from '../common/idempotency.js';
import type { Actor } from '../common/auth.js';

const GAP_REASONS = new Set([
  'USAGE_FIELD_MISSING',
  'GRANT_SCOPE_MISSING',
  'GRANT_DURATION_MISSING',
  'USAGE_WINDOW_MISSING',
  'NO_SELECTED_GRANT',
  'INVALID_GRANT',
  'GRANT_APPROVAL_REQUIRED',
  'RIGHT_DENIED',
  'RIGHT_UNSPECIFIED',
  'RIGHT_APPROVAL_REQUIRED',
  'SCOPE_OUT_OF_BOUNDS',
  'DURATION_OUT_OF_SCOPE',
  'WINDOW_OUT_OF_SCOPE',
  'GRANT_NOT_ACTIVE',
  'GRANT_EXPIRED',
  'GRANT_NOT_STARTED',
]);
const REVIEW_ONLY = new Set(['NO_SELECTED_GRANT', 'INVALID_GRANT', 'GRANT_APPROVAL_REQUIRED']);

type Gap = { dimension: string; reason: string; desired: unknown };
type ClearanceItem = {
  asset_id: string;
  display_name: string;
  selected_grant_id: string | null;
  status: string;
  checks: { dimension: string; status: string; reason: string }[];
};

function desiredFor(dimension: string, usage: CampaignUsage): unknown {
  if (dimension === 'industry') return usage.industry ?? null;
  if (dimension === 'operation') return usage.operation ?? null;
  if (dimension === 'purpose') return usage.purpose ?? null;
  if (dimension === 'territories') return usage.territories ?? null;
  if (dimension === 'channels') return usage.channels ?? null;
  if (dimension === 'window')
    return usage.start_at || usage.duration_days
      ? { start_at: usage.start_at ?? null, duration_days: usage.duration_days ?? null }
      : null;
  if (dimension === 'duration') return usage.duration_days ?? null;
  return null;
}

export function gapsFromClearanceItem(item: ClearanceItem, usage: CampaignUsage): Gap[] {
  const out: Gap[] = [];
  for (const check of item.checks) {
    if (check.status === 'ALLOW' || !GAP_REASONS.has(check.reason)) continue;
    out.push({
      dimension: check.dimension,
      reason: check.reason,
      desired: REVIEW_ONLY.has(check.reason) ? null : desiredFor(check.dimension, usage),
    });
  }
  return out;
}

function stableGaps(gaps: Gap[]) {
  return JSON.stringify(
    [...gaps].sort((a, b) =>
      `${a.dimension}:${a.reason}`.localeCompare(`${b.dimension}:${b.reason}`),
    ),
  );
}

const draftBody = z
  .object({
    asset_id: z.string().uuid(),
    desired_usage: CampaignUsageSchema,
    note: z.string().max(2000).optional().default(''),
    expected_revision: z.number().int().positive().optional(),
  })
  .strict();

async function bumpCampaign(db: DB, user: Actor, campaignId: string, action: string, details: object) {
  const updated = (
    await db.query(
      'UPDATE campaigns SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',
      [campaignId],
    )
  ).rows[0];
  await audit(db, user.id, action, campaignId, { ...details, revision: updated.revision });
  return updated.revision as number;
}

async function loadTalentGrant(db: DB, campaignId: string, assetId: string, orgId: string) {
  const row = (
    await db.query(
      `SELECT t.asset_id,t.selected_grant_id FROM campaign_talent t
       WHERE t.campaign_id=$1 AND t.asset_id=$2`,
      [campaignId, assetId],
    )
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  if (row.selected_grant_id) {
    const grant = (
      await db.query(
        `SELECT id FROM rights_grants WHERE id=$1 AND asset_id=$2 AND grantee_organization_id=$3`,
        [row.selected_grant_id, assetId, orgId],
      )
    ).rows[0];
    if (!grant) throw new DomainError('NOT_FOUND', 404);
  }
  return row as { asset_id: string; selected_grant_id: string | null };
}

async function clearanceItems(db: DB, campaignId: string, orgId: string, usage: unknown, now = new Date()) {
  const rows = (
    await db.query(
      `SELECT t.asset_id,t.selected_grant_id,c.display_name,g.id,g.status,g.valid_from,g.valid_until,g.payload
       FROM campaign_talent t JOIN assets a ON a.id=t.asset_id JOIN creators c ON c.id=a.creator_id
       LEFT JOIN rights_grants g ON g.id=t.selected_grant_id AND g.asset_id=t.asset_id AND g.grantee_organization_id=$2
       WHERE t.campaign_id=$1 ORDER BY t.asset_id`,
      [campaignId, orgId],
    )
  ).rows;
  const talents: ClearanceTalent[] = rows.map((r) => ({
    asset_id: r.asset_id,
    display_name: r.display_name,
    selected_grant_id: r.selected_grant_id,
    grant: r.id
      ? {
          id: r.id,
          status: r.status,
          valid_from: new Date(r.valid_from).toISOString(),
          valid_until: new Date(r.valid_until).toISOString(),
          payload: r.payload,
        }
      : null,
  }));
  return evaluateCampaignClearance(
    CampaignUsageSchema.parse(usage ?? {}),
    talents,
    orgId,
    now.toISOString(),
  ).items as ClearanceItem[];
}

export async function getDealBuilder(user: Actor, id: string) {
  const clearance = await getCampaignClearance(user, id);
  const campaign = await findCampaign(pool, user, id);
  const requests = (
    await pool.query(
      `SELECT id,campaign_id,organization_id,asset_id,selected_grant_id,status,gaps,desired_usage,note,
              revision,created_by,updated_by,created_at,updated_at,sent_at
       FROM campaign_deal_requests WHERE campaign_id=$1
       ORDER BY updated_at DESC, id DESC LIMIT 100`,
      [id],
    )
  ).rows;
  const talent = (
    await pool.query(
      `SELECT t.asset_id,c.display_name,t.selected_grant_id
       FROM campaign_talent t JOIN assets a ON a.id=t.asset_id JOIN creators c ON c.id=a.creator_id
       WHERE t.campaign_id=$1 ORDER BY t.asset_id`,
      [id],
    )
  ).rows;
  const usage = CampaignUsageSchema.parse(clearance.usage ?? {});
  const items = (clearance.items as ClearanceItem[]).map((item) => {
    const suggested = gapsFromClearanceItem(item, usage);
    const draft = requests.find((r) => r.asset_id === item.asset_id && r.status === 'DRAFT');
    const stale_gaps = draft
      ? stableGaps(draft.gaps as Gap[]) !== stableGaps(suggested)
      : false;
    return {
      asset_id: item.asset_id,
      display_name: item.display_name,
      selected_grant_id: item.selected_grant_id,
      clearance_status: item.status,
      suggested_gaps: suggested,
      stale_gaps,
    };
  });
  return {
    campaign_id: id,
    revision: campaign.revision,
    can_edit: campaign.can_edit,
    clearance: {
      status: clearance.status,
      score: clearance.score,
      reason_codes: clearance.reason_codes,
      evaluated_at: clearance.evaluated_at,
    },
    talent: talent.map((t) => ({
      asset_id: t.asset_id,
      display_name: t.display_name,
      selected_grant_id: t.selected_grant_id,
    })),
    items,
    requests: requests.map((r) => ({
      id: r.id,
      asset_id: r.asset_id,
      selected_grant_id: r.selected_grant_id,
      status: r.status,
      gaps: r.gaps,
      desired_usage: r.desired_usage,
      note: r.note,
      revision: r.revision,
      stale_gaps:
        r.status === 'DRAFT'
          ? (() => {
              const item = items.find((i) => i.asset_id === r.asset_id);
              return item ? item.stale_gaps : true;
            })()
          : false,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    })),
    authority: false,
  };
}

export async function upsertDealRequest(user: Actor, id: string, body: unknown, key?: string) {
  const data = draftBody.parse(body);
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/deal-requests`, key, data, async (db) => {
    const campaign = await findCampaign(db, user, id, true);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const talent = await loadTalentGrant(db, id, data.asset_id, campaign.organization_id);
    const items = await clearanceItems(db, id, campaign.organization_id, campaign.usage);
    const item = items.find((i) => i.asset_id === data.asset_id);
    if (!item) throw new DomainError('NOT_FOUND', 404);
    const gaps = gapsFromClearanceItem(item, data.desired_usage);
    const existing = (
      await db.query(
        `SELECT * FROM campaign_deal_requests WHERE campaign_id=$1 AND asset_id=$2 AND status='DRAFT'`,
        [id, data.asset_id],
      )
    ).rows[0];
    if (existing) {
      if (data.expected_revision !== existing.revision)
        throw new DomainError(
          'DEAL_REQUEST_CONFLICT',
          409,
          'La solicitud ha cambiado. Recarga antes de guardar.',
        );
      const updated = (
        await db.query(
          `UPDATE campaign_deal_requests
           SET selected_grant_id=$2,gaps=$3,desired_usage=$4,note=$5,revision=revision+1,
               updated_by=$6,updated_at=now()
           WHERE id=$1 AND revision=$7 RETURNING *`,
          [
            existing.id,
            talent.selected_grant_id,
            JSON.stringify(gaps),
            JSON.stringify(data.desired_usage),
            data.note,
            user.id,
            data.expected_revision,
          ],
        )
      ).rows[0];
      if (!updated)
        throw new DomainError(
          'DEAL_REQUEST_CONFLICT',
          409,
          'La solicitud ha cambiado. Recarga antes de guardar.',
        );
      await bumpCampaign(db, user, id, 'campaign.deal_request_updated', {
        request_id: updated.id,
        asset_id: data.asset_id,
      });
      return updated;
    }
    const count = (
      await db.query('SELECT count(*)::int AS n FROM campaign_deal_requests WHERE campaign_id=$1', [
        id,
      ])
    ).rows[0].n;
    if (count >= 50)
      throw new DomainError('DEAL_REQUEST_LIMIT', 409, 'Máximo de 50 solicitudes por campaña.');
    const row = (
      await db.query(
        `INSERT INTO campaign_deal_requests(
           id,campaign_id,organization_id,asset_id,selected_grant_id,status,gaps,desired_usage,note,
           revision,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,1,$9,$9) RETURNING *`,
        [
          randomUUID(),
          id,
          campaign.organization_id,
          data.asset_id,
          talent.selected_grant_id,
          JSON.stringify(gaps),
          JSON.stringify(data.desired_usage),
          data.note,
          user.id,
        ],
      )
    ).rows[0];
    await bumpCampaign(db, user, id, 'campaign.deal_request_created', {
      request_id: row.id,
      asset_id: data.asset_id,
    });
    return row;
  });
}

export async function sendDealRequest(
  user: Actor,
  id: string,
  requestId: string,
  body: unknown,
  key?: string,
) {
  z.string().uuid().parse(requestId);
  z.object({}).strict().parse(body ?? {});
  await findCampaign(pool, user, id, true);
  return mutate(user.id, `campaigns/${id}/deal-requests/${requestId}/send`, key, {}, async (db) => {
    await findCampaign(db, user, id, true);
    await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
    const row = (
      await db.query(`SELECT * FROM campaign_deal_requests WHERE id=$1 AND campaign_id=$2`, [
        requestId,
        id,
      ])
    ).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 404);
    if (row.status === 'SENT') return row;
    if (row.status !== 'DRAFT')
      throw new DomainError('DEAL_REQUEST_STATE', 409, 'Solo un borrador puede enviarse.');
    const campaign = await findCampaign(db, user, id, true);
    const usage = CampaignUsageSchema.parse(row.desired_usage ?? {});
    const items = await clearanceItems(db, id, campaign.organization_id, campaign.usage);
    const item = items.find((i) => i.asset_id === row.asset_id);
    const gaps = item ? gapsFromClearanceItem(item, usage) : (row.gaps as Gap[]);
    const talent = (
      await db.query(
        'SELECT selected_grant_id FROM campaign_talent WHERE campaign_id=$1 AND asset_id=$2',
        [id, row.asset_id],
      )
    ).rows[0];
    const updated = (
      await db.query(
        `UPDATE campaign_deal_requests
         SET status='SENT',gaps=$2,selected_grant_id=$3,revision=revision+1,updated_by=$4,
             updated_at=now(),sent_at=now()
         WHERE id=$1 AND status='DRAFT' RETURNING *`,
        [requestId, JSON.stringify(gaps), talent?.selected_grant_id ?? row.selected_grant_id, user.id],
      )
    ).rows[0];
    if (!updated)
      throw new DomainError('DEAL_REQUEST_STATE', 409, 'Solo un borrador puede enviarse.');
    await bumpCampaign(db, user, id, 'campaign.deal_request_sent', {
      request_id: requestId,
      asset_id: row.asset_id,
    });
    return updated;
  });
}

export async function withdrawDealRequest(
  user: Actor,
  id: string,
  requestId: string,
  body: unknown,
  key?: string,
) {
  z.string().uuid().parse(requestId);
  z.object({}).strict().parse(body ?? {});
  await findCampaign(pool, user, id, true);
  return mutate(
    user.id,
    `campaigns/${id}/deal-requests/${requestId}/withdraw`,
    key,
    {},
    async (db) => {
      await findCampaign(db, user, id, true);
      await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
      const row = (
        await db.query(`SELECT * FROM campaign_deal_requests WHERE id=$1 AND campaign_id=$2`, [
          requestId,
          id,
        ])
      ).rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 404);
      if (row.status === 'WITHDRAWN') return row;
      if (row.status !== 'SENT')
        throw new DomainError('DEAL_REQUEST_STATE', 409, 'Solo una solicitud enviada puede retirarse.');
      const updated = (
        await db.query(
          `UPDATE campaign_deal_requests
           SET status='WITHDRAWN',revision=revision+1,updated_by=$2,updated_at=now()
           WHERE id=$1 AND status='SENT' RETURNING *`,
          [requestId, user.id],
        )
      ).rows[0];
      if (!updated)
        throw new DomainError('DEAL_REQUEST_STATE', 409, 'Solo una solicitud enviada puede retirarse.');
      await bumpCampaign(db, user, id, 'campaign.deal_request_withdrawn', {
        request_id: requestId,
        asset_id: row.asset_id,
      });
      return updated;
    },
  );
}

/** Close open requests when talent is unlinked (called from talent-inventory). */
export async function closeDealRequestsForTalent(db: DB, campaignId: string, assetId: string) {
  await db.query(
    `UPDATE campaign_deal_requests SET status='CLOSED',updated_at=now()
     WHERE campaign_id=$1 AND asset_id=$2 AND status IN ('DRAFT','SENT')`,
    [campaignId, assetId],
  );
}
