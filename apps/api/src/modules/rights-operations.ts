import { z } from 'zod';
import { pool, withRlsActor } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { opsRlsActor, type Actor } from '../common/auth.js';

const AI_RIGHT_KEYS = [
  'synthetic_video',
  'synthetic_image',
  'commercial_advertising',
] as const;

type GrantRow = {
  id: string;
  asset_id: string;
  status: string;
  valid_from: Date | string;
  valid_until: Date | string;
  payload: {
    rights?: Record<string, string>;
    industry?: string[];
    territories?: string[];
    approval?: Record<string, string>;
  };
};

function asTime(v: Date | string) {
  return new Date(v).getTime();
}

function isCurrentlyActive(g: GrantRow, now = Date.now()) {
  return (
    g.status === 'ACTIVE' &&
    asTime(g.valid_from) <= now &&
    asTime(g.valid_until) > now
  );
}

function approvalNonEmpty(g: GrantRow) {
  const a = g.payload?.approval ?? {};
  return Object.keys(a).length > 0;
}

function hasAiAllow(g: GrantRow) {
  const rights = g.payload?.rights ?? {};
  return AI_RIGHT_KEYS.some((k) => rights[k] === 'ALLOW');
}

function hasAiDeny(g: GrantRow) {
  const rights = g.payload?.rights ?? {};
  return AI_RIGHT_KEYS.some((k) => rights[k] === 'DENY');
}

function hasExclusivityMarker(g: GrantRow) {
  const a = g.payload?.approval ?? {};
  return Boolean(a.exclusivity && a.exclusivity !== 'none');
}

function windowsOverlap(a: GrantRow, b: GrantRow) {
  return asTime(a.valid_from) < asTime(b.valid_until) && asTime(b.valid_from) < asTime(a.valid_until);
}

export async function rightsOperationsOverview(user: Actor, organizationId: string) {
  await withRlsActor(opsRlsActor(user), async (db) => {
    const org = (await db.query('SELECT id FROM organizations WHERE id=$1', [organizationId]))
      .rows[0];
    if (!org) throw new DomainError('NOT_FOUND', 404, 'Organización no encontrada.');
  });

  const grants = (
    await pool.query(
      `SELECT id, asset_id, status, valid_from, valid_until, payload
       FROM rights_grants WHERE grantee_organization_id=$1`,
      [organizationId],
    )
  ).rows as GrantRow[];

  const now = Date.now();
  const active = grants.filter((g) => isCurrentlyActive(g, now));
  const activeAssets = new Set(active.map((g) => g.asset_id));
  const expiringCutoff = now + 30 * 86400000;

  const exclusivityByAsset = new Map<string, GrantRow[]>();
  for (const g of active) {
    if (!hasExclusivityMarker(g)) continue;
    const list = exclusivityByAsset.get(g.asset_id) ?? [];
    list.push(g);
    exclusivityByAsset.set(g.asset_id, list);
  }
  let conflicting = 0;
  for (const list of exclusivityByAsset.values()) {
    if (list.length < 2) continue;
    let hit = false;
    for (let i = 0; i < list.length && !hit; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (windowsOverlap(list[i], list[j])) {
          hit = true;
          break;
        }
      }
    }
    if (hit) conflicting++;
  }

  const missing = (
    await pool.query(
      `SELECT count(*)::int AS n FROM external_agreements
       WHERE organization_id=$1 AND status IN ('draft','pending_confirm')`,
      [organizationId],
    )
  ).rows[0].n as number;

  return {
    organization_id: organizationId,
    surface: 'rights_operations' as const,
    metrics: {
      active_talent_agreements: activeAssets.size,
      expiring_in_30_days: active.filter((g) => asTime(g.valid_until) <= expiringCutoff).length,
      ai_rights_enabled: active.filter(hasAiAllow).length,
      ai_use_prohibited: active.filter(hasAiDeny).length,
      approval_required: active.filter(approvalNonEmpty).length,
      conflicting_exclusivity: conflicting,
      missing_structured_rights: missing,
    },
  };
}

export const CampaignQuerySchema = z
  .object({
    organization_id: z.string().uuid(),
    industry: z.string().trim().min(1).max(64),
    territory: z.string().trim().min(1).max(16),
    window_start: z.string().datetime(),
    window_end: z.string().datetime(),
    content_type: z.string().trim().min(1).max(64),
    purpose: z.string().trim().min(1).max(64).default('commercial_advertising'),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (new Date(q.window_end) <= new Date(q.window_start)) {
      ctx.addIssue({
        code: 'custom',
        message: 'window_end must be after window_start',
        path: ['window_end'],
      });
    }
  });

export type CampaignQuery = z.infer<typeof CampaignQuerySchema>;
export type CampaignBucket =
  | 'fully_cleared'
  | 'approval_required'
  | 'not_permitted'
  | 'agreement_unclear';

