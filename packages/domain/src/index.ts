import { createHash } from 'node:crypto';
import { z } from 'zod';
export const currencies = ['EUR'] as const;
export const UsageSchema = z
  .object({
    campaign_name: z.string().trim().min(3).max(120),
    operation: z.enum(['synthetic_image', 'synthetic_video']),
    purpose: z.literal('commercial_advertising'),
    category: z.enum([
      'beauty',
      'lifestyle',
      'fashion',
      'politics',
      'adult',
      'gambling',
      'tobacco',
      'alcohol',
    ]),
    territories: z
      .array(z.enum(['ES', 'DE']))
      .min(1)
      .max(2),
    channels: z
      .array(z.enum(['instagram', 'tiktok', 'youtube']))
      .min(1)
      .max(3),
    duration_days: z.union([z.literal(30), z.literal(90)]),
    starts_at: z.iso.datetime(),
    exclusivity: z.literal('none'),
    sublicensing: z.literal(false),
    training: z.literal(false),
    voice_clone: z.literal(false),
  })
  .strict();
export type Usage = z.infer<typeof UsageSchema>;
export const PolicySchema = z
  .object({
    schema_version: z.literal('rightsnet.policy/0.1'),
    operations: z
      .array(z.enum(['synthetic_image', 'synthetic_video']))
      .min(1)
      .max(2),
    categories: z
      .array(z.enum(['beauty', 'lifestyle', 'fashion']))
      .min(1)
      .max(3),
    territories: z
      .array(z.enum(['ES', 'DE']))
      .min(1)
      .max(2),
    channels: z
      .array(z.enum(['instagram', 'tiktok', 'youtube']))
      .min(1)
      .max(3),
    denied_categories: z.array(z.enum(['politics', 'adult', 'gambling', 'tobacco', 'alcohol'])),
    approval: z.enum(['automatic', 'manual']),
    prices: z
      .object({
        '30': z.number().int().min(1000).max(10000000),
        '90': z.number().int().min(1000).max(10000000),
      })
      .strict(),
  })
  .strict();
export type Policy = z.infer<typeof PolicySchema>;
export const defaultPolicy: Policy = {
  schema_version: 'rightsnet.policy/0.1',
  operations: ['synthetic_image', 'synthetic_video'],
  categories: ['beauty', 'lifestyle', 'fashion'],
  territories: ['ES', 'DE'],
  channels: ['instagram', 'tiktok', 'youtube'],
  denied_categories: ['politics', 'adult', 'gambling', 'tobacco', 'alcohol'],
  approval: 'automatic',
  prices: { '30': 50000, '90': 120000 },
};
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
export function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function evaluateLicense(input: {
  buyerVerified: boolean;
  assetAvailable: boolean;
  verificationValid: boolean;
  policy: Policy;
  usage: Usage;
  approval?: { usage_hash: string; policy_hash: string; expires_at: string };
  now: string;
  checkStart?: boolean;
}) {
  const { policy, usage } = input;
  const codes: string[] = [];
  if (!input.buyerVerified) codes.push('BUYER_NOT_VERIFIED');
  if (!input.assetAvailable) codes.push('ASSET_UNAVAILABLE');
  if (!input.verificationValid) codes.push('VERIFICATION_EXPIRED');
  if (!policy.operations.includes(usage.operation)) codes.push('OPERATION_NOT_ALLOWED');
  if (
    !(['beauty', 'lifestyle', 'fashion'] as string[]).includes(usage.category) ||
    !(policy.categories as string[]).includes(usage.category) ||
    (policy.denied_categories as string[]).includes(usage.category)
  )
    codes.push('CATEGORY_DENIED');
  if (!usage.territories.every((t) => policy.territories.includes(t)))
    codes.push('TERRITORY_NOT_ALLOWED');
  if (!usage.channels.every((c) => policy.channels.includes(c))) codes.push('CHANNEL_NOT_ALLOWED');
  if (input.checkStart !== false && Date.parse(usage.starts_at) < Date.parse(input.now) + 86400000)
    codes.push('START_TOO_SOON');
  const usageHash = hash(usage),
    policyHash = hash(policy);
  if (codes.length)
    return {
      decision: 'DENY' as const,
      reason_codes: codes,
      usage_hash: usageHash,
      policy_hash: policyHash,
    };
  const approved =
    input.approval?.usage_hash === usageHash &&
    input.approval?.policy_hash === policyHash &&
    Date.parse(input.approval.expires_at) > Date.parse(input.now);
  if (policy.approval === 'manual' && !approved)
    return {
      decision: 'REQUIRES_APPROVAL' as const,
      reason_codes: ['APPROVAL_REQUIRED'],
      usage_hash: usageHash,
      policy_hash: policyHash,
    };
  return {
    decision: 'ALLOW' as const,
    reason_codes: [],
    usage_hash: usageHash,
    policy_hash: policyHash,
  };
}
export function price(policy: Policy, days: 30 | 90) {
  const base_minor = policy.prices[String(days) as '30' | '90'];
  const fee_minor = Math.floor((base_minor * 1500) / 10000);
  return {
    base_minor,
    fee_minor,
    creator_minor: base_minor - fee_minor,
    total_minor: base_minor,
    currency: 'EUR',
    fee_bps: 1500,
    tax_minor: 0,
    tax_mode: 'sandbox_unconfigured',
  };
}
export function licenseStatus(
  license: { status: string; starts_at: string | Date; ends_at: string | Date },
  signatureValid: boolean,
  now = new Date(),
) {
  if (!signatureValid) return 'INVALID';
  if (license.status === 'revoked') return 'REVOKED';
  if (license.status === 'suspended') return 'SUSPENDED';
  if (now < new Date(license.starts_at)) return 'NOT_YET_VALID';
  if (now >= new Date(license.ends_at)) return 'EXPIRED';
  return 'VALID';
}
export { DomainError } from './domain-error.js';
export * from './rights-core/index.js';
