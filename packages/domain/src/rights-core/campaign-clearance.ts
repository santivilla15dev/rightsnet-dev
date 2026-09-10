import { z } from 'zod';
import { IndustrySchema, OperationSchema, TerritorySchema, ChannelSchema } from './schemas.js';
import { RightsGrantPayloadSchema, type RightsGrantPayload } from './rights-grant.js';
import { rightsHash } from './canonical.js';

const unique = <T extends z.ZodType<string>>(schema: T, max: number) =>
  z
    .array(schema)
    .min(1)
    .max(max)
    .refine((a) => new Set(a).size === a.length, 'Duplicate values');
export const CampaignUsageSchema = z
  .object({
    industry: IndustrySchema.optional(),
    operation: OperationSchema.optional(),
    purpose: z.literal('commercial_advertising').optional(),
    territories: unique(TerritorySchema, 2).optional(),
    channels: unique(ChannelSchema, 3).optional(),
    start_at: z.iso.datetime().optional(),
    duration_days: z.number().int().min(1).max(365).optional(),
  })
  .strict();
export type CampaignUsage = z.infer<typeof CampaignUsageSchema>;
export type ClearanceStatus = 'ALLOW' | 'DENY' | 'INCOMPLETE' | 'REQUIRES_APPROVAL';
export type ClearanceCheck = { dimension: string; status: ClearanceStatus; reason: string };
export type ClearanceTalent = {
  asset_id: string;
  display_name: string;
  selected_grant_id: string | null;
  grant: null | {
    id: string;
    status: string;
    valid_from: string;
    valid_until: string;
    payload: unknown;
  };
};
const dimensions = [
  'selection',
  'status',
  'window',
  'operation',
  'purpose',
  'industry',
  'territories',
  'channels',
  'duration',
  'approval',
];
function aggregate(checks: { status: ClearanceStatus }[]): ClearanceStatus {
  return (
    (['DENY', 'INCOMPLETE', 'REQUIRES_APPROVAL', 'ALLOW'] as const).find((s) =>
      checks.some((c) => c.status === s),
    ) ?? 'INCOMPLETE'
  );
}
export function evaluateCampaignClearance(
  usage: CampaignUsage,
  talents: ClearanceTalent[],
  organizationId: string,
  now: string,
) {
  CampaignUsageSchema.parse(usage);
  const items = talents.map((t) => {
    const checks: ClearanceCheck[] = [];
    const add = (dimension: string, status: ClearanceStatus, reason: string) =>
      checks.push({ dimension, status, reason });
    const parsed = RightsGrantPayloadSchema.safeParse(t.grant?.payload);
    let p: RightsGrantPayload | undefined;
    if (
      parsed.success &&
      t.grant &&
      parsed.data.grant_id === t.grant.id &&
      t.selected_grant_id === t.grant.id &&
      parsed.data.asset_id === t.asset_id &&
      parsed.data.grantee_organization_id === organizationId
    )
      p = parsed.data;
    if (!p || !t.grant) {
      for (const d of dimensions)
        add(d, 'INCOMPLETE', !t.selected_grant_id ? 'NO_SELECTED_GRANT' : 'INVALID_GRANT');
    } else {
      add('selection', 'ALLOW', 'SELECTED_GRANT');
      const from = Date.parse(t.grant.valid_from),
        until = Date.parse(t.grant.valid_until),
        at = Date.parse(now);
      add(
        'status',
        t.grant.status === 'ACTIVE' && from <= at && at < until ? 'ALLOW' : 'DENY',
        t.grant.status !== 'ACTIVE'
          ? 'GRANT_NOT_ACTIVE'
          : at >= until
            ? 'GRANT_EXPIRED'
            : from > at
              ? 'GRANT_NOT_STARTED'
              : 'GRANT_CURRENT',
      );
      const start = usage.start_at ? Date.parse(usage.start_at) : undefined;
      if (start === undefined || usage.duration_days === undefined)
        add('window', 'INCOMPLETE', 'USAGE_WINDOW_MISSING');
      else {
        const ok = start >= at && from <= start && start + usage.duration_days * 86400000 <= until;
        add('window', ok ? 'ALLOW' : 'DENY', ok ? 'WINDOW_COVERED' : 'WINDOW_OUT_OF_SCOPE');
      }
      for (const [dimension, key] of [
        ['operation', usage.operation],
        ['purpose', usage.purpose],
      ] as const) {
        const state = key ? p.rights[key] : undefined;
        add(
          dimension,
          !state || state === 'NOT_SPECIFIED' ? 'INCOMPLETE' : state,
          !key
            ? 'USAGE_FIELD_MISSING'
            : !state || state === 'NOT_SPECIFIED'
              ? 'RIGHT_UNSPECIFIED'
              : state === 'DENY'
                ? 'RIGHT_DENIED'
                : state === 'REQUIRES_APPROVAL'
                  ? 'RIGHT_APPROVAL_REQUIRED'
                  : 'RIGHT_COVERED',
        );
      }
      const scope = (
        dimension: string,
        requested: string[] | undefined,
        declared: unknown,
        worldwide = false,
      ) => {
        if (!requested?.length) return add(dimension, 'INCOMPLETE', 'USAGE_FIELD_MISSING');
        if (
          !Array.isArray(declared) ||
          !declared.length ||
          !declared.every((x) => typeof x === 'string')
        )
          return add(dimension, 'INCOMPLETE', 'GRANT_SCOPE_MISSING');
        const ok = requested.every(
          (x) => declared.includes(x) || (worldwide && declared.includes('WORLDWIDE')),
        );
        add(dimension, ok ? 'ALLOW' : 'DENY', ok ? 'SCOPE_COVERED' : 'SCOPE_OUT_OF_BOUNDS');
      };
      scope('industry', usage.industry ? [usage.industry] : undefined, p.industry);
      scope('territories', usage.territories, p.territories, true);
      scope('channels', usage.channels, p.scope_snapshot.channels);
      const duration = p.scope_snapshot.duration_days;
      if (!usage.duration_days) add('duration', 'INCOMPLETE', 'USAGE_FIELD_MISSING');
      else if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0)
        add('duration', 'INCOMPLETE', 'GRANT_DURATION_MISSING');
      else
        add(
          'duration',
          usage.duration_days <= duration ? 'ALLOW' : 'DENY',
          usage.duration_days <= duration ? 'DURATION_COVERED' : 'DURATION_OUT_OF_SCOPE',
        );
      add(
        'approval',
        Object.keys(p.approval).length ? 'REQUIRES_APPROVAL' : 'ALLOW',
        Object.keys(p.approval).length ? 'GRANT_APPROVAL_REQUIRED' : 'NO_RECORDED_CONDITIONS',
      );
    }
    return {
      asset_id: t.asset_id,
      display_name: t.display_name,
      selected_grant_id: t.selected_grant_id,
      status: aggregate(checks),
      checks,
    };
  });
  const checks = items.flatMap((i) => i.checks);
  const passed = checks.filter((c) => c.status === 'ALLOW').length;
  return {
    version: 'rightsnet.campaign-clearance/0.1',
    evaluated_at: now,
    input_hash: rightsHash({ usage, talents, organizationId }),
    status: aggregate(checks),
    score: checks.length ? Math.floor((100 * passed) / checks.length) : 0,
    passed_checks: passed,
    total_checks: checks.length,
    items,
    blockers: items.flatMap((i) =>
      i.checks.filter((c) => c.status !== 'ALLOW').map((c) => ({ asset_id: i.asset_id, ...c })),
    ),
    reason_codes: checks.length
      ? [...new Set(checks.filter((c) => c.status !== 'ALLOW').map((c) => c.reason))]
      : ['NO_TALENT'],
    authority: false as const,
  };
}
