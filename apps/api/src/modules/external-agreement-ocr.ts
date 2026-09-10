/**
 * Existing Deal OCR L1 — file attach + sandbox extract (no live OCR, no Grant).
 * L3 live: optional HTTP OCR provider via ocr-live-client.
 */
import { createHash, randomUUID } from 'node:crypto';
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
import {
  liveOcrExtractProposedRights,
  type LiveOcrDeps,
} from './adapters/ocr-live-client.js';
import { objectStorePort } from './adapters/object-store.js';
import { malwareScannerPort } from './adapters/malware-scanner.js';

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

function agreementStorageKey(fileId: string) {
  return path.posix.join('agreements', fileId);
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
  const storageKey = agreementStorageKey(fid);
  const scan = await malwareScannerPort().scan(buffer, { mime_type: data.mime_type });
  await objectStorePort().put(storageKey, buffer);

  const row = (
    await db.query(
      `INSERT INTO external_agreement_files(
         id, agreement_id, storage_key, sha256, mime_type, size_bytes, scan_status, original_filename
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, agreement_id, sha256, mime_type, size_bytes, scan_status, original_filename, created_at`,
      [
        fid,
        agreementId,
        storageKey,
        sha256,
        data.mime_type,
        buffer.length,
        scan,
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

export type ExtractOpts = {
  liveOcr?: LiveOcrDeps;
  liveOcrFn?: typeof liveOcrExtractProposedRights;
};

export async function extractExternalAgreement(
  db: DB,
  user: Actor,
  agreementId: string,
  body: unknown = {},
  extractOpts: ExtractOpts = {},
) {
  const opts = z
    .object({
      mode: z.enum(['sandbox', 'live']).default('sandbox'),
    })
    .strict()
    .parse(body ?? {});

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
  if (file.scan_status !== 'clean') {
    throw new DomainError(
      'FILE_REJECTED',
      409,
      file.scan_status === 'rejected'
        ? 'El archivo fue rechazado; no se puede extraer.'
        : 'El archivo aún no tiene scan limpio; no se puede extraer.',
    );
  }

  const mode = opts.mode;
  await db.query(
    `UPDATE external_agreements
     SET extract_status='pending', extract_mode=$2, extract_error=NULL, updated_at=now()
     WHERE id=$1`,
    [agreementId, mode],
  );

  let proposed: ExternalProposedRights;
  try {
    if (mode === 'live') {
      const buffer = await objectStorePort().get(file.storage_key);
      const liveFn = extractOpts.liveOcrFn ?? liveOcrExtractProposedRights;
      proposed = await liveFn(
        {
          mime_type: file.mime_type,
          filename: file.original_filename,
          sha256: file.sha256,
          content_base64: buffer.toString('base64'),
          current_proposed_rights: agreement.proposed_rights,
        },
        extractOpts.liveOcr,
      );
      proposed = ExternalProposedRightsSchema.parse(proposed);
    } else {
      proposed = sandboxExtractProposedRights(agreement.proposed_rights, {
        filename: file.original_filename,
        mime_type: file.mime_type,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : 'extract failed';
    await db.query(
      `UPDATE external_agreements
       SET extract_status='failed', extract_mode=$2, extract_error=$3, updated_at=now()
       WHERE id=$1`,
      [agreementId, mode, msg],
    );
    throw e;
  }

  const updated = (
    await db.query(
      `UPDATE external_agreements
       SET proposed_rights=$2::jsonb,
           extract_status='ready',
           extract_mode=$3,
           extract_error=NULL,
           updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [agreementId, JSON.stringify(proposed), mode],
    )
  ).rows[0];

  await audit(db, user.id, `external_agreement.extract_${mode}`, agreementId, {
    file_id: file.id,
    extract_status: 'ready',
  });

  return {
    agreement: updated,
    proposed_rights: proposed,
    extract_status: 'ready' as const,
    grant_created: false,
    mode,
  };
}
