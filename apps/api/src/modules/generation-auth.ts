import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DomainError,
  RnAuthPayloadSchema,
  RnAuthTokenSchema,
  computeRnAuthExpiry,
  type RnAuthToken,
} from '../../../../packages/domain/src/index.js';
import { pool, type DB } from '../../../../packages/db/index.js';
import { rnAuthSigningKeys, signRnAuthPayload, verifyRnAuthPayload } from '../integrations/signing.js';

export type MintRnAuthInput = {
  grantId: string;
  organizationId: string;
  assetId: string;
  provider: string;
  use: {
    content_type: string;
    purpose: string;
    territory: string;
    industry?: string;
  };
  grantValidUntil: Date | string;
  /** Optional clock override for tests. */
  now?: Date;
};

export async function mintRnAuthToken(input: MintRnAuthInput, db: DB = pool): Promise<RnAuthToken> {
  const issuedAt = input.now ?? new Date();
  const expiresAt = computeRnAuthExpiry({
    issuedAt,
    grantValidUntil: new Date(input.grantValidUntil),
  });
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new Error('RN-AUTH expiry must be after issued_at (grant may already be expired)');
  }

  const { kid } = rnAuthSigningKeys();
  const authId = randomUUID();
  const payload = RnAuthPayloadSchema.parse({
    schema_version: 'rightsnet.rn-auth/0.1',
    auth_id: authId,
    grant_id: input.grantId,
    organization_id: input.organizationId,
    asset_id: input.assetId,
    provider: input.provider,
    use: {
      content_type: input.use.content_type,
      purpose: input.use.purpose,
      territory: input.use.territory,
      ...(input.use.industry ? { industry: input.use.industry } : {}),
    },
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    key_id: kid,
  });

  const { signature, key_id } = signRnAuthPayload(payload);
  if (key_id !== payload.key_id) {
    throw new Error('RN-AUTH key_id mismatch after signing');
  }

  const token = RnAuthTokenSchema.parse({ payload, signature, key_id });

  await db.query(
    `INSERT INTO generation_auths(
       id, grant_id, organization_id, asset_id, provider, use_snapshot,
       payload, signature, key_id, status, issued_at, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,'ISSUED',$10,$11)`,
    [
      authId,
      input.grantId,
      input.organizationId,
      input.assetId,
      input.provider,
      JSON.stringify(input.use),
      JSON.stringify(token.payload),
      token.signature,
      token.key_id,
      token.payload.issued_at,
      token.payload.expires_at,
    ],
  );

  return token;
}

export type VerifyRnAuthResult =
  | { ok: true; payload: RnAuthToken['payload']; status: string }
  | { ok: false; reason: string };