/** Pure classifier for tests. */
export function classifyAssetForCampaign(
  grants: GrantRow[],
  unclearOnly: boolean,
  query: CampaignQuery,
): CampaignBucket {
  if (unclearOnly && grants.length === 0) return 'agreement_unclear';

  const wStart = new Date(query.window_start).getTime();
  const wEnd = new Date(query.window_end).getTime();

  const covering = grants.filter((g) => {
    if (g.status !== 'ACTIVE') return false;
    const gf = asTime(g.valid_from);
    const gu = asTime(g.valid_until);
    return gf <= wStart && gu >= wEnd;
  });

  if (covering.length === 0) {
    return unclearOnly ? 'agreement_unclear' : 'not_permitted';
  }

  let sawApproval = false;
  let sawPermit = false;
  let sawDeny = false;

  for (const g of covering) {
    const rights = g.payload?.rights ?? {};
    const industries = g.payload?.industry ?? [];
    const territories = g.payload?.territories ?? [];

    const industryOk =
      industries.length === 0 ||
      industries.includes(query.industry) ||
      (query.industry === 'beauty' && industries.includes('cosmetics'));
    const territoryOk =
      territories.length === 0 ||
      territories.includes(query.territory) ||
      territories.includes('WORLDWIDE');

    if (!industryOk || !territoryOk) {
      sawDeny = true;
      continue;
    }

    const content = rights[query.content_type];
    const purpose = rights[query.purpose];
    if (content === 'DENY' || purpose === 'DENY') {
      sawDeny = true;
      continue;
    }
    if (content === 'ALLOW' || purpose === 'ALLOW' || (!content && !purpose && hasAiAllow(g))) {
      sawPermit = true;
      if (approvalNonEmpty(g)) sawApproval = true;
    } else if (content || purpose) {
      // explicit non-ALLOW states
      if (content === 'REQUIRES_APPROVAL' || purpose === 'REQUIRES_APPROVAL') {
        sawPermit = true;
        sawApproval = true;
      } else {
        sawDeny = true;
      }
    }
  }

  if (sawPermit && !sawDeny && sawApproval) return 'approval_required';
  if (sawPermit && !sawDeny) return 'fully_cleared';
  if (sawDeny && !sawPermit) return 'not_permitted';
  if (sawPermit && sawDeny) return 'not_permitted';
  return unclearOnly ? 'agreement_unclear' : 'not_permitted';
}

export async function rightsOperationsCampaignQuery(user: Actor, body: unknown) {
  const query = CampaignQuerySchema.parse(body);
  await withRlsActor(opsRlsActor(user), async (db) => {
    const org = (
      await db.query('SELECT id FROM organizations WHERE id=$1', [query.organization_id])
    ).rows[0];
    if (!org) throw new DomainError('NOT_FOUND', 404, 'Organización no encontrada.');
  });

  const grants = (
    await pool.query(
      `SELECT id, asset_id, status, valid_from, valid_until, payload
       FROM rights_grants WHERE grantee_organization_id=$1`,
      [query.organization_id],
    )
  ).rows as GrantRow[];

  const pending = (
    await pool.query(
      `SELECT asset_id FROM external_agreements
       WHERE organization_id=$1 AND status IN ('draft','pending_confirm')`,
      [query.organization_id],
    )
  ).rows as { asset_id: string }[];

  const assetIds = new Set<string>();
  for (const g of grants) assetIds.add(g.asset_id);
  for (const p of pending) assetIds.add(p.asset_id);

  const pendingSet = new Set(pending.map((p) => p.asset_id));
  const byAsset = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const list = byAsset.get(g.asset_id) ?? [];
    list.push(g);
    byAsset.set(g.asset_id, list);
  }

  const buckets: Record<CampaignBucket, string[]> = {
    fully_cleared: [],
    approval_required: [],
    not_permitted: [],
    agreement_unclear: [],
  };

  for (const assetId of assetIds) {
    const gList = byAsset.get(assetId) ?? [];
    const unclearOnly = gList.length === 0 && pendingSet.has(assetId);
    const bucket = classifyAssetForCampaign(gList, unclearOnly, query);
    buckets[bucket].push(assetId);
  }

  const take = (ids: string[]) => ids.slice(0, 20);

  return {
    organization_id: query.organization_id,
    surface: 'rights_operations' as const,
    query,
    relationships: assetIds.size,
    fully_cleared: buckets.fully_cleared.length,
    approval_required: buckets.approval_required.length,
    not_permitted: buckets.not_permitted.length,
    agreement_unclear: buckets.agreement_unclear.length,
    items: {
      fully_cleared: take(buckets.fully_cleared),
      approval_required: take(buckets.approval_required),
      not_permitted: take(buckets.not_permitted),
      agreement_unclear: take(buckets.agreement_unclear),
    },
  };
}
