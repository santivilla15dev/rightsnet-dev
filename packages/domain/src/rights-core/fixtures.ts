import {
  BASELINE_PLATFORM_POLICY,
  type ApprovalAction,
  type DraftLicenseRequest,
  type LicenseRequest,
  type RightsPassportPrivate,
  type RightsPolicy,
  type SafetyAssessment,
  type TrustedContext,
} from './schemas.js';
import { rightsHash } from './canonical.js';

export const FIXED_NOW = '2026-09-07T12:00:00.000Z';
export const START_OK = '2026-09-08T12:00:00.000Z'; // exactly +24h
export const START_TOO_EARLY = '2026-09-08T11:59:59.999Z';

export const IDS = {
  policy: '11111111-1111-4111-8111-111111111111',
  asset: '22222222-2222-4222-8222-222222222222',
  creator: '33333333-3333-4333-8333-333333333333',
  buyerOrg: '44444444-4444-4444-8444-444444444444',
  request: '55555555-5555-4555-8555-555555555555',
  actorCreator: '66666666-6666-4666-8666-666666666666',
  actorPlatform: '77777777-7777-4777-8777-777777777777',
  passport: '88888888-8888-4888-8888-888888888888',
} as const;

/** Complete DE beauty / 30-day / Instagram / synthetic_image policy. */
export function beautyDePolicy(overrides: Partial<RightsPolicy> = {}): RightsPolicy {
  const base: RightsPolicy = {
    schema_version: 'rightsnet.rights-policy/0.1',
    policy_id: IDS.policy,
    asset_id: IDS.asset,
    creator_id: IDS.creator,
    revision: 1,
    supersedes_policy_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    purpose: { commercial_advertising: 'ALLOW' },
    operations: { synthetic_image: 'ALLOW', synthetic_video: 'NOT_SPECIFIED' },
    industries: {
      beauty: 'ALLOW',
      lifestyle: 'NOT_SPECIFIED',
      fashion: 'NOT_SPECIFIED',
      alcohol: 'NOT_SPECIFIED',
      gambling: 'DENY',
      tobacco: 'DENY',
      political_advertising: 'DENY',
      adult: 'DENY',
    },
    territories: { AT: 'NOT_SPECIFIED', DE: 'ALLOW' },
    channels: { instagram: 'ALLOW', tiktok: 'NOT_SPECIFIED', youtube: 'NOT_SPECIFIED' },
    durations: { '30': 'ALLOW', '90': 'DENY' },
    exclusivity: { exclusive: 'DENY' },
    additional_rights: { sublicensing: 'DENY', training: 'DENY', voice_clone: 'DENY' },
    approval_mode: 'AUTOMATIC',
    pricing: {
      revision: 1,
      currency: 'EUR',
      duration_prices_minor: { '30': 50000, '90': null },
    },
    platform_policy_version: BASELINE_PLATFORM_POLICY.version,
    license_terms_version: 'terms/0.1',
  };
  return { ...base, ...overrides, industries: { ...base.industries, ...overrides.industries },
    territories: { ...base.territories, ...overrides.territories },
    channels: { ...base.channels, ...overrides.channels },
    durations: { ...base.durations, ...overrides.durations },
    operations: { ...base.operations, ...overrides.operations },
    purpose: { ...base.purpose, ...overrides.purpose },
    exclusivity: { ...base.exclusivity, ...overrides.exclusivity },
    additional_rights: { ...base.additional_rights, ...overrides.additional_rights },
    pricing: overrides.pricing
      ? {
          ...base.pricing,
          ...overrides.pricing,
          duration_prices_minor: {
            ...base.pricing.duration_prices_minor,
            ...overrides.pricing.duration_prices_minor,
          },
        }
      : base.pricing,
  };
}

export function completeBeautyRequest(
  overrides: Partial<LicenseRequest> = {},
): LicenseRequest {
  return {
    schema_version: 'rightsnet.license-request/0.1',
    request_id: IDS.request,
    buyer_organization_id: IDS.buyerOrg,
    creator_id: IDS.creator,
    asset_id: IDS.asset,
    policy_id: IDS.policy,
    campaign_name: 'Beauty DE launch',
    purpose: 'commercial_advertising',
    industry: 'beauty',
    generation_type: 'synthetic_image',
    territories: ['DE'],
    channels: ['instagram'],
    starts_at: START_OK,
    duration_days: 30,
    commercial_use: true,
    exclusivity: 'none',
    requested_additional_rights: [],
    ...overrides,
  };
}

