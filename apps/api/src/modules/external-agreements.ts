import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import { upsertRightsGrantFromExternalAgreement } from '../../../../packages/db/rights-grants.js';
import {
  DomainError,
  ExternalProposedRightsSchema,
} from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';

const CreateExternalAgreementSchema = z
  .object({
    organization_id: z.string().uuid(),
    asset_id: z.string().uuid(),
    title: z.string().trim().min(3).max(200),
    external_ref: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['draft', 'pending_confirm']).default('pending_confirm'),
    proposed_rights: ExternalProposedRightsSchema,
  })
  .strict();

export async function createExternalAgreement(db: DB, user: Actor, body: unknown) {
  const data = CreateExternalAgreementSchema.parse(body);
  const asset = (
    await db.query(
      `SELECT a.id, c.user_id AS grantor_user_id
       FROM assets a JOIN creators c ON c.id=a.creator_id WHERE a.id=$1`,
      [data.asset_id],
    )
  ).rows[0];
  if (!asset) throw new DomainError('NOT_FOUND', 404, 'Asset no encontrado.');
  const org = (
    await db.query('SELECT id FROM organizations WHERE id=$1', [data.organization_id])
  ).rows[0];
  if (!org) throw new DomainError('NOT_FOUND', 404, 'Organización no encontrada.');

  const id = randomUUID();
  const row = (
    await db.query(
      `INSERT INTO external_agreements(
         id, organization_id, asset_id, grantor_user_id, status, title, external_ref, proposed_rights
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        id,
        data.organization_id,
        data.asset_id,
        asset.grantor_user_id,
        data.status,
        data.title,
        data.external_ref ?? null,
        JSON.stringify(data.proposed_rights),
      ],
    )
  ).rows[0];
  await audit(db, user.id, 'external_agreement.created', id, {
    organization_id: data.organization_id,
    asset_id: data.asset_id,
    status: data.status,
  });
  return row;
}

export async function listExternalAgreements(filters: {
  organization_id?: string;
  asset_id?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.organization_id) {
    params.push(filters.organization_id);
    clauses.push(`organization_id=$${params.length}`);
  }
  if (filters.asset_id) {
    params.push(filters.asset_id);
    clauses.push(`asset_id=$${params.length}`);
  }
  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = (
    await pool.query(
      `SELECT * FROM external_agreements ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    )
  ).rows;
  return { items: rows, surface: 'external_agreement' as const };
}

export async function getExternalAgreement(id: string) {
  const row = (await pool.query('SELECT * FROM external_agreements WHERE id=$1', [id])).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  return row;
}

export async function confirmExternalAgreement(db: DB, user: Actor, id: string) {
  const row = (
    await db.query('SELECT * FROM external_agreements WHERE id=$1 FOR UPDATE', [id])
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404);
  if (row.status === 'confirmed') {
    const grant = (
      await db.query(
        "SELECT * FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
        [id],
      )
    ).rows[0];
    return { agreement: row, grant, idempotent: true };
  }
  if (row.status !== 'draft' && row.status !== 'pending_confirm') {
    throw new DomainError(
      'INVALID_STATE',
      409,
      'Solo se pueden confirmar acuerdos en draft o pending_confirm.',
    );
  }

  const proposed = ExternalProposedRightsSchema.parse(row.proposed_rights);
  const policyBefore = (
    await db.query(
      `SELECT p.id, p.sha256 FROM policies p
       JOIN assets a ON a.policy_id=p.id WHERE a.id=$1`,
      [row.asset_id],
    )
  ).rows[0];

  const grantPayload = await upsertRightsGrantFromExternalAgreement(db, {
    agreementId: row.id,
    organizationId: row.organization_id,
    assetId: row.asset_id,
    grantorUserId: row.grantor_user_id,
    proposed,
  });

  const updated = (
    await db.query(
      `UPDATE external_agreements
       SET status='confirmed', confirmed_at=now(), confirmed_by=$2, updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [id, user.id],
    )
  ).rows[0];

  const policyAfter = (
    await db.query(
      `SELECT p.id, p.sha256 FROM policies p
       JOIN assets a ON a.policy_id=p.id WHERE a.id=$1`,
      [row.asset_id],
    )
  ).rows[0];
  if (
    policyBefore &&
    policyAfter &&
    (policyBefore.id !== policyAfter.id || policyBefore.sha256 !== policyAfter.sha256)
  ) {
    throw new DomainError(
      'POLICY_MUTATION_FORBIDDEN',
      500,
      'Confirmación no debe mutar RightsPolicy.',
    );
  }

  await audit(db, user.id, 'external_agreement.confirmed', id, {
    grant_id: grantPayload.grant_id,
    organization_id: row.organization_id,
    asset_id: row.asset_id,
  });

  const grant = (
    await db.query(
      "SELECT * FROM rights_grants WHERE source_type='EXISTING_AGREEMENT' AND source_id=$1",
      [id],
    )
  ).rows[0];
  return { agreement: updated, grant, idempotent: false };
}
