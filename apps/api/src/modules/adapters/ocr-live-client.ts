/**
 * Existing Deal OCR live client (L3).
 * POST {OCR_API_BASE}/v1/extract with Bearer key; expects proposed_rights JSON.
 * CI must mock fetch — never call live OCR in default tests.
 */
import { DomainError, ExternalProposedRightsSchema } from '../../../../../packages/domain/src/index.js';
import { config } from '../../common/config.js';

export type LiveOcrInput = {
  mime_type: string;
  filename?: string | null;
  sha256: string;
  /** Base64 file bytes (provider may OCR from content). */
  content_base64: string;
  current_proposed_rights?: unknown;
};

export type LiveOcrDeps = {
  fetchFn?: typeof fetch;
  apiBase?: string;
  apiKey?: string;
  enabled?: boolean;
};

export async function liveOcrExtractProposedRights(
  input: LiveOcrInput,
  deps: LiveOcrDeps = {},
) {
  const enabled = deps.enabled ?? config.ocrLiveEnabled;
  const apiBase = (deps.apiBase ?? config.ocrApiBase).replace(/\/$/, '');
  const apiKey = deps.apiKey ?? config.ocrApiKey;

  if (!enabled) {
    throw new DomainError(
      'OCR_LIVE_DISABLED',
      503,
      'OCR live no está habilitado (OCR_LIVE_ENABLED=true).',
    );
  }
  if (!apiBase || !apiKey) {
    throw new DomainError(
      'OCR_API_KEY_MISSING',
      503,
      'OCR live requiere OCR_API_BASE y OCR_API_KEY en env.',
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const url = `${apiBase}/v1/extract`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mime_type: input.mime_type,
      filename: input.filename ?? undefined,
      sha256: input.sha256,
      content_base64: input.content_base64,
      current_proposed_rights: input.current_proposed_rights,
    }),
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { detail: text.slice(0, 500) };
  }

  if (!res.ok) {
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${res.status}`;
    throw new DomainError(
      'OCR_LIVE_FAILED',
      res.status >= 400 && res.status < 600 ? res.status : 502,
      `OCR live falló: ${detail}`,
    );
  }

  const proposedRaw = body.proposed_rights ?? body;
  let proposed;
  try {
    proposed = ExternalProposedRightsSchema.parse(proposedRaw);
  } catch {
    throw new DomainError(
      'OCR_LIVE_INVALID_PAYLOAD',
      502,
      'OCR live no devolvió proposed_rights válido.',
    );
  }
  return ExternalProposedRightsSchema.parse({
    ...proposed,
    approval: {
      ...proposed.approval,
      ocr_extract: 'live_v0.1',
      ocr_mime: input.mime_type,
      ...(input.filename ? { ocr_filename: String(input.filename).slice(0, 120) } : {}),
    },
  });
}
