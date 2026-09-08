/**
 * Existing Deal OCR L1 — file attach + sandbox extract (no live OCR, no Grant).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import {
  DomainError,
  ExternalProposedRightsSchema,
  type ExternalProposedRights,
} from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { getExternalAgreement } from './external-agreements.js';

export const AGREEMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const AGREEMENT_FILE_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const UploadSchema = z
  .object({
    base64: z.string().min(1).max(14_000_000),
    mime_type: z.enum(AGREEMENT_FILE_MIMES),
    original_filename: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function assertMagic(mime: (typeof AGREEMENT_FILE_MIMES)[number], buffer: Buffer) {
  if (mime === 'application/pdf') {
    const head = buffer.subarray(0, 5).toString('utf8');
    if (head !== '%PDF-') throw new DomainError('INVALID_FILE', 422, 'PDF inválido.');
    return;
  }
  if (mime === 'image/png') {
    const ok = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!ok) throw new DomainError('INVALID_FILE', 422, 'PNG inválido.');
    return;
  }
  if (!(buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)) {
    throw new DomainError('INVALID_FILE', 422, 'JPEG inválido.');
  }
}

function uploadsDir() {
  return path.resolve('.local/uploads/agreements');
}

/** Sandbox stub: suggest reviewable proposed_rights without network OCR. Never creates Grant. */
export function sandboxExtractProposedRights(
  current: unknown,
  meta: { filename?: string | null; mime_type: string },
): ExternalProposedRights {
  const now = Date.now();
  const fallback: ExternalProposedRights = {
    rights: {
      synthetic_video: 'ALLOW',
      synthetic_image: 'ALLOW',
      commercial_advertising: 'ALLOW',
    },
    industry: ['beauty'],
    territories: ['DE', 'AT'],
    approval: {},
    valid_from: new Date(now).toISOString(),
    valid_until: new Date(now + 86400000 * 365).toISOString(),
  };

  let base = fallback;
  try {
    base = ExternalProposedRightsSchema.parse(current);
  } catch {
    /* keep fallback */
  }

  return ExternalProposedRightsSchema.parse({
    ...base,
    approval: {
      ...base.approval,
      ocr_extract: 'sandbox_v0.1',
      ocr_mime: meta.mime_type,
      ...(meta.filename ? { ocr_filename: meta.filename.slice(0, 120) } : {}),
    },
  });
}

export async function listExternalAgreementFiles(agreementId: string) {
  await getExternalAgreement(agreementId);
  const items = (
    await pool.query(
      `SELECT id, agreement_id, sha256, mime_type, size_bytes, scan_status, original_filename, created_at
       FROM external_agreement_files WHERE agreement_id=$1`,
      [agreementId],
    )
  ).rows;
  return { items, surface: 'external_agreement_file' as const };
}

export async function uploadExternalAgreementFile(
  db: DB,
  user: Actor,
  agreementId: string,
  body: unknown,
) {
  const data = UploadSchema.parse(body);
  const agreement = (
    await db.query('SELECT * FROM external_agreements WHERE id=$1 FOR UPDATE', [agreementId])
  ).rows[0];
  if (!agreement) throw new DomainError('NOT_FOUND', 404);
  if (agreement.status !== 'draft' && agreement.status !== 'pending_confirm') {
    throw new DomainError(
      'INVALID_STATE',
      409,
      'Solo se pueden adjuntar archivos a acuerdos draft o pending_confirm.',
    );
  }

  const existing = (
    await db.query('SELECT id FROM external_agreement_files WHERE agreement_id=$1', [agreementId])
  ).rows[0];
  if (existing) {
    throw new DomainError(
      'FILE_ALREADY_ATTACHED',
      409,
      'v0.1 permite un solo archivo por acuerdo; cree otro acuerdo o supersede.',
    );
  }

  const buffer = Buffer.from(data.base64, 'base64');
  if (!buffer.length || buffer.length > AGREEMENT_FILE_MAX_BYTES) {
    throw new DomainError('FILE_TOO_LARGE', 422, 'Máximo 10 MiB por contrato.');
  }
  assertMagic(data.mime_type, buffer);

  const fid = randomUUID();
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, fid), buffer, { mode: 0o600, flag: 'wx' });

  // Sandbox L1: mark clean immediately (no external scanner).
  const row = (
    await db.query(
      `INSERT INTO external_agreement_files(
         id, agreement_id, storage_key, sha256, mime_type, size_bytes, scan_status, original_filename
       ) VALUES ($1,$2,$3,$4,$5,$6,'clean',$7)
       RETURNING id, agreement_id, sha256, mime_type, size_bytes, scan_status, original_filename, created_at`,
      [
        fid,
        agreementId,
        fid,
        sha256,
        data.mime_type,
        buffer.length,
        data.original_filename ?? null,
      ],
    )
  ).rows[0];

  await db.query(
    `UPDATE external_agreements
     SET extract_status='none', extract_error=NULL, updated_at=now()
     WHERE id=$1`,
    [agreementId],
  );

  await audit(db, user.id, 'external_agreement.file_uploaded', agreementId, {
    file_id: fid,
    mime_type: data.mime_type,
    size_bytes: buffer.length,
  });

  return { ...row, sandbox: true };
}

export async function extractExternalAgreement(
  db: DB,
  user: Actor,
  agreementId: string,
  body: unknown = {},
) {
  const opts = z
    .object({
      mode: z.enum(['sandbox', 'live']).default('sandbox'),
    })
    .strict()
    .parse(body ?? {});

  if (opts.mode === 'live') {
    throw new DomainError(
      'OCR_LIVE_NOT_IMPLEMENTED',
      501,
      'OCR live (L3) no está implementado; use mode=sandbox.',
    );
  }

  const agreement = (
    await db.query('SELECT * FROM external_agreements WHERE id=$1 FOR UPDATE', [agreementId])
  ).rows[0];
  if (!agreement) throw new DomainError('NOT_FOUND', 404);
  if (agreement.status !== 'draft' && agreement.status !== 'pending_confirm') {
    throw new DomainError(
      'INVALID_STATE',
      409,
      'Solo se puede extraer sobre draft o pending_confirm.',
    );
  }

  const file = (
    await db.query('SELECT * FROM external_agreement_files WHERE agreement_id=$1', [agreementId])
  ).rows[0];
  if (!file) {
    throw new DomainError('FILE_REQUIRED', 422, 'Adjunta un archivo antes de extract.');
  }
  if (file.scan_status === 'rejected') {
    throw new DomainError('FILE_REJECTED', 409, 'El archivo fue rechazado; no se puede extraer.');
  }

  await db.query(
    `UPDATE external_agreements
     SET extract_status='pending', extract_mode='sandbox', extract_error=NULL, updated_at=now()
     WHERE id=$1`,
    [agreementId],
  );

  const proposed = sandboxExtractProposedRights(agreement.proposed_rights, {
    filename: file.original_filename,
    mime_type: file.mime_type,
  });

  const updated = (
    await db.query(
      `UPDATE external_agreements
       SET proposed_rights=$2::jsonb,
           extract_status='ready',
           extract_mode='sandbox',
           extract_error=NULL,
           updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [agreementId, JSON.stringify(proposed)],
    )
  ).rows[0];

  await audit(db, user.id, 'external_agreement.extract_sandbox', agreementId, {
    file_id: file.id,
    extract_status: 'ready',
  });

  // Explicit: no grant created here.
  return {
    agreement: updated,
    proposed_rights: proposed,
    extract_status: 'ready' as const,
    grant_created: false,
    mode: 'sandbox' as const,
  };
}
