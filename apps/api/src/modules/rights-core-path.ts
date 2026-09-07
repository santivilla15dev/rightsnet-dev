import { randomUUID } from 'node:crypto';
import type { DB } from '../../../../packages/db/index.js';
import {
  BASELINE_PLATFORM_POLICY,
  DomainError,
  RightsPolicySchema,
  rightsHash,
  hash,
  price,
  type RightsPolicy,
  type TrustedContext,
  type SafetyAssessment,
  type ApprovalAction,
  type Policy,
} from '../../../../packages/domain/src/index.js';
import { config } from '../common/config.js';

export function rightsCorePurchasesEnabled() {
  return config.rightsCorePurchases;
}

export function isRightsPolicy(policy: unknown): policy is RightsPolicy {
  return (
    !!policy &&
    typeof policy === 'object' &&
    (policy as { schema_version?: string }).schema_version === 'rightsnet.rights-policy/0.1'
  );
}

export function isLegacyPolicy(policy: unknown): policy is Policy {
  return (
    !!policy &&
    typeof policy === 'object' &&
    (policy as { schema_version?: string }).schema_version === 'rightsnet.policy/0.1'
  );
}

export function policyContentHash(policy: unknown): string {
  if (isRightsPolicy(policy)) return rightsHash(RightsPolicySchema.parse(policy));
  return hash(policy);
}

export function rightsPrice(policy: RightsPolicy, days: 30 | 90) {
  const key = String(days) as '30' | '90';
  const base_minor = policy.pricing.duration_prices_minor[key];
  if (base_minor === null || base_minor === undefined) {
    throw new DomainError('PRICE_NOT_DEFINED', 422, 'No hay precio para esa duración.');
  }
  const fee_minor = Math.floor((base_minor * 1500) / 10000);
  return {
    base_minor,
    fee_minor,
    creator_minor: base_minor - fee_minor,
    total_minor: base_minor,
    currency: 'EUR' as const,
    fee_bps: 1500,
    tax_minor: 0,
    tax_mode: 'sandbox_unconfigured',
    pricing_revision: policy.pricing.revision,
    fee_schedule_version: 'sandbox-fee/0.1',
  };
}

export function priceForPolicy(policy: unknown, days: 30 | 90) {
  if (isRightsPolicy(policy)) return rightsPrice(policy, days);
  return price(policy as Policy, days);
}

export async function loadConsentForPolicy(
  db: DB,
  policyId: string,
  creatorUserId: string,
  licenseTermsVersion: string | null,
) {
  const row = (
    await db.query('SELECT * FROM consents WHERE policy_id=$1 AND user_id=$2', [
      policyId,
      creatorUserId,
    ])
  ).rows[0];
  if (!row) return null;
  if (licenseTermsVersion && row.license_terms_version !== licenseTermsVersion) return null;
  return row;
}

export async function buildTrustedContext(input: {
  db: DB;
  org: { verified: boolean };
  asset: {
    id: string;
    status: string;
    policy_id: string;
    identity_status: string;
    adult_verified: boolean;
    identity_expires_at: string | Date;
    relationship_status: string;
    user_id: string;
    policy: RightsPolicy;
  };
  requestHash: string;
  creatorApproval?: ApprovalAction | null;
  platformReview?: ApprovalAction | null;
  safetyOverride?: SafetyAssessment | null;
}): Promise<TrustedContext> {
  const { asset, org, requestHash } = input;
  const consentRow = await loadConsentForPolicy(
    input.db,
    asset.policy_id,
    asset.user_id,
    asset.policy.license_terms_version,
  );
  let safety: SafetyAssessment | null;
  if (input.safetyOverride !== undefined) {
    safety = input.safetyOverride;
  } else {
    const existing = (
      await input.db.query(
        'SELECT * FROM safety_assessments WHERE request_hash=$1 ORDER BY created_at DESC LIMIT 1',
        [requestHash],
      )
    ).rows[0];
    safety = existing
      ? {
          assessor: existing.assessor,
          source: existing.source,
          version: existing.version,
          assessed_at: new Date(existing.assessed_at).toISOString(),
          request_hash: existing.request_hash,
          status: existing.status,
          reason_codes: existing.reason_codes,
        }
      : null;
  }
  return {
    buyer_verified: org.verified,
    creator_verified: asset.identity_status === 'verified',
    creator_adult: asset.adult_verified,
    identity_expires_at: asset.identity_expires_at
      ? new Date(asset.identity_expires_at).toISOString()
      : null,
    asset_relationship_verified: asset.relationship_status === 'reviewed',
    asset_available: asset.status === 'published',
    current_policy_id: asset.policy_id,
    consent: consentRow
      ? {
          policy_id: asset.policy_id,
          license_terms_version: asset.policy.license_terms_version,
        }
      : null,
    platform_policy: {
      ...BASELINE_PLATFORM_POLICY,
      version: asset.policy.platform_policy_version || BASELINE_PLATFORM_POLICY.version,
    },
    safety_assessment: safety,
    creator_approval: input.creatorApproval ?? null,
    platform_review: input.platformReview ?? null,
  };
}

/** Sandbox: persist a CLEARED safety assessment bound to the request hash. */
export async function ensureSandboxSafetyCleared(
  db: DB,
  requestId: string,
  requestHash: string,
  now: string,
) {
  await db.query(
    `INSERT INTO safety_assessments(id,request_id,request_hash,assessor,source,version,assessed_at,status,reason_codes)
     VALUES($1,$2,$3,'platform','sandbox','safety/0.1',$4,'CLEARED','[]'::jsonb)
     ON CONFLICT (request_id, request_hash) DO NOTHING`,
    [randomUUID(), requestId, requestHash, now],
  );
}

export function approvalFromRow(
  row: Record<string, unknown> | undefined,
  fallback: {
    request_id: string;
    buyer_organization_id: string;
    asset_id: string;
    request_hash: string;
    policy_hash: string;
    platform_policy_version: string;
  },
): ApprovalAction | null {
  if (!row) return null;
  const decision = row.decision === 'approve' || row.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  return {
    actor_id: String(row.actor_id),
    actor_role: (row.actor_role as 'creator' | 'platform_reviewer') || 'creator',
    request_id: String(row.request_id ?? fallback.request_id),
    buyer_organization_id: String(row.buyer_organization_id ?? fallback.buyer_organization_id),
    asset_id: String(row.asset_id ?? fallback.asset_id),
    request_hash: String(row.request_hash ?? row.usage_hash ?? fallback.request_hash),
    policy_hash: String(row.policy_hash ?? fallback.policy_hash),
    platform_policy_version: String(
      row.platform_policy_version ?? fallback.platform_policy_version,
    ),
    decision,
    decided_at: new Date(String(row.created_at)).toISOString(),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    revision: Number(row.revision ?? 1),
  };
}
