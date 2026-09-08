import { z } from 'zod';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { pool } from '../../../../packages/db/index.js';

const GenTokenSchema = z
  .string()
  .regex(/^RN-GEN-\d{4}-\d{6}$/);

type Row = {
  id: string;
  public_token: string;
  auth_id: string;
  grant_id: string;
  organization_id: string;
  asset_id: string;
  provider: string;
  reported_at: Date | string;
  payload: {
    output?: {
      content_type?: string;
      sha256?: string;
      external_job_id?: string;
    };
  };
};

/** Public verify — safe fields only (no partner media uri). */
export async function publicVerifyGeneration(token: string) {
  const publicToken = GenTokenSchema.parse(token);
  const row = (
    await pool.query(
      `SELECT id, public_token, auth_id, grant_id, organization_id, asset_id, provider,
              reported_at, payload
       FROM generation_records WHERE public_token=$1`,
      [publicToken],
    )
  ).rows[0] as Row | undefined;
  if (!row) throw new DomainError('NOT_FOUND', 404);

  const output = row.payload?.output ?? {};
  return {
    surface: 'public' as const,
    status: 'RECORDED' as const,
    public_token: row.public_token,
    generation_id: row.id,
    reported_at: new Date(row.reported_at).toISOString(),
    provider: row.provider,
    content_type: output.content_type ?? null,
    sha256: output.sha256 ?? null,
    external_job_id: output.external_job_id ?? null,
    asset_id: row.asset_id,
    organization_id: row.organization_id,
    grant_id: row.grant_id,
    auth_consumed: true,
  };
}
