import { z } from 'zod';
import { withRlsActor, audit, type DB } from '../../../../packages/db/index.js';
import {
  DomainError,
  GenerationRecordPayloadSchema,
  RnAuthPayloadSchema,
  rightsHash,
} from '../../../../packages/domain/src/index.js';
import {
  evaluateCampaignClearance,
  type ClearanceTalent,
  type CampaignUsage,
  type ClearanceStatus,
} from '../../../../packages/domain/src/rights-core/campaign-clearance.js';
import { verifyRnAuthPayload } from '../integrations/signing.js';
import { verifyRnAuthToken } from './generation-auth.js';
import { campaignRlsActor, findCampaign } from './campaigns.js';
import { mutate } from '../common/idempotency.js';
import type { Actor } from '../common/auth.js';

const evidenceSchema = z
  .object({ kind: z.enum(['AUTH', 'OUTPUT']), evidence_id: z.string().uuid() })
  .strict();
type AuthRow = {
  id: string;
  grant_id: string;
  asset_id: string;
  organization_id: string;
  provider: string;
  status: string;
  payload: unknown;
  signature: string;
  key_id: string;
  issued_at: Date;
  expires_at: Date;
};
type OutputRow = {
  id: string;
  auth_id: string;
  grant_id: string;
  asset_id: string;
  organization_id: string;
  provider: string;
  payload: unknown;
  reported_at: Date;
  public_token: string | null;
};
type Check = { status: ClearanceStatus; reason: string };
const decision = (checks: Check[]): ClearanceStatus =>
  (['DENY', 'INCOMPLETE', 'REQUIRES_APPROVAL', 'ALLOW'] as const).find((s) =>
    checks.some((c) => c.status === s),
  ) ?? 'INCOMPLETE';
const check = (ok: boolean, reason: string): Check => ({
  status: ok ? 'ALLOW' : 'DENY',
  reason: ok ? 'MATCHED' : reason,
});
const iso = (date: Date | string) => new Date(date).toISOString();

export async function changeCampaignEvidence(
  user: Actor,
  id: string,
  body: unknown,
  key?: string,
  remove = false,
) {
  const data = evidenceSchema.parse(body);
  const rls = campaignRlsActor(user);
  await withRlsActor(rls, (db) => findCampaign(db, user, id, true));
  return mutate(
    user.id,
    `campaigns/${id}/evidence${remove ? '/remove' : ''}`,
    key,
    data,
    async (db) => {
      const campaign = await findCampaign(db, user, id, true);
      await db.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [id]);
      let changed = false;
      if (remove) {
        changed = Boolean(
          (
            await db.query(
              'DELETE FROM campaign_evidence WHERE campaign_id=$1 AND kind=$2 AND evidence_id=$3',
              [id, data.kind, data.evidence_id],
            )
          ).rowCount,
        );
      } else {
        // Table is selected from a closed enum, never from request text.
        const table = data.kind === 'AUTH' ? 'generation_auths' : 'generation_records';
        const evidence = (
          await db.query(
            `SELECT e.id FROM ${table} e JOIN campaign_talent t ON t.asset_id=e.asset_id AND t.selected_grant_id=e.grant_id WHERE t.campaign_id=$1 AND e.id=$2 AND e.organization_id=$3`,
            [id, data.evidence_id, campaign.organization_id],
          )
        ).rows[0];
        if (!evidence) throw new DomainError('NOT_FOUND', 404);
        const existing = await db.query(
          'SELECT 1 FROM campaign_evidence WHERE campaign_id=$1 AND kind=$2 AND evidence_id=$3',
          [id, data.kind, data.evidence_id],
        );
        if (!existing.rowCount) {
          const count = (
            await db.query(
              'SELECT count(*)::int AS n FROM campaign_evidence WHERE campaign_id=$1',
              [id],
            )
          ).rows[0].n;
          if (count >= 100)
            throw new DomainError('EVIDENCE_LIMIT', 409, 'Máximo de 100 vínculos por campaña.');
          await db.query(
            'INSERT INTO campaign_evidence(campaign_id,kind,evidence_id,added_by) VALUES($1,$2,$3,$4)',
            [id, data.kind, data.evidence_id, user.id],
          );
          changed = true;
        }
      }
      if (changed) {
        const revision = (
          await db.query(
            'UPDATE campaigns SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',
            [id],
          )
        ).rows[0].revision;
        await audit(
          db,
          user.id,
          remove ? 'campaign.evidence_removed' : 'campaign.evidence_added',
          id,
          { ...data, revision },
        );
      }
      return { linked: !remove, ...data };
    },
    rls,
  );
}

