import { pool } from '../../../../packages/db/index.js';
import {
  upsertRightsGrantFromLicense,
  syncRightsGrantStatusForLicense,
  backfillMarketplaceRightsGrants,
} from '../../../../packages/db/rights-grants.js';
import { DomainError } from '../../../../packages/domain/src/index.js';

export {
  upsertRightsGrantFromLicense,
  syncRightsGrantStatusForLicense,
  backfillMarketplaceRightsGrants,
};

export async function listRightsGrants(filters: {
  organization_id?: string;
  asset_id?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.organization_id) {
    params.push(filters.organization_id);
    clauses.push(`grantee_organization_id=$${params.length}`);
  }
  if (filters.asset_id) {
    params.push(filters.asset_id);
    clauses.push(`asset_id=$${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = (
    await pool.query(
      `SELECT * FROM rights_grants ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    )
  ).rows;
  return { items: rows, surface: 'rights_grant' as const };
}

export async function getRightsGrant(id: string) {
  const row = (await pool.query('SELECT * FROM rights_grants WHERE id=$1', [id])).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  return row;
}
