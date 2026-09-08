import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DomainError,
  GenerationOutputSchema,
  GenerationRecordPayloadSchema,
  RnAuthPayloadSchema,
  type RnAuthPayload,
} from '../../../../packages/domain/src/index.js';
import { pool, transaction } from '../../../../packages/db/index.js';
import { config } from '../common/config.js';
import { verifyRnAuthPayload } from '../integrations/signing.js';
import { nextPublicGenerationToken } from './generations.js';

const ReportOutputSchema = z
  .object({
    auth_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    provider: z.string().trim().min(1).max(64),
    idempotency_key: z.string().trim().min(1).max(64).optional(),
    output: GenerationOutputSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

type AuthRow = {
  id: string;
  grant_id: string;
  organization_id: string;
  asset_id: string;
  provider: string;
  payload: unknown;
  signature: string;
  key_id: string;
  status: string;
  expires_at: Date | string;
};

function recordedResponse(row: {
  id: string;
  auth_id: string;
  grant_id: string;
  asset_id: string;
  organization_id: string;
  public_token: string | null;
}) {
  const verify_hint = row.public_token
    ? `${config.webUrl}/verify/generation/${row.public_token}`
    : null;
  return {
    surface: 'platform' as const,
    status: 'RECORDED' as const,
    generation_id: row.id,
    public_token: row.public_token,
    auth_id: row.auth_id,
    grant_id: row.grant_id,
    asset_id: row.asset_id,
    organization_id: row.organization_id,
    consumed: true,
    verify_hint,
  };
}

/**
 * Partner reports a generated output under an RN-AUTH id.
 * Consumes ISSUED auth → CONSUMED; persists immutable generation_records snapshot.
 */
export async function platformReportOutput(body: unknown, now: Date = new Date()) {
  const data = ReportOutputSchema.parse(body);

  if (data.idempotency_key) {
    const existing = (
      await pool.query(
        `SELECT id, auth_id, grant_id, asset_id, organization_id, public_token
         FROM generation_records
         WHERE organization_id=$1 AND idempotency_key=$2`,
        [data.organization_id, data.idempotency_key],
      )
    ).rows[0] as
      | {
          id: string;
          auth_id: string;
          grant_id: string;
          asset_id: string;
          organization_id: string;
          public_token: string | null;
        }
      | undefined;
    if (existing) {
      if (!existing.public_token) {
        const token = await transaction(async (db) => {
          const minted = await nextPublicGenerationToken(db);
          await db.query(
            `UPDATE generation_records SET public_token=$1 WHERE id=$2 AND public_token IS NULL`,
            [minted, existing.id],
          );
          return minted;
        });
        existing.public_token = token;
      }
      return recordedResponse(existing);
    }
  }

  const auth = (
    await pool.query(
      `SELECT id, grant_id, organization_id, asset_id, provider, payload, signature, key_id,
              status, expires_at
       FROM generation_auths WHERE id=$1`,
      [data.auth_id],
    )
  ).rows[0] as AuthRow | undefined;

  if (!auth) throw new DomainError('AUTH_NOT_FOUND', 404);

  if (auth.status === 'REVOKED') throw new DomainError('AUTH_REVOKED', 409);
  if (auth.status === 'CONSUMED') throw new DomainError('AUTH_CONSUMED', 409);
  if (auth.status !== 'ISSUED') throw new DomainError('AUTH_INVALID_STATUS', 409);

  if (auth.organization_id !== data.organization_id) {
    throw new DomainError('ORG_MISMATCH', 403);
  }
  if (auth.provider !== data.provider) {
    throw new DomainError('PROVIDER_MISMATCH', 409);
  }

  if (new Date(auth.expires_at).getTime() <= now.getTime()) {
    throw new DomainError('AUTH_EXPIRED', 409);
  }

  const payloadParsed = RnAuthPayloadSchema.safeParse(auth.payload);
  if (!payloadParsed.success) throw new DomainError('BAD_SIGNATURE', 409);
  const authPayload: RnAuthPayload = payloadParsed.data;
  if (authPayload.key_id !== auth.key_id) throw new DomainError('BAD_SIGNATURE', 409);
  if (!verifyRnAuthPayload(authPayload, auth.signature, auth.key_id)) {
    throw new DomainError('BAD_SIGNATURE', 409);
  }

  if (data.output.content_type !== authPayload.use.content_type) {
    throw new DomainError('OUTPUT_MISMATCH', 409);
  }

  const generationId = randomUUID();
  const reportedAt = now.toISOString();
  const recordPayload = GenerationRecordPayloadSchema.parse({
    schema_version: 'rightsnet.generation-record/0.1',
    generation_id: generationId,
    auth_id: auth.id,
    grant_id: auth.grant_id,
    organization_id: auth.organization_id,
    asset_id: auth.asset_id,
    provider: auth.provider,
    use: authPayload.use,
    output: data.output,
    ...(data.notes ? { notes: data.notes } : {}),
    reported_at: reportedAt,
  });

  let publicToken = '';
  await transaction(async (db) => {
    const locked = (
      await db.query(`SELECT status FROM generation_auths WHERE id=$1 FOR UPDATE`, [data.auth_id])
    ).rows[0] as { status: string } | undefined;
    if (!locked || locked.status !== 'ISSUED') {
      throw new DomainError('AUTH_CONSUMED', 409);
    }

    publicToken = await nextPublicGenerationToken(db);

    await db.query(
      `INSERT INTO generation_records(
         id, auth_id, grant_id, organization_id, asset_id, provider,
         idempotency_key, payload, reported_at, public_token
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        generationId,
        auth.id,
        auth.grant_id,
        auth.organization_id,
        auth.asset_id,
        auth.provider,
        data.idempotency_key ?? null,
        JSON.stringify(recordPayload),
        reportedAt,
        publicToken,
      ],
    );

    const updated = await db.query(
      `UPDATE generation_auths SET status='CONSUMED' WHERE id=$1 AND status='ISSUED'`,
      [data.auth_id],
    );
    if (!updated.rowCount) throw new DomainError('AUTH_CONSUMED', 409);
  });

  return recordedResponse({
    id: generationId,
    auth_id: auth.id,
    grant_id: auth.grant_id,
    asset_id: auth.asset_id,
    organization_id: auth.organization_id,
    public_token: publicToken,
  });
}
