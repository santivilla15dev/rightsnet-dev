import { describe, it, expect } from 'vitest';
import {
  UsageSchema,
  PolicySchema,
  defaultPolicy,
  evaluateLicense,
  price,
  hash,
  licenseStatus,
  type Usage,
} from '../packages/domain/src/index.js';
import { signPayload, verifyPayload } from '../apps/api/src/integrations/signing.js';
const now = '2026-09-06T12:00:00Z';
const usage: Usage = {
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
const base = {
  buyerVerified: true,
  assetAvailable: true,
  verificationValid: true,
  policy: defaultPolicy,
  usage,
  now,
};
describe('Deterministic rights engine', () => {
  it('allows exactly the granted scope', () =>
    expect(evaluateLicense(base).decision).toBe('ALLOW'));
  it.each(['politics', 'adult', 'gambling', 'tobacco', 'alcohol'] as const)(
    'denies %s irrespective of creator approval',
    (category) =>
      expect(evaluateLicense({ ...base, usage: { ...usage, category } }).reason_codes).toContain(
        'CATEGORY_DENIED',
      ),
  );
  it('denies a partially allowed territory set', () =>
    expect(
      evaluateLicense({
        ...base,
        policy: { ...defaultPolicy, territories: ['ES'] },
        usage: { ...usage, territories: ['ES', 'DE'] },
      }).decision,
    ).toBe('DENY'));
  it('denies expired identity', () =>
    expect(evaluateLicense({ ...base, verificationValid: false }).reason_codes).toContain(
      'VERIFICATION_EXPIRED',
    ));
  it('manual approval is bound to exact hashes and expiration', () => {
    const policy = { ...defaultPolicy, approval: 'manual' as const };
    expect(evaluateLicense({ ...base, policy }).decision).toBe('REQUIRES_APPROVAL');
    const approval = {
      usage_hash: hash(usage),
      policy_hash: hash(policy),
      expires_at: '2026-09-07T12:00:00Z',
    };
    expect(evaluateLicense({ ...base, policy, approval }).decision).toBe('ALLOW');
    expect(
      evaluateLicense({ ...base, policy, approval, usage: { ...usage, channels: ['tiktok'] } })
        .decision,
    ).toBe('REQUIRES_APPROVAL');
    expect(
      evaluateLicense({ ...base, policy, approval: { ...approval, expires_at: now } }).decision,
    ).toBe('REQUIRES_APPROVAL');
  });
  it('validates start at exactly 24h and rejects one second earlier', () => {
    expect(
      evaluateLicense({ ...base, usage: { ...usage, starts_at: '2026-09-07T12:00:00Z' } }).decision,
    ).toBe('ALLOW');
    expect(
      evaluateLicense({ ...base, usage: { ...usage, starts_at: '2026-09-07T11:59:59Z' } }).decision,
    ).toBe('DENY');
  });
  it('rejects unknown fields and unsupported rights', () => {
    expect(() => UsageSchema.parse({ ...usage, training: true })).toThrow();
    expect(() => UsageSchema.parse({ ...usage, operation: 'voice_clone' })).toThrow();
    expect(() => UsageSchema.parse({ ...usage, admin_override: true })).toThrow();
    expect(() => PolicySchema.parse({ ...defaultPolicy, territories: [] })).toThrow();
  });
  it('calculates integer cent splits without money loss', () => {
    for (const amount of [1001, 99999, 10000000]) {
      const p = price({ ...defaultPolicy, prices: { '30': amount, '90': amount } }, 30);
      expect(p.fee_minor + p.creator_minor).toBe(amount);
      expect(Number.isInteger(p.fee_minor)).toBe(true);
    }
  });
  it('uses inclusive start and exclusive end and gives status precedence', () => {
    const l = {
      status: 'issued',
      starts_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-31T00:00:00Z',
    };
    expect(licenseStatus(l, true, new Date(l.starts_at))).toBe('VALID');
    expect(licenseStatus(l, true, new Date(l.ends_at))).toBe('EXPIRED');
    expect(licenseStatus({ ...l, status: 'revoked' }, true, new Date(l.starts_at))).toBe('REVOKED');
    expect(licenseStatus(l, false, new Date(l.starts_at))).toBe('INVALID');
  });
  it('cryptographically verifies canonical payload and rejects tampering', () => {
    const payload = { scope: { b: 2, a: 1 }, sandbox: true };
    const signed = signPayload(payload);
    expect(
      verifyPayload({ sandbox: true, scope: { a: 1, b: 2 } }, signed.signature, signed.key_id),
    ).toBe(true);
    expect(verifyPayload({ ...payload, sandbox: false }, signed.signature, signed.key_id)).toBe(
      false,
    );
    expect(verifyPayload(payload, signed.signature, '../bad')).toBe(false);
  });
});
