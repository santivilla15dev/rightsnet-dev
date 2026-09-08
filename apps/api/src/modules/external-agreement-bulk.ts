/**
 * Existing Deal bulk CSV ingest v0.1.
 * Creates pending_confirm agreements only — never auto-confirms Grant.
 */
import { z } from 'zod';
import type { DB } from '../../../../packages/db/index.js';
import { DomainError, ExternalProposedRightsSchema } from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import { createExternalAgreement } from './external-agreements.js';

export const BULK_CSV_MAX_ROWS = 100;

const BulkBodySchema = z
  .object({
    csv: z.string().min(1).max(2_000_000),
    organization_id: z.string().uuid().optional(),
    /** If true, stop on first row error. Default: continue and collect errors. */
    fail_fast: z.boolean().optional().default(false),
  })
  .strict();

/** Minimal RFC4180-ish CSV parse (quoted fields supported). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field.trim());
      field = '';
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function splitList(v: string): string[] {
  return v
    .split(/[|;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseRights(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of splitList(v)) {
    const idx = part.indexOf(':');
    if (idx <= 0) {
      out[part] = 'ALLOW';
      continue;
    }
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

const REQUIRED_HEADERS = [
  'organization_id',
  'asset_id',
  'title',
  'territories',
  'industry',
  'rights',
  'valid_from',
  'valid_until',
] as const;

export function rowToCreateBody(headers: string[], cells: string[]) {
  const map: Record<string, string> = {};
  headers.forEach((h, idx) => {
    map[h] = cells[idx] ?? '';
  });
  for (const h of REQUIRED_HEADERS) {
    if (!map[h]?.trim()) {
      throw new DomainError('BULK_CSV_ROW_INVALID', 422, `Falta columna ${h}`);
    }
  }

  let approval: Record<string, string> = {};
  if (map.approval_json?.trim()) {
    try {
      approval = z.record(z.string(), z.string()).parse(JSON.parse(map.approval_json));
    } catch {
      throw new DomainError('BULK_CSV_ROW_INVALID', 422, 'approval_json inválido');
    }
  }

  const proposed_rights = ExternalProposedRightsSchema.parse({
    rights: parseRights(map.rights),
    industry: splitList(map.industry),
    territories: splitList(map.territories),
    approval,
    valid_from: map.valid_from.trim(),
    valid_until: map.valid_until.trim(),
  });

  return {
    organization_id: map.organization_id.trim(),
    asset_id: map.asset_id.trim(),
    title: map.title.trim(),
    external_ref: map.external_ref?.trim() || undefined,
    status: 'pending_confirm' as const,
    proposed_rights,
  };
}

export type BulkCsvResult = {
  surface: 'external_agreement_bulk';
  created: { row: number; id: string; title: string }[];
  errors: { row: number; message: string }[];
  total_rows: number;
};

/**
 * Parse CSV and create pending_confirm agreements. Never confirms / never creates Grant.
 */
export async function bulkCreateExternalAgreementsFromCsv(
  db: DB,
  user: Actor,
  body: unknown,
  opts: {
    /** Enforce all rows share this org (owner path). Admin may omit. */
    requireOrganizationId?: string;
  } = {},
): Promise<BulkCsvResult> {
  const data = BulkBodySchema.parse(body);
  const table = parseCsv(data.csv);
  if (table.length < 2) {
    throw new DomainError('BULK_CSV_EMPTY', 422, 'CSV necesita cabecera + al menos una fila.');
  }

  const headers = table[0].map((h) => h.trim().toLowerCase());
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) {
      throw new DomainError('BULK_CSV_HEADER', 422, `Falta cabecera requerida: ${h}`);
    }
  }

  const dataRows = table.slice(1);
  if (dataRows.length > BULK_CSV_MAX_ROWS) {
    throw new DomainError(
      'BULK_CSV_TOO_MANY',
      422,
      `Máximo ${BULK_CSV_MAX_ROWS} filas por petición.`,
    );
  }

  const created: BulkCsvResult['created'] = [];
  const errors: BulkCsvResult['errors'] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-based with header
    try {
      const payload = rowToCreateBody(headers, dataRows[i]);
      if (
        opts.requireOrganizationId &&
        payload.organization_id !== opts.requireOrganizationId
      ) {
        throw new DomainError(
          'BULK_CSV_ORG_MISMATCH',
          403,
          'organization_id de la fila no coincide con tu organización.',
        );
      }
      const row = await createExternalAgreement(db, user, payload);
      created.push({ row: rowNum, id: row.id, title: row.title });
    } catch (e) {
      const message =
        e instanceof DomainError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'fila inválida';
      errors.push({ row: rowNum, message: message.slice(0, 300) });
      if (data.fail_fast) break;
    }
  }

  return {
    surface: 'external_agreement_bulk',
    created,
    errors,
    total_rows: dataRows.length,
  };
}