export function draftRequest(
  overrides: Partial<DraftLicenseRequest> = {},
): DraftLicenseRequest {
  const { channels: _c, ...rest } = completeBeautyRequest();
  void _c;
  return { ...rest, ...overrides };
}

export function validContext(
  request: LicenseRequest | DraftLicenseRequest,
  policy: RightsPolicy,
  overrides: Partial<TrustedContext> = {},
): TrustedContext {
  const request_hash = rightsHash(request);
  const safety: SafetyAssessment = {
    assessor: 'platform',
    source: 'manual',
    version: 'safety/0.1',
    assessed_at: FIXED_NOW,
    request_hash,
    status: 'CLEARED',
    reason_codes: [],
  };
  const base: TrustedContext = {
    buyer_verified: true,
    creator_verified: true,
    creator_adult: true,
    identity_expires_at: '2027-01-01T00:00:00.000Z',
    asset_relationship_verified: true,
    asset_available: true,
    current_policy_id: policy.policy_id,
    consent: {
      policy_id: policy.policy_id,
      license_terms_version: policy.license_terms_version,
    },
    platform_policy: BASELINE_PLATFORM_POLICY,
    safety_assessment: safety,
    creator_approval: null,
    platform_review: null,
  };
  return {
    ...base,
    ...overrides,
    consent: overrides.consent === undefined ? base.consent : overrides.consent,
    platform_policy: overrides.platform_policy ?? base.platform_policy,
    safety_assessment:
      overrides.safety_assessment === undefined ? base.safety_assessment : overrides.safety_assessment,
  };
}

export function creatorApprovalFor(
  request: LicenseRequest | DraftLicenseRequest,
  policy: RightsPolicy,
  overrides: Partial<ApprovalAction> = {},
): ApprovalAction {
  return {
    actor_id: IDS.actorCreator,
    actor_role: 'creator',
    request_id: request.request_id,
    buyer_organization_id: request.buyer_organization_id,
    asset_id: request.asset_id,
    request_hash: rightsHash(request),
    policy_hash: rightsHash(policy),
    platform_policy_version: BASELINE_PLATFORM_POLICY.version,
    decision: 'APPROVED',
    decided_at: FIXED_NOW,
    expires_at: '2026-09-10T00:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

export function platformReviewFor(
  request: LicenseRequest | DraftLicenseRequest,
  policy: RightsPolicy,
  overrides: Partial<ApprovalAction> = {},
): ApprovalAction {
  return {
    ...creatorApprovalFor(request, policy),
    actor_id: IDS.actorPlatform,
    actor_role: 'platform_reviewer',
    ...overrides,
  };
}

export function samplePrivatePassport(policy: RightsPolicy): RightsPassportPrivate {
  return {
    schema_version: 'rightsnet.rights-passport/0.1',
    passport_id: IDS.passport,
    revision: 1,
    asset_id: policy.asset_id,
    asset_version: 1,
    creator_id: policy.creator_id,
    policy_id: policy.policy_id,
    policy_revision: policy.revision,
    policy_hash: rightsHash(policy),
    purpose: policy.purpose,
    operations: policy.operations,
    industries: policy.industries,
    territories: policy.territories,
    channels: policy.channels,
    durations: policy.durations,
    exclusivity: policy.exclusivity,
    additional_rights: policy.additional_rights,
    pricing: policy.pricing,
    platform_policy_version: policy.platform_policy_version,
    license_terms_version: policy.license_terms_version,
    identity_verification_level: 'strong',
    relationship_verification_level: 'strong',
    generated_at: FIXED_NOW,
    public_display_name: 'Lucía Demo',
    public_profile_slug: 'lucia-demo',
    evidence_refs: ['ev_1'],
    consent_receipt_refs: ['cr_1'],
    legal_name: 'Lucía Private',
    contact_email: 'lucia@example.test',
    date_of_birth: '1995-01-01',
    identity_document_refs: ['id_doc'],
    evidence_storage_urls: ['s3://secret'],
    buyer_organization_id: IDS.buyerOrg,
    contract_refs: ['contract_1'],
    transaction_refs: ['txn_1'],
  };
}