/** Cryptographic + ledger check (expiry / revoked / consumed). */
export async function verifyRnAuthToken(
  token: unknown,
  db: DB = pool,
  now: Date = new Date(),
): Promise<VerifyRnAuthResult> {
  const parsed = RnAuthTokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: 'INVALID_TOKEN_SHAPE' };
  const { payload, signature, key_id } = parsed.data;
  if (key_id !== payload.key_id) return { ok: false, reason: 'KEY_ID_MISMATCH' };
  if (!verifyRnAuthPayload(payload, signature, key_id)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  if (new Date(payload.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const row = (
    await db.query(`SELECT status, expires_at FROM generation_auths WHERE id=$1`, [payload.auth_id])
  ).rows[0] as { status: string; expires_at: Date | string } | undefined;

  if (!row) return { ok: false, reason: 'UNKNOWN_AUTH_ID' };
  if (row.status === 'REVOKED') return { ok: false, reason: 'REVOKED' };
  if (row.status === 'CONSUMED') return { ok: false, reason: 'CONSUMED' };
  if (row.status !== 'ISSUED') return { ok: false, reason: 'INVALID_STATUS' };
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  return { ok: true, payload, status: row.status };
}

/**
 * Mark ISSUED RN-AUTH as REVOKED. Idempotent if already REVOKED.
 * organization_id must match ledger (cross-org revoke denied as NOT_FOUND).
 */
export async function revokeRnAuthToken(
  input: { authId: string; organizationId: string },
  db: DB = pool,
): Promise<{ auth_id: string; status: 'REVOKED'; idempotent: boolean }> {
  const row = (
    await db.query(
      `SELECT id, organization_id, status FROM generation_auths WHERE id=$1 FOR UPDATE`,
      [input.authId],
    )
  ).rows[0] as { id: string; organization_id: string; status: string } | undefined;

  if (!row || row.organization_id !== input.organizationId) {
    throw new DomainError('NOT_FOUND', 404, 'RN-AUTH no encontrado para esa organización.');
  }
  if (row.status === 'REVOKED') {
    return { auth_id: row.id, status: 'REVOKED', idempotent: true };
  }
  if (row.status === 'CONSUMED') {
    throw new DomainError(
      'AUTH_ALREADY_CONSUMED',
      409,
      'No se puede revocar un RN-AUTH ya consumido por report_output.',
    );
  }
  if (row.status !== 'ISSUED') {
    throw new DomainError('INVALID_STATUS', 409, `Estado RN-AUTH no revocable: ${row.status}`);
  }

  await db.query(
    `UPDATE generation_auths SET status='REVOKED' WHERE id=$1 AND status='ISSUED'`,
    [row.id],
  );
  return { auth_id: row.id, status: 'REVOKED', idempotent: false };
}

const ListAuthsSchema = z
  .object({
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid().optional(),
    status: z.enum(['ISSUED', 'REVOKED', 'CONSUMED']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function encodeAuthCursor(issuedAt: Date | string, id: string) {
  return Buffer.from(`${new Date(issuedAt).toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeAuthCursor(cursor: string): { issuedAt: string; id: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [issuedAt, id] = raw.split('|');
    if (!issuedAt || !id) throw new Error('bad');
    z.string().datetime().parse(issuedAt);
    z.string().uuid().parse(id);
    return { issuedAt, id };
  } catch {
    throw new DomainError('INVALID_CURSOR', 400);
  }
}

/**
 * Partner list of RN-AUTH rows. Never returns signature.
 */
export async function listPlatformGenerationAuths(query: Record<string, unknown>) {
  const f = ListAuthsSchema.parse(query);
  const params: unknown[] = [f.organization_id];
  const where = ['organization_id=$1'];
  if (f.asset_id) {
    params.push(f.asset_id);
    where.push(`asset_id=$${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`status=$${params.length}`);
  }
  if (f.cursor) {
    const c = decodeAuthCursor(f.cursor);
    params.push(c.issuedAt, c.id);
    where.push(
      `(issued_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    );
  }
  params.push(f.limit + 1);
  const rows = (
    await pool.query(
      `SELECT id, grant_id, organization_id, asset_id, provider, use_snapshot,
              status, issued_at, expires_at
       FROM generation_auths
       WHERE ${where.join(' AND ')}
       ORDER BY issued_at DESC, id DESC
       LIMIT $${params.length}`,
      params,
    )
  ).rows as {
    id: string;
    grant_id: string;
    organization_id: string;
    asset_id: string;
    provider: string;
    use_snapshot: unknown;
    status: string;
    issued_at: Date | string;
    expires_at: Date | string;
  }[];

  const page = rows.slice(0, f.limit);
  const last = page[page.length - 1];
  return {
    surface: 'platform' as const,
    items: page.map((row) => ({
      auth_id: row.id,
      grant_id: row.grant_id,
      organization_id: row.organization_id,
      asset_id: row.asset_id,
      provider: row.provider,
      status: row.status,
      use: row.use_snapshot ?? {},
      issued_at: new Date(row.issued_at).toISOString(),
      expires_at: new Date(row.expires_at).toISOString(),
    })),
    next_cursor:
      rows.length > f.limit && last ? encodeAuthCursor(last.issued_at, last.id) : null,
  };
}
