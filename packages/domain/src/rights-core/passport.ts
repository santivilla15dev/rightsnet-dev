import {
  RightsPassportPrivateSchema,
  RightsPassportPublicSchema,
  type RightsPassportPrivate,
  type RightsPassportPublic,
} from './schemas.js';

const PUBLIC_KEYS = [
  'schema_version',
  'passport_id',
  'revision',
  'asset_id',
  'asset_version',
  'creator_id',
  'policy_id',
  'policy_revision',
  'policy_hash',
  'purpose',
  'operations',
  'industries',
  'territories',
  'channels',
  'durations',
  'exclusivity',
  'additional_rights',
  'pricing',
  'platform_policy_version',
  'license_terms_version',
  'identity_verification_level',
  'relationship_verification_level',
  'generated_at',
  'public_display_name',
  'public_profile_slug',
] as const satisfies readonly (keyof RightsPassportPrivate)[];

/**
 * Build a public passport via allowlist construction — never strip secrets from a clone.
 */
export function projectPublicPassport(privatePassport: RightsPassportPrivate): RightsPassportPublic {
  const validated = RightsPassportPrivateSchema.parse(privatePassport);
  const publicProjection: Record<string, unknown> = {};
  for (const key of PUBLIC_KEYS) {
    publicProjection[key] = validated[key];
  }
  return RightsPassportPublicSchema.parse(publicProjection);
}

export function assertPublicPassportSafe(publicPassport: unknown): RightsPassportPublic {
  const parsed = RightsPassportPublicSchema.parse(publicPassport);
  const forbidden = [
    'legal_name',
    'contact_email',
    'date_of_birth',
    'identity_document_refs',
    'evidence_storage_urls',
    'evidence_refs',
    'consent_receipt_refs',
    'buyer_organization_id',
    'contract_refs',
    'transaction_refs',
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(publicPassport as object, key)) {
      throw new Error(`public passport must not expose ${key}`);
    }
  }
  return parsed;
}
