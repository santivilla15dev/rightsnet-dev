import { z } from 'zod';

/** Short-lived signed generation authority (Connect AUTHORIZED). Not RN-LIC. */
export const RnAuthPayloadSchema = z
  .object({
    schema_version: z.literal('rightsnet.rn-auth/0.1'),
    auth_id: z.string().uuid(),
    grant_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid(),
    provider: z.string().trim().min(1).max(64),
    use: z
      .object({
        content_type: z.string().trim().min(1).max(64),
        purpose: z.string().trim().min(1).max(64),
        territory: z.string().trim().min(1).max(16),
        industry: z.string().trim().min(1).max(64).optional(),
      })
      .strict(),
    issued_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    key_id: z.string().regex(/^[a-f0-9]{16}$/),
  })
  .strict();

export type RnAuthPayload = z.infer<typeof RnAuthPayloadSchema>;

export const RnAuthTokenSchema = z
  .object({
    payload: RnAuthPayloadSchema,
    signature: z.string().min(1),
    key_id: z.string().regex(/^[a-f0-9]{16}$/),
  })
  .strict();

export type RnAuthToken = z.infer<typeof RnAuthTokenSchema>;

export const RN_AUTH_DEFAULT_TTL_MS = 60 * 60 * 1000;
export const RN_AUTH_MAX_TTL_MS = 24 * 60 * 60 * 1000;

/** Cap TTL at 1h default, ≤24h, and ≤ grant.valid_until. */
export function computeRnAuthExpiry(input: {
  issuedAt: Date;
  grantValidUntil: Date;
  ttlMs?: number;
}): Date {
  const ttl = Math.min(input.ttlMs ?? RN_AUTH_DEFAULT_TTL_MS, RN_AUTH_MAX_TTL_MS);
  const byTtl = new Date(input.issuedAt.getTime() + ttl);
  const byGrant = input.grantValidUntil;
  return byTtl.getTime() <= byGrant.getTime() ? byTtl : byGrant;
}
