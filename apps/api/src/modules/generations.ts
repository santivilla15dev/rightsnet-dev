import { z } from 'zod';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { pool, type DB } from '../../../../packages/db/index.js';

const ListSchema = z
  .object({
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid().optional(),
    provider: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

type RecordRow = {
  id: string;
  auth_id: string;
  grant_id: string;
  organization_id: string;
  asset_id: string;
  provider: string;
  public_token: string | null;
  reported_at: Date | string;
  payload: {
    output?: Record<string, unknown>;
  };
};

function encodeCursor(reportedAt: Date | string, id: string) {
  return Buffer.from(`${new Date(reportedAt).toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { reportedAt: string; id: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [reportedAt, id] = raw.split('|');
    if (!reportedAt || !id) throw new Error('bad');
    z.string().datetime().parse(reportedAt);
    z.string().uuid().parse(id);
    return { reportedAt, id };
  } catch {
    throw new DomainError('INVALID_CURSOR', 400);
  }
}

export function toGenerationItem(row: RecordRow) {
  return {
    generation_id: row.id,
    public_token: row.public_token,
    auth_id: row.auth_id,
    grant_id: row.grant_id,
    organization_id: row.organization_id,
    asset_id: row.asset_id,
    provider: row.provider,
    reported_at: new Date(row.reported_at).toISOString(),
    output: row.payload?.output ?? {},
  };
}

export async function listPlatformGenerations(query: Record<string, unknown>) {
  const f = ListSchema.parse(query);
  const params: unknown[] = [f.organization_id];
  const where = ['organization_id=$1'];
  if (f.asset_id) {
    params.push(f.asset_id);
    where.push(`asset_id=$${params.length}`);
  }
  if (f.provider) {
    params.push(f.provider);
    where.push(`provider=$${params.length}`);
  }
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    params.push(c.reportedAt, c.id);
    where.push(
      `(reported_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    );
  }
  params.push(f.limit + 1);
  const rows = (
    await pool.query(
      `SELECT id, auth_id, grant_id, organization_id, asset_id, provider, public_token,
              reported_at, payload
       FROM generation_records
       WHERE ${where.join(' AND ')}
       ORDER BY reported_at DESC, id DESC
       LIMIT $${params.length}`,
      params,
    )
  ).rows as RecordRow[];

  const page = rows.slice(0, f.limit);
  const last = page[page.length - 1];
  return {
    surface: 'platform' as const,
    items: page.map(toGenerationItem),
    next_cursor: rows.length > f.limit && last ? encodeCursor(last.reported_at, last.id) : null,
  };
}

export async function getPlatformGeneration(id: string, organizationId?: string) {
  const generationId = z.string().uuid().parse(id);
  const org = organizationId ? z.string().uuid().parse(organizationId) : undefined;
  const row = (
    await pool.query(
      `SELECT id, auth_id, grant_id, organization_id, asset_id, provider, public_token,
              reported_at, payload
       FROM generation_records WHERE id=$1`,
      [generationId],
    )
  ).rows[0] as RecordRow | undefined;
  if (!row) throw new DomainError('NOT_FOUND', 404);
  if (org && row.organization_id !== org) throw new DomainError('NOT_FOUND', 404);
  return { surface: 'platform' as const, ...toGenerationItem(row) };
}

/** Mint RN-GEN-YYYY-###### inside an open transaction. */
export async function nextPublicGenerationToken(db: DB): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = (
    await db.query(
      `INSERT INTO generation_public_seq(year, last_value) VALUES($1, 1)
       ON CONFLICT (year) DO UPDATE SET last_value = generation_public_seq.last_value + 1
       RETURNING last_value`,
      [year],
    )
  ).rows[0] as { last_value: number };
  return `RN-GEN-${year}-${String(row.last_value).padStart(6, '0')}`;
}
