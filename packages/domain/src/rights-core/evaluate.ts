import { DomainError } from '../domain-error.js';
import { validateApprovalBinding } from './approvals.js';
import { rightsHash } from './canonical.js';
import {
  DraftLicenseRequestSchema,
  ENGINE_VERSION,
  LicenseRequestSchema,
  RightsPolicySchema,
  TrustedContextSchema,
  type DraftLicenseRequest,
  type LicenseDecision,
  type LicenseRequest,
  type RightsPolicy,
  type TrustedContext,
} from './schemas.js';

const REQUEST_FIELD_PATHS = [
  'campaign_name',
  'purpose',
  'industry',
  'generation_type',
  'territories',
  'channels',
  'starts_at',
  'duration_days',
  'commercial_use',
  'exclusivity',
  'requested_additional_rights',
] as const;

function uniqSort(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function durationKey(days: 30 | 90): '30' | '90' {
  return String(days) as '30' | '90';
}

function finalize(
  decision: LicenseDecision['decision'],
  reason_codes: string[],
  missing_fields: string[],
  hashes: {
    request_hash: string;
    policy_hash: string;
    platform_policy_version: string;
    evaluated_at: string;
  },
): LicenseDecision {
  const codes = uniqSort(reason_codes);
  const missing = uniqSort(missing_fields);
  if (decision === 'ALLOW') {
    return {
      schema_version: 'rightsnet.license-decision/0.1',
      decision: 'ALLOW',
      reason_codes: [],
      missing_fields: [],
      request_hash: hashes.request_hash,
      policy_hash: hashes.policy_hash,
      platform_policy_version: hashes.platform_policy_version,
      engine_version: ENGINE_VERSION,
      evaluated_at: hashes.evaluated_at,
    };
  }
  if (!codes.length && !missing.length) {
    throw new Error('non-ALLOW decision requires at least one reason or missing field');
  }
  return {
    schema_version: 'rightsnet.license-decision/0.1',
    decision,
    reason_codes: codes,
    missing_fields: missing,
    request_hash: hashes.request_hash,
    policy_hash: hashes.policy_hash,
    platform_policy_version: hashes.platform_policy_version,
    engine_version: ENGINE_VERSION,
    evaluated_at: hashes.evaluated_at,
  };
}

export type EvaluateRightsInput = {
  policy: RightsPolicy;
  /** Complete or draft request (already structurally typed; validated again). */
  request: LicenseRequest | DraftLicenseRequest;
  context: TrustedContext;
  now: string;
  /** Default true for new purchases; fulfillment recheck may set false. */
  checkStart?: boolean;
  /** When false, cross-org / unauthorized approval access is rejected before evaluation. */
  accessAuthorized?: boolean;
};

/**
 * Pure Rights Core evaluator. Schema validation precedes evaluation.
 * Does not call network, LLM, or randomness.
 */
export function evaluateRightsDecision(input: EvaluateRightsInput): LicenseDecision {
  if (input.accessAuthorized === false) {
    throw new DomainError('FORBIDDEN', 403, 'Cross-organization or unauthorized approval.');
  }

  const policy = RightsPolicySchema.parse(input.policy);
  const context = TrustedContextSchema.parse(input.context);
  const draft = DraftLicenseRequestSchema.parse(input.request);
  const policy_hash = rightsHash(policy);
  const request_hash = rightsHash(draft);
  const hashes = {
    request_hash,
    policy_hash,
    platform_policy_version: context.platform_policy.version,
    evaluated_at: input.now,
  };

  const deny: string[] = [];
  const incomplete: string[] = [];
  const approvalNeeded: string[] = [];
  const missing_fields: string[] = [];

  for (const path of REQUEST_FIELD_PATHS) {
    const value = draft[path];
    if (value === undefined) {
      missing_fields.push(path);
      incomplete.push('REQUEST_FIELDS_MISSING');
    }
  }

  // Eligibility (always evaluated when knowable)
  if (!context.buyer_verified) deny.push('BUYER_NOT_VERIFIED');
  if (!context.creator_verified) deny.push('CREATOR_NOT_VERIFIED');
  if (!context.creator_adult) deny.push('CREATOR_NOT_ADULT');
  if (
    context.identity_expires_at !== null &&
    Date.parse(context.identity_expires_at) <= Date.parse(input.now)
  ) {
    deny.push('VERIFICATION_EXPIRED');
  }
  if (!context.asset_relationship_verified) deny.push('ASSET_RELATIONSHIP_NOT_VERIFIED');
  if (!context.asset_available) deny.push('ASSET_UNAVAILABLE');
  if (context.current_policy_id !== draft.policy_id) deny.push('POLICY_STALE');

  // Consent
  if (
    !context.consent ||
    context.consent.policy_id !== draft.policy_id ||
    context.consent.license_terms_version !== policy.license_terms_version
  ) {
    incomplete.push('CONSENT_MISSING');
  }

  // Industry / platform / policy grants when industry present
  if (draft.industry !== undefined) {
    if (context.platform_policy.prohibited_industries.includes(draft.industry)) {
      deny.push('PLATFORM_USE_PROHIBITED');
    }
    const grant = policy.industries[draft.industry];
    if (grant === 'DENY') deny.push('INDUSTRY_PROHIBITED');
    else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
    else if (grant === 'REQUIRES_APPROVAL') approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
  }

  if (draft.purpose !== undefined) {
    const grant = policy.purpose[draft.purpose];
    if (grant === 'DENY') deny.push('RIGHT_OUT_OF_SCOPE');
    else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
    else if (grant === 'REQUIRES_APPROVAL') approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
  }

  if (draft.generation_type !== undefined) {
    const grant = policy.operations[draft.generation_type];
    if (grant === 'DENY') deny.push('OPERATION_NOT_ALLOWED');
    else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
    else if (grant === 'REQUIRES_APPROVAL') approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
  }

  if (draft.territories) {
    for (const territory of draft.territories) {
      const grant = policy.territories[territory];
      if (grant === 'DENY') deny.push('TERRITORY_NOT_ALLOWED');
      else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
      else if (grant === 'REQUIRES_APPROVAL') approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
    }
  }

  if (draft.channels) {
    for (const channel of draft.channels) {
      const grant = policy.channels[channel];
      if (grant === 'DENY') deny.push('CHANNEL_NOT_ALLOWED');
      else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
      else if (grant === 'REQUIRES_APPROVAL') approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
    }
  }

  if (draft.duration_days !== undefined) {
    const key = durationKey(draft.duration_days);
    const grant = policy.durations[key];
    if (grant === 'DENY') deny.push('DURATION_NOT_ALLOWED');
    else if (grant === 'NOT_SPECIFIED') incomplete.push('POLICY_GRANT_NOT_SPECIFIED');
    else if (grant === 'REQUIRES_APPROVAL') {
      approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
      if (policy.pricing.duration_prices_minor[key] === null) incomplete.push('PRICE_NOT_DEFINED');
    } else if (grant === 'ALLOW' && policy.pricing.duration_prices_minor[key] === null) {
      incomplete.push('PRICE_NOT_DEFINED');
    }
  }

  if (draft.exclusivity !== undefined && draft.exclusivity !== 'none') {
    deny.push('RIGHT_OUT_OF_SCOPE');
  }
  if (draft.requested_additional_rights && draft.requested_additional_rights.length > 0) {
    deny.push('RIGHT_OUT_OF_SCOPE');
  }

  if (input.checkStart !== false && draft.starts_at !== undefined) {
    if (Date.parse(draft.starts_at) < Date.parse(input.now) + 86_400_000) {
      deny.push('START_TOO_SOON');
    }
  }

  // Safety assessment bound to this request hash
  const safety = context.safety_assessment;
  if (!safety || safety.request_hash !== request_hash) {
    incomplete.push('SAFETY_ASSESSMENT_MISSING');
  } else if (safety.status === 'PROHIBITED') {
    deny.push('PLATFORM_USE_PROHIBITED');
  } else if (safety.status === 'UNKNOWN') {
    incomplete.push('SAFETY_ASSESSMENT_MISSING');
  } else if (safety.status === 'REVIEW_REQUIRED') {
    approvalNeeded.push('PLATFORM_REVIEW_REQUIRED');
  }

  if (policy.approval_mode === 'MANUAL') {
    approvalNeeded.push('CREATOR_APPROVAL_REQUIRED');
  }

  const binding = {
    request_id: draft.request_id,
    buyer_organization_id: draft.buyer_organization_id,
    asset_id: draft.asset_id,
    request_hash,
    policy_hash,
    platform_policy_version: context.platform_policy.version,
  };

  const creatorApproval = validateApprovalBinding({
    approval: context.creator_approval,
    expected: binding,
    now: input.now,
    requiredRole: 'creator',
  });
  if (
    context.creator_approval?.decision === 'REJECTED' &&
    context.creator_approval.request_id === draft.request_id
  ) {
    deny.push('CREATOR_DECLINED');
  }

  const needsCreatorApproval = approvalNeeded.includes('CREATOR_APPROVAL_REQUIRED');

  const needsPlatformReview = approvalNeeded.includes('PLATFORM_REVIEW_REQUIRED');
  const platformReview = validateApprovalBinding({
    approval: context.platform_review,
    expected: binding,
    now: input.now,
    requiredRole: 'platform_reviewer',
  });

  // Precedence
  if (deny.length) return finalize('DENY', deny, missing_fields, hashes);
  if (incomplete.length) return finalize('INCOMPLETE', incomplete, missing_fields, hashes);

  const stillNeedsCreator =
    needsCreatorApproval && !creatorApproval.valid && creatorApproval.reason !== 'rejected';
  const stillNeedsPlatform = needsPlatformReview && !platformReview.valid;

  if (stillNeedsCreator || stillNeedsPlatform) {
    const codes: string[] = [];
    if (stillNeedsCreator) codes.push('CREATOR_APPROVAL_REQUIRED');
    if (stillNeedsPlatform) codes.push('PLATFORM_REVIEW_REQUIRED');
    return finalize('REQUIRES_APPROVAL', codes, missing_fields, hashes);
  }

  // Complete request preferred for ALLOW — if still missing fields somehow, incomplete
  if (missing_fields.length) {
    return finalize('INCOMPLETE', ['REQUEST_FIELDS_MISSING'], missing_fields, hashes);
  }

  // Ensure complete schema for ALLOW path
  LicenseRequestSchema.parse(draft);
  return finalize('ALLOW', [], [], hashes);
}

export function parseCompleteLicenseRequest(raw: unknown): LicenseRequest {
  return LicenseRequestSchema.parse(raw);
}

export function parseDraftLicenseRequest(raw: unknown): DraftLicenseRequest {
  return DraftLicenseRequestSchema.parse(raw);
}

export function parseRightsPolicy(raw: unknown): RightsPolicy {
  return RightsPolicySchema.parse(raw);
}