function boundAuth(row: AuthRow) {
  const parsed = RnAuthPayloadSchema.safeParse(row.payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  return p.auth_id === row.id &&
    p.grant_id === row.grant_id &&
    p.asset_id === row.asset_id &&
    p.organization_id === row.organization_id &&
    p.provider === row.provider &&
    p.key_id === row.key_id &&
    p.issued_at === iso(row.issued_at) &&
    p.expires_at === iso(row.expires_at) &&
    verifyRnAuthPayload(p, row.signature, row.key_id)
    ? p
    : null;
}
function useChecks(
  usage: CampaignUsage,
  use: { content_type: string; purpose: string; territory: string; industry?: string },
): Check[] {
  if (!usage.operation || !usage.purpose || !usage.industry || !usage.territories?.length)
    return [{ status: 'INCOMPLETE', reason: 'CAMPAIGN_USE_MISSING' }];
  if (usage.territories.length !== 1)
    return [{ status: 'INCOMPLETE', reason: 'AUTH_SINGLE_TERRITORY_ONLY' }];
  return [
    check(
      usage.operation === use.content_type &&
        usage.purpose === use.purpose &&
        usage.industry === use.industry &&
        usage.territories[0] === use.territory,
      'USE_MISMATCH',
    ),
  ];
}

async function flight(db: DB, user: Actor, id: string, now: Date) {
  const campaign = await findCampaign(db, user, id);
  const rows = (
    await db.query(
      `SELECT t.asset_id,t.selected_grant_id,c.display_name,g.id,g.status,g.valid_from,g.valid_until,g.payload,g.source_type,g.source_id FROM campaign_talent t JOIN assets a ON a.id=t.asset_id JOIN creators c ON c.id=a.creator_id LEFT JOIN rights_grants g ON g.id=t.selected_grant_id AND g.asset_id=t.asset_id AND g.grantee_organization_id=$2 WHERE t.campaign_id=$1 ORDER BY t.asset_id`,
      [id, campaign.organization_id],
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
          valid_from: iso(r.valid_from),
          valid_until: iso(r.valid_until),
          payload: r.payload,
        }
      : null,
  }));
  const usage: CampaignUsage = campaign.usage;
  const clearance = evaluateCampaignClearance(
    usage,
    talents,
    campaign.organization_id,
    now.toISOString(),
  );
  const auths = (
    await db.query(
      `SELECT a.* FROM campaign_evidence e JOIN generation_auths a ON a.id=e.evidence_id AND a.organization_id=$2 WHERE e.campaign_id=$1 AND e.kind='AUTH' ORDER BY a.id`,
      [id, campaign.organization_id],
    )
  ).rows as AuthRow[];
  const outputs = (
    await db.query(
      `SELECT r.* FROM campaign_evidence e JOIN generation_records r ON r.id=e.evidence_id AND r.organization_id=$2 WHERE e.campaign_id=$1 AND e.kind='OUTPUT' ORDER BY r.id`,
      [id, campaign.organization_id],
    )
  ).rows as OutputRow[];
  const links = (
    await db.query('SELECT kind,evidence_id FROM campaign_evidence WHERE campaign_id=$1', [id])
  ).rows as { kind: 'AUTH' | 'OUTPUT'; evidence_id: string }[];
  const missing = links.filter(
    (link) => !(link.kind === 'AUTH' ? auths : outputs).some((row) => row.id === link.evidence_id),
  );
  const selected = (asset: string, grant: string) =>
    talents.some((t) => t.asset_id === asset && t.selected_grant_id === grant);
  const authorizations = await Promise.all(
    auths.map(async (a) => {
      const p = boundAuth(a);
      const checks: Check[] = [check(selected(a.asset_id, a.grant_id), 'STALE_LINK')];
      if (!p) checks.push({ status: 'DENY', reason: 'AUTH_BINDING_INVALID' });
      else {
        const verified = await verifyRnAuthToken(
          { payload: p, signature: a.signature, key_id: a.key_id },
          db,
          now,
        );
        checks.push(
          check(verified.ok, verified.ok ? 'MATCHED' : verified.reason),
          check(Date.parse(p.issued_at) <= now.getTime(), 'AUTH_NOT_STARTED'),
          ...useChecks(usage, p.use),
        );
      }
      return {
        id: a.id,
        asset_id: a.asset_id,
        grant_id: a.grant_id,
        provider: a.provider,
        expires_at: iso(a.expires_at),
        status: decision(checks),
        checks,
      };
    }),
  );
  const preChecks: Check[] = [{ status: clearance.status, reason: 'CAMPAIGN_CLEARANCE' }];
  if (missing.length) preChecks.push({ status: 'INCOMPLETE', reason: 'MISSING_EVIDENCE' });
  for (const t of talents)
    if (!authorizations.some((a) => a.asset_id === t.asset_id && a.status === 'ALLOW'))
      preChecks.push({ status: 'INCOMPLETE', reason: 'NO_VALID_LINKED_AUTH' });
  if (authorizations.some((a) => a.checks.some((c) => c.reason === 'STALE_LINK')))
    preChecks.push({ status: 'DENY', reason: 'STALE_LINK' });

  // Ongoing campaign: original interval is checked at its start; current grant state below
  // remains authoritative. No H3 policy or contract is changed for this postflight view.
  const start = usage.start_at ? Date.parse(usage.start_at) : now.getTime();
  const postCoverage = evaluateCampaignClearance(
    usage,
    talents,
    campaign.organization_id,
    new Date(Math.min(now.getTime(), start)).toISOString(),
  );
  const outputItems = await Promise.all(
    outputs.map(async (r) => {
      const checks: Check[] = [
        check(selected(r.asset_id, r.grant_id), 'STALE_LINK'),
        { status: postCoverage.status, reason: 'CAMPAIGN_CLEARANCE' },
      ];
      const t = talents.find((t) => t.asset_id === r.asset_id);
      const grant = t?.grant;
      checks.push(
        check(
          Boolean(
            grant &&
            grant.status === 'ACTIVE' &&
            Date.parse(grant.valid_from) <= now.getTime() &&
            now.getTime() < Date.parse(grant.valid_until),
          ),
          'GRANT_NOT_CURRENT',
        ),
      );
      if (usage.start_at && usage.duration_days)
        checks.push(
          check(now.getTime() < start + usage.duration_days * 86400000, 'CAMPAIGN_ENDED'),
        );
      const parsed = GenerationRecordPayloadSchema.safeParse(r.payload);
      const a = (
        await db.query('SELECT * FROM generation_auths WHERE id=$1 AND organization_id=$2', [
          r.auth_id,
          campaign.organization_id,
        ])
      ).rows[0] as AuthRow | undefined;
      const p = a ? boundAuth(a) : null;
      if (!parsed.success || !a || !p)
        checks.push({ status: 'DENY', reason: 'OUTPUT_EVIDENCE_INVALID' });
      else {
        const g = parsed.data;
        checks.push(
          check(
            g.generation_id === r.id &&
              g.auth_id === r.auth_id &&
              g.grant_id === r.grant_id &&
              g.asset_id === r.asset_id &&
              g.organization_id === r.organization_id &&
              g.provider === r.provider &&
              g.reported_at === iso(r.reported_at) &&
              a.grant_id === r.grant_id &&
              a.asset_id === r.asset_id &&
              a.provider === r.provider &&
              rightsHash(g.use) === rightsHash(p.use) &&
              g.output.content_type === p.use.content_type,
            'OUTPUT_BINDING_INVALID',
          ),
        );
        checks.push(
          check(a.status === 'CONSUMED', 'AUTH_NOT_CONSUMED'),
          check(r.reported_at.getTime() <= now.getTime(), 'REPORT_IN_FUTURE'),
          check(
            Date.parse(p.issued_at) <= r.reported_at.getTime() &&
              r.reported_at.getTime() < Date.parse(p.expires_at),
            'REPORT_OUTSIDE_AUTH_WINDOW',
          ),
          ...useChecks(usage, g.use),
        );
      }
      return {
        id: r.id,
        asset_id: r.asset_id,
        grant_id: r.grant_id,
        auth_id: r.auth_id,
        provider: r.provider,
        public_token: r.public_token,
        reported_at: iso(r.reported_at),
        status: decision(checks),
        checks,
        media_verified: false,
        sha256: parsed.success ? (parsed.data.output.sha256 ?? null) : null,
      };
    }),
  );
  const postChecks: Check[] = [
    { status: postCoverage.status, reason: 'CAMPAIGN_CLEARANCE' },
    ...outputItems.map((output) => ({ status: output.status, reason: 'OUTPUT_POSTFLIGHT' })),
  ];
  if (!outputItems.length) postChecks.push({ status: 'INCOMPLETE', reason: 'NO_OUTPUTS' });
  if (missing.some((link) => link.kind === 'OUTPUT'))
    postChecks.push({ status: 'INCOMPLETE', reason: 'MISSING_EVIDENCE' });
  for (const talent of talents)
    if (
      !outputItems.some(
        (output) => output.asset_id === talent.asset_id && output.status === 'ALLOW',
      )
    )
      postChecks.push({ status: 'INCOMPLETE', reason: 'TALENT_OUTPUT_MISSING' });
  return {
    campaign_id: id,
    revision: campaign.revision,
    can_edit: campaign.can_edit,
    evaluated_at: now.toISOString(),
    authority: false,
    version: 'rightsnet.campaign-flight/0.1',
    preflight: { status: decision(preChecks), checks: preChecks, clearance },
    postflight: { status: decision(postChecks), checks: postChecks, media_verified: false },
    authorizations: [
      ...authorizations,
      ...missing
        .filter((l) => l.kind === 'AUTH')
        .map((l) => ({
          id: l.evidence_id,
          asset_id: '',
          grant_id: '',
          provider: 'Referencia no disponible',
          status: 'INCOMPLETE' as const,
          checks: [{ status: 'INCOMPLETE' as const, reason: 'MISSING_EVIDENCE' }],
        })),
    ],
    outputs: [
      ...outputItems,
      ...missing
        .filter((l) => l.kind === 'OUTPUT')
        .map((l) => ({
          id: l.evidence_id,
          asset_id: '',
          grant_id: '',
          provider: 'Referencia no disponible',
          status: 'INCOMPLETE' as const,
          checks: [{ status: 'INCOMPLETE' as const, reason: 'MISSING_EVIDENCE' }],
          media_verified: false,
          sha256: null,
        })),
    ],
    agreements: rows.map((r) => ({
      asset_id: r.asset_id,
      display_name: r.display_name,
      grant_id: r.id ?? null,
      source_type: r.source_type ?? null,
      source_id: r.source_id ?? null,
      status: r.status ?? null,
      valid_until: r.valid_until ? iso(r.valid_until) : null,
      approval_required: Boolean(r.payload?.approval && Object.keys(r.payload.approval).length),
    })),
  };
}
export async function getCampaignFlight(user: Actor, id: string, now = new Date()) {
  return withRlsActor(
    campaignRlsActor(user),
    async (db) => flight(db, user, id, now),
    { readonly: true },
  );
}
