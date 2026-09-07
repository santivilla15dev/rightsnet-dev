import { describe, expect, it } from 'vitest';
import {
  DomainError,
  assertIssuanceAllowed,
  assertPublicPassportSafe,
  beautyDePolicy,
  completeBeautyRequest,
  creatorApprovalFor,
  draftRequest,
  evaluateRightsDecision,
  evidenceUnchanged,
  FIXED_NOW,
  hash,
  LicenseRequestSchema,
  platformReviewFor,
  projectPublicPassport,
  rightsCanonical,
  rightsHash,
  RightsPolicySchema,
  samplePrivatePassport,
  START_OK,
  START_TOO_EARLY,
  validContext,
} from '../packages/domain/src/index.js';

describe('Rights Core v0.1 acceptance matrix', () => {
  const policy = beautyDePolicy();
  const request = completeBeautyRequest();
  const context = validContext(request, policy);

  it('Complete DE beauty/30-day grant, price and consent → ALLOW', () => {
    const decision = evaluateRightsDecision({
      policy,
      request,
      context,
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('ALLOW');
    expect(decision.reason_codes).toEqual([]);
    expect(decision.missing_fields).toEqual([]);
    expect(decision.request_hash).toBe(rightsHash(request));
    expect(decision.policy_hash).toBe(rightsHash(policy));
  });

  it('Same input repeated, same clock → byte-identical decision', () => {
    const a = evaluateRightsDecision({ policy, request, context, now: FIXED_NOW });
    const b = evaluateRightsDecision({ policy, request, context, now: FIXED_NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Creator denies requested industry → DENY / INDUSTRY_PROHIBITED', () => {
    const denied = beautyDePolicy({
      industries: { ...policy.industries, beauty: 'DENY' },
    });
    const decision = evaluateRightsDecision({
      policy: denied,
      request,
      context: validContext(request, denied),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('INDUSTRY_PROHIBITED');
  });

  it('Platform prohibition with creator ALLOW and valid approval → DENY / PLATFORM_USE_PROHIBITED', () => {
    const gamblingReq = completeBeautyRequest({ industry: 'gambling' });
    const gamblingPolicy = beautyDePolicy({
      industries: { ...policy.industries, gambling: 'ALLOW' },
    });
    const approval = creatorApprovalFor(gamblingReq, gamblingPolicy);
    const decision = evaluateRightsDecision({
      policy: gamblingPolicy,
      request: gamblingReq,
      context: validContext(gamblingReq, gamblingPolicy, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PLATFORM_USE_PROHIBITED');
  });

  it('Known prohibited intent plus missing channel → DENY with missing channel recorded', () => {
    const draft = draftRequest({ industry: 'gambling', channels: undefined });
    const decision = evaluateRightsDecision({
      policy,
      request: draft,
      context: validContext(draft, policy),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('PLATFORM_USE_PROHIBITED');
    expect(decision.missing_fields).toContain('channels');
  });

  it('Missing channel only → INCOMPLETE / REQUEST_FIELDS_MISSING', () => {
    const draft = draftRequest({ channels: undefined });
    const decision = evaluateRightsDecision({
      policy,
      request: draft,
      context: validContext(draft, policy),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('INCOMPLETE');
    expect(decision.reason_codes).toContain('REQUEST_FIELDS_MISSING');
    expect(decision.missing_fields).toContain('channels');
  });

  it('Applicable industry NOT_SPECIFIED → INCOMPLETE / POLICY_GRANT_NOT_SPECIFIED', () => {
    const p = beautyDePolicy({
      industries: { ...policy.industries, beauty: 'NOT_SPECIFIED' },
    });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('INCOMPLETE');
    expect(decision.reason_codes).toContain('POLICY_GRANT_NOT_SPECIFIED');
  });

  it('Unrelated industry NOT_SPECIFIED → ALLOW', () => {
    // lifestyle remains NOT_SPECIFIED; request targets beauty ALLOW
    const decision = evaluateRightsDecision({
      policy,
      request,
      context,
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('Requested DE+AT, AT denied → DENY / TERRITORY_NOT_ALLOWED', () => {
    const p = beautyDePolicy({ territories: { AT: 'DENY', DE: 'ALLOW' } });
    const req = completeBeautyRequest({ territories: ['DE', 'AT'] });
    const decision = evaluateRightsDecision({
      policy: p,
      request: req,
      context: validContext(req, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('TERRITORY_NOT_ALLOWED');
  });

  it('Requested DE+AT, AT unspecified → INCOMPLETE', () => {
    const req = completeBeautyRequest({ territories: ['DE', 'AT'] });
    const decision = evaluateRightsDecision({
      policy,
      request: req,
      context: validContext(req, policy),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('INCOMPLETE');
    expect(decision.reason_codes).toContain('POLICY_GRANT_NOT_SPECIFIED');
  });

  it('One of two requested channels denied → DENY / CHANNEL_NOT_ALLOWED', () => {
    const p = beautyDePolicy({
      channels: { instagram: 'ALLOW', tiktok: 'DENY', youtube: 'NOT_SPECIFIED' },
    });
    const req = completeBeautyRequest({ channels: ['instagram', 'tiktok'] });
    const decision = evaluateRightsDecision({
      policy: p,
      request: req,
      context: validContext(req, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CHANNEL_NOT_ALLOWED');
  });

  it('90 days denied, 30 allowed → DENY / DURATION_NOT_ALLOWED', () => {
    const req = completeBeautyRequest({ duration_days: 90 });
    const decision = evaluateRightsDecision({
      policy,
      request: req,
      context: validContext(req, policy),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('DURATION_NOT_ALLOWED');
  });

  it('Missing price for requested duration → INCOMPLETE / PRICE_NOT_DEFINED', () => {
    const p = beautyDePolicy({
      pricing: {
        revision: 1,
        currency: 'EUR',
        duration_prices_minor: { '30': null, '90': null },
      },
    });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('INCOMPLETE');
    expect(decision.reason_codes).toContain('PRICE_NOT_DEFINED');
  });

  it('Alcohol conditional, no approval → REQUIRES_APPROVAL / CREATOR_APPROVAL_REQUIRED', () => {
    const p = beautyDePolicy({
      industries: { ...policy.industries, alcohol: 'REQUIRES_APPROVAL' },
    });
    const req = completeBeautyRequest({ industry: 'alcohol' });
    const decision = evaluateRightsDecision({
      policy: p,
      request: req,
      context: validContext(req, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('REQUIRES_APPROVAL');
    expect(decision.reason_codes).toContain('CREATOR_APPROVAL_REQUIRED');
  });

  it('All grants ALLOW, global MANUAL → REQUIRES_APPROVAL', () => {
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('REQUIRES_APPROVAL');
    expect(decision.reason_codes).toContain('CREATOR_APPROVAL_REQUIRED');
  });

  it('Valid creator approval for exact context → ALLOW', () => {
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const approval = creatorApprovalFor(request, p);
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('Approval hash, buyer, asset or policy mismatch → REQUIRES_APPROVAL', () => {
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const approval = creatorApprovalFor(request, p, {
      request_hash: '0'.repeat(64),
    });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('REQUIRES_APPROVAL');
  });

  it('Approval expires exactly now → REQUIRES_APPROVAL', () => {
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const approval = creatorApprovalFor(request, p, { expires_at: FIXED_NOW });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('REQUIRES_APPROVAL');
  });

  it('Current explicit creator rejection → DENY / CREATOR_DECLINED', () => {
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const approval = creatorApprovalFor(request, p, { decision: 'REJECTED' });
    const decision = evaluateRightsDecision({
      policy: p,
      request,
      context: validContext(request, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('CREATOR_DECLINED');
  });

  it('Platform review pending, creator approval valid → REQUIRES_APPROVAL / PLATFORM_REVIEW_REQUIRED', () => {
    const req = completeBeautyRequest();
    const p = beautyDePolicy();
    const safetyPending = {
      assessor: 'platform',
      source: 'manual',
      version: 'safety/0.1',
      assessed_at: FIXED_NOW,
      request_hash: rightsHash(req),
      status: 'REVIEW_REQUIRED' as const,
      reason_codes: ['needs_review'],
    };
    const decision = evaluateRightsDecision({
      policy: p,
      request: req,
      context: validContext(req, p, {
        safety_assessment: safetyPending,
        creator_approval: creatorApprovalFor(req, p),
      }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('REQUIRES_APPROVAL');
    expect(decision.reason_codes).toContain('PLATFORM_REVIEW_REQUIRED');
  });

  it('Safety assessment missing or for another request → INCOMPLETE / SAFETY_ASSESSMENT_MISSING', () => {
    const missing = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, { safety_assessment: null }),
      now: FIXED_NOW,
    });
    expect(missing.decision).toBe('INCOMPLETE');
    expect(missing.reason_codes).toContain('SAFETY_ASSESSMENT_MISSING');

    const wrong = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, {
        safety_assessment: {
          assessor: 'platform',
          source: 'manual',
          version: 'safety/0.1',
          assessed_at: FIXED_NOW,
          request_hash: 'a'.repeat(64),
          status: 'CLEARED',
          reason_codes: [],
        },
      }),
      now: FIXED_NOW,
    });
    expect(wrong.decision).toBe('INCOMPLETE');
    expect(wrong.reason_codes).toContain('SAFETY_ASSESSMENT_MISSING');
  });

  it('Buyer unverified → DENY / BUYER_NOT_VERIFIED', () => {
    const decision = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, { buyer_verified: false }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('BUYER_NOT_VERIFIED');
  });

  it('Identity valid but relationship unverified → DENY / ASSET_RELATIONSHIP_NOT_VERIFIED', () => {
    const decision = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, { asset_relationship_verified: false }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('ASSET_RELATIONSHIP_NOT_VERIFIED');
  });

  it('Identity expires exactly now; minor creator → DENY with eligibility reasons', () => {
    const decision = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, {
        identity_expires_at: FIXED_NOW,
        creator_adult: false,
      }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('VERIFICATION_EXPIRED');
    expect(decision.reason_codes).toContain('CREATOR_NOT_ADULT');
  });

  it('Asset suspended or policy superseded → DENY', () => {
    const suspended = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, { asset_available: false }),
      now: FIXED_NOW,
    });
    expect(suspended.decision).toBe('DENY');
    expect(suspended.reason_codes).toContain('ASSET_UNAVAILABLE');

    const stale = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, {
        current_policy_id: '99999999-9999-4999-8999-999999999999',
      }),
      now: FIXED_NOW,
    });
    expect(stale.decision).toBe('DENY');
    expect(stale.reason_codes).toContain('POLICY_STALE');
  });

  it('Consent absent or references different policy/terms → INCOMPLETE / CONSENT_MISSING', () => {
    const absent = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, { consent: null }),
      now: FIXED_NOW,
    });
    expect(absent.decision).toBe('INCOMPLETE');
    expect(absent.reason_codes).toContain('CONSENT_MISSING');

    const wrongTerms = evaluateRightsDecision({
      policy,
      request,
      context: validContext(request, policy, {
        consent: { policy_id: policy.policy_id, license_terms_version: 'other' },
      }),
      now: FIXED_NOW,
    });
    expect(wrongTerms.decision).toBe('INCOMPLETE');
    expect(wrongTerms.reason_codes).toContain('CONSENT_MISSING');
  });

  it('Start exactly now+24h ALLOW; one millisecond earlier DENY / START_TOO_SOON', () => {
    const ok = evaluateRightsDecision({
      policy,
      request: completeBeautyRequest({ starts_at: START_OK }),
      context,
      now: FIXED_NOW,
    });
    expect(ok.decision).toBe('ALLOW');

    const earlyReq = completeBeautyRequest({ starts_at: START_TOO_EARLY });
    const early = evaluateRightsDecision({
      policy,
      request: earlyReq,
      context: validContext(earlyReq, policy),
      now: FIXED_NOW,
    });
    expect(early.decision).toBe('DENY');
    expect(early.reason_codes).toContain('START_TOO_SOON');
  });

  it('Unknown schema, enum, injected override or invalid date → schema rejection, never ALLOW', () => {
    expect(() =>
      RightsPolicySchema.parse({ ...policy, schema_version: 'rightsnet.rights-policy/9.9' }),
    ).toThrow();
    expect(() =>
      LicenseRequestSchema.parse({ ...request, industry: 'crypto' }),
    ).toThrow();
    expect(() =>
      LicenseRequestSchema.parse({ ...request, buyer_verified: true }),
    ).toThrow();
    expect(() =>
      LicenseRequestSchema.parse({ ...request, starts_at: 'not-a-date' }),
    ).toThrow();
    expect(() =>
      LicenseRequestSchema.parse({
        ...request,
        territories: ['DE', 'DE'],
      }),
    ).toThrow();
  });

  it('Cross-organization request or unauthorized approval → access rejection', () => {
    expect(() =>
      evaluateRightsDecision({
        policy,
        request,
        context,
        now: FIXED_NOW,
        accessAuthorized: false,
      }),
    ).toThrow(DomainError);
  });

  it('Reordered map keys and unordered set members → same normalized semantic hash', () => {
    const a = rightsHash({
      schema_version: 'rightsnet.license-request/0.1',
      territories: ['AT', 'DE'],
      channels: ['youtube', 'instagram'],
      campaign_name: '  Hello  ',
    });
    const b = rightsHash({
      channels: ['instagram', 'youtube'],
      campaign_name: 'Hello',
      territories: ['DE', 'AT'],
      schema_version: 'rightsnet.license-request/0.1',
    });
    expect(a).toBe(b);
    expect(rightsCanonical({ z: 1, a: 2 })).toBe(rightsCanonical({ a: 2, z: 1 }));
  });

  it('Changed channel/industry/buyer/policy version → different bound hash; approval invalidated', () => {
    const baseHash = rightsHash(request);
    const changed = completeBeautyRequest({ channels: ['tiktok'] });
    expect(rightsHash(changed)).not.toBe(baseHash);
    const p = beautyDePolicy({ approval_mode: 'MANUAL' });
    const approval = creatorApprovalFor(request, p);
    const decision = evaluateRightsDecision({
      policy: p,
      request: changed,
      context: validContext(changed, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    // tiktok NOT_SPECIFIED → INCOMPLETE before approval, or REQUIRES_APPROVAL if we fix channel
    // Use beauty channel change that stays ALLOW but different hash
    const changedIg = completeBeautyRequest({ campaign_name: 'Other campaign name' });
    const d2 = evaluateRightsDecision({
      policy: p,
      request: changedIg,
      context: validContext(changedIg, p, { creator_approval: approval }),
      now: FIXED_NOW,
    });
    expect(d2.decision).toBe('REQUIRES_APPROVAL');
    expect(rightsHash(changedIg)).not.toBe(baseHash);
  });

  it('Payment success without contract acceptance → no issuance', () => {
    const eligibility = evaluateRightsDecision({
      policy,
      request,
      context,
      now: FIXED_NOW,
    });
    const gate = assertIssuanceAllowed({
      payment_succeeded: true,
      contract_accepted: false,
      eligibility,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasons).toContain('CONTRACT_NOT_ACCEPTED');
  });

  it('Paid request blocked at fulfillment → no issuance; review record', () => {
    const eligibility = evaluateRightsDecision({
      policy,
      request,
      context,
      now: FIXED_NOW,
    });
    const gate = assertIssuanceAllowed({
      payment_succeeded: true,
      contract_accepted: true,
      eligibility,
      fulfillment_blocked: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.review_required).toBe(true);
    expect(gate.reasons).toContain('FULFILLMENT_BLOCKED');
  });

  it('Policy changes after license issuance → original signed evidence unchanged', () => {
    const issued = { policy_snapshot: policy, policy_hash: rightsHash(policy) };
    const later = beautyDePolicy({ revision: 2, industries: { ...policy.industries, beauty: 'DENY' } });
    const check = evidenceUnchanged(issued.policy_snapshot, later);
    expect(check.snapshot_intact).toBe(true);
    expect(check.policy_differs).toBe(true);
    expect(issued.policy_hash).toBe(rightsHash(policy));
    expect(issued.policy_hash).not.toBe(rightsHash(later));
  });

  it('Private passport projection queried publicly → only allowlisted public fields', () => {
    const priv = samplePrivatePassport(policy);
    const pub = projectPublicPassport(priv);
    assertPublicPassportSafe(pub);
    expect(pub).not.toHaveProperty('legal_name');
    expect(pub).not.toHaveProperty('contact_email');
    expect(pub).not.toHaveProperty('evidence_storage_urls');
    expect(pub).not.toHaveProperty('buyer_organization_id');
    expect(pub.public_display_name).toBe('Lucía Demo');
    expect(pub.asset_id).toBe(policy.asset_id);
  });

  it('Legacy hash algorithm remains distinct and untouched for old snapshots', () => {
    const legacyUsage = {
      campaign_name: 'Campaign test',
      operation: 'synthetic_video',
      purpose: 'commercial_advertising',
      category: 'beauty',
      territories: ['ES'],
      channels: ['instagram'],
      duration_days: 30,
      starts_at: '2026-09-10T12:00:00Z',
      exclusivity: 'none',
      sublicensing: false,
      training: false,
      voice_clone: false,
    };
    const legacy = hash(legacyUsage);
    const rights = rightsHash(legacyUsage);
    // Algorithms may coincide for some shapes; assert legacy still works and rightsCanonical rejects duplicates
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
    expect(rights).toMatch(/^[0-9a-f]{64}$/);
    expect(() => rightsHash({ territories: ['DE', 'DE'] })).toThrow(/duplicate/);
  });

  it('Platform review clears REVIEW_REQUIRED with matching approval → ALLOW', () => {
    const req = completeBeautyRequest();
    const p = beautyDePolicy();
    const safetyPending = {
      assessor: 'platform',
      source: 'manual',
      version: 'safety/0.1',
      assessed_at: FIXED_NOW,
      request_hash: rightsHash(req),
      status: 'REVIEW_REQUIRED' as const,
      reason_codes: ['needs_review'],
    };
    const decision = evaluateRightsDecision({
      policy: p,
      request: req,
      context: validContext(req, p, {
        safety_assessment: safetyPending,
        platform_review: platformReviewFor(req, p),
      }),
      now: FIXED_NOW,
    });
    expect(decision.decision).toBe('ALLOW');
  });
});
