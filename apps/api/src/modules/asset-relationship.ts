import { randomUUID } from 'node:crypto';
import type { DB } from '../../../../packages/db/index.js';
import { audit } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';

export type RelationshipReviewDecision = 'approve' | 'reject';

/** Admin sandbox review of creator↔likeness evidence. */
export async function reviewAssetRelationship(
  db: DB,
  actorId: string,
  assetId: string,
  decision: RelationshipReviewDecision,
  reason: string,
) {
  const a = (await db.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [assetId])).rows[0];
  if (!a) throw new DomainError('NOT_FOUND', 404);
  if (a.status !== 'pending_review') throw new DomainError('INVALID_STATE', 409);
  const files = (
    await db.query('SELECT id FROM asset_files WHERE asset_id=$1', [assetId])
  ).rows;
  if (!files.length)
    throw new DomainError('EVIDENCE_REQUIRED', 422, 'No hay evidencia para revisar.');

  await db.query(
    'INSERT INTO reviews(id,asset_id,actor_id,decision,reason) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), assetId, actorId, decision, reason],
  );
  await db.query('UPDATE assets SET relationship_status=$2,status=$3 WHERE id=$1', [
    assetId,
    decision === 'approve' ? 'reviewed' : 'rejected',
    decision === 'approve' ? 'draft' : 'rejected',
  ]);
  await db.query('UPDATE asset_files SET scan_status=$2 WHERE asset_id=$1', [
    assetId,
    decision === 'approve' ? 'clean' : 'rejected',
  ]);
  await audit(db, actorId, 'asset.sandbox_reviewed', assetId, {
    decision,
    reason,
    evidence_file_ids: files.map((f: { id: string }) => f.id),
  });
  return { reviewed: true, sandbox: true as const, decision };
}

export async function listAssetEvidenceFiles(db: DB, assetId: string) {
  return (
    await db.query(
      `SELECT id, mime_type, scan_status, size_bytes, created_at
       FROM asset_files WHERE asset_id=$1 ORDER BY created_at ASC`,
      [assetId],
    )
  ).rows as Array<{
    id: string;
    mime_type: string;
    scan_status: string;
    size_bytes: number;
    created_at: string;
  }>;
}
