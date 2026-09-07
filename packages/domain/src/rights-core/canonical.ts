import { createHash } from 'node:crypto';

const TEXT_TRIM_KEYS = new Set([
  'campaign_name',
  'public_display_name',
  'public_profile_slug',
  'assessor',
  'source',
  'version',
  'platform_policy_version',
  'license_terms_version',
]);

const SET_ARRAY_KEYS = new Set([
  'territories',
  'channels',
  'requested_additional_rights',
  'prohibited_industries',
  'prohibited_intent_codes',
  'reason_codes',
  'missing_fields',
  'evidence_refs',
  'consent_receipt_refs',
  'identity_document_refs',
  'evidence_storage_urls',
  'contract_refs',
  'transaction_refs',
]);

/** Ordered evidence sequences retain order — do not sort these. */
const ORDERED_ARRAY_KEYS = new Set(['evidence_sequence']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLeaf(key: string | undefined, value: unknown): unknown {
  if (typeof value === 'string' && key && TEXT_TRIM_KEYS.has(key)) return value.trim();
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('NaN/Infinity rejected by rightsCanonical');
  }
  return value;
}

/**
 * Rights Core canonicalization (do not use for legacy signed snapshots).
 * Validates caller must schema-validate first; this normalizes for hashing.
 */
export function rightsCanonical(value: unknown, key?: string): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(normalizeLeaf(key, value));
  }
  if (Array.isArray(value)) {
    if (key && SET_ARRAY_KEYS.has(key) && !ORDERED_ARRAY_KEYS.has(key)) {
      const seen = new Set<string>();
      const sorted = [...value].map((item) => {
        const c = rightsCanonical(item);
        if (seen.has(c)) throw new Error('duplicate set members are rejected');
        seen.add(c);
        return c;
      });
      sorted.sort();
      return '[' + sorted.join(',') + ']';
    }
    return '[' + value.map((item) => rightsCanonical(item)).join(',') + ']';
  }
  if (!isPlainObject(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + rightsCanonical(normalizeLeaf(k, value[k]), k))
      .join(',') +
    '}'
  );
}

export function rightsHash(value: unknown): string {
  return createHash('sha256').update(rightsCanonical(value), 'utf8').digest('hex');
}
