/**
 * Existing Deal bulk confirm v0.1.
 * Human-selected agreement_ids only — never "confirm all" without IDs.
 */
import { z } from 'zod';
import type { DB } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { confirmExternalAgreement } from './external-agreements.js';

export const BULK_CONFIRM_MAX_IDS = 100;

const BulkConfirmBodySchema = z
  .object({
    organization_id: z.string().uuid(),
    agreement_ids: z.array(z.string().uuid()).min(1).max(BULK_CONFIRM_MAX_IDS),
  })
  .strict();

export type BulkConfirmResult = {
  surface: 'external_agreement_bulk_confirm';
  confirmed: {
    id: string;
    title: string;
    grant_id: string;
    grant_status: string;
    idempotent: boolean;
  }[];
  errors: { id: string; message: string }[];
  total: number;
};

/**
 * Confirm explicit agreement IDs for one org. Reuses confirmExternalAgreement.
 */
export async function bulkConfirmExternalAgreements(
  db: DB,
  user: Actor,
  body: unknown,
): Promise<BulkConfirmResult> {
  const data = BulkConfirmBodySchema.parse(body);
  const uniqueIds = [...new Set(data.agreement_ids)];

  const confirmed: BulkConfirmResult['confirmed'] = [];
  const errors: BulkConfirmResult['errors'] = [];

  for (const id of uniqueIds) {
    try {
      const row = (
        await db.query(
          'SELECT id, organization_id, title, status FROM external_agreements WHERE id=$1',
          [id],
        )
      ).rows[0];
      if (!row) {
        throw new DomainError('NOT_FOUND', 404, 'Acuerdo no encontrado.');
      }
      if (row.organization_id !== data.organization_id) {
        throw new DomainError(
          'BULK_CONFIRM_ORG_MISMATCH',
          403,
          'El acuerdo no pertenece a organization_id del body.',
        );
      }

      const result = await confirmExternalAgreement(db, user, id);
      confirmed.push({
        id,
        title: String(result.agreement.title ?? row.title),
        grant_id: String(result.grant.id),
        grant_status: String(result.grant.status),
        idempotent: Boolean(result.idempotent),
      });
    } catch (e) {
      const message =
        e instanceof DomainError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'confirmación fallida';
      errors.push({ id, message: message.slice(0, 300) });
    }
  }

  return {
    surface: 'external_agreement_bulk_confirm',
    confirmed,
    errors,
    total: uniqueIds.length,
  };
}
