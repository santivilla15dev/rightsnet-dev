export type LegacyPolicy = {
  schema_version: 'rightsnet.policy/0.1';
  operations: string[];
  categories: string[];
  territories: string[];
  channels: string[];
  denied_categories: string[];
  approval: 'automatic' | 'manual';
  prices: { '30': number; '90': number };
};

export type RuleState = 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL' | 'NOT_SPECIFIED';

export type RightsPolicy = {
  schema_version: 'rightsnet.rights-policy/0.1';
  policy_id: string;
  asset_id: string;
  creator_id: string;
  revision: number;
  purpose: Record<string, RuleState>;
  operations: Record<string, RuleState>;
  industries: Record<string, RuleState>;
  territories: Record<string, RuleState>;
  channels: Record<string, RuleState>;
  durations: Record<string, RuleState>;
  exclusivity: Record<string, RuleState>;
  additional_rights: Record<string, RuleState>;
  approval_mode: 'AUTOMATIC' | 'MANUAL';
  pricing: {
    revision: number;
    currency: 'EUR';
    duration_prices_minor: { '30': number | null; '90': number | null };
  };
  platform_policy_version: string;
  license_terms_version: string;
};

export type AnyPolicy = LegacyPolicy | RightsPolicy;

/** @deprecated Prefer LegacyPolicy / AnyPolicy */
export type Policy = LegacyPolicy;

export type ConnectStatus = {
  provider: 'sandbox' | 'stripe';
  environment: string;
  stripe_account_id: string | null;
  transfers_status: string;
  requirements_due: boolean;
  requirements_status: string | null;
  payouts_ready: boolean;
  onboarding_complete: boolean;
  can_start_onboarding: boolean;
  platform_setup_url: string | null;
};
export type Asset = {
  id: string;
  creator_id: string;
  display_name: string;
  bio: string;
  location: string;
  portrait: string;
  languages: string[];
  gender?: string;
  age_band?: string;
  public_slug?: string | null;
  status: string;
  identity_status: string;
  relationship_status: string;
  policy: AnyPolicy;
  policy_version: number;
  policy_hash: string;
  consented?: boolean;
  files?: { id: string; scan_status: string }[];
};
export type User = {
  id: string;
  display_name: string;
  role: string;
  organizations: {
    id: string;
    legal_name: string;
    verified: boolean;
    role: string;
    country?: string;
    website?: string | null;
    org_kind?: string;
  }[];
  has_creator?: boolean;
  sandbox?: boolean;
};
export type Usage = {
  campaign_name: string;
  operation?: string;
  generation_type?: string;
  purpose: string;
  category?: string;
  industry?: string;
  territories: string[];
  channels: string[];
  duration_days: 30 | 90;
  starts_at: string;
  exclusivity: string;
  sublicensing?: boolean;
  training?: boolean;
  voice_clone?: boolean;
  commercial_use?: boolean;
  requested_additional_rights?: [];
};
export type Price = {
  total_minor: number;
  base_minor: number;
  fee_minor: number;
  creator_minor: number;
  currency: string;
};
export type Order = {
  id: string;
  status: string;
  scope: Usage;
  price: Price;
  display_name: string;
  creator_name?: string;
  /** Nombre legal de la org compradora (JOIN organizations). */
  organization_legal_name?: string;
  portrait: string;
  contract_text: string;
  contract_hash: string;
  policy_snapshot?: AnyPolicy;
  created_at: string;
  license?: {
    id: string;
    public_token: string;
    status: string;
    starts_at?: string;
    ends_at?: string;
  };
  license_id?: string;
  public_token?: string;
  license_status?: string;
  /** Pago confirmado en cola; aún no emitir éxito en UI. */
  awaiting_payment_confirm?: boolean;
  /** Emisión de licencia en curso. */
  awaiting_license?: boolean;
};
export type License = {
  id: string;
  order_id: string;
  public_token: string;
  status: string;
  verification_status: string;
  starts_at: string;
  ends_at: string;
  display_name: string;
  portrait: string;
  scope: Usage;
  price: Price;
  signature: string;
  key_id: string;
};
export type LicenseRequest = {
  id: string;
  asset_id: string;
  display_name: string;
  portrait: string;
  usage: Usage;
  usage_hash: string;
  decision: string;
  reason_codes: string[];
  missing_fields?: string[];
  created_at: string;
  legal_name: string;
};
export type Verification = {
  license_id: string;
  public_token?: string;
  status: string;
  signature_valid: boolean;
  starts_at: string;
  ends_at: string;
  scope: Usage;
  key_id: string;
  checked_at: string;
  sandbox: boolean;
};
export type GenerationVerification = {
  surface: 'public';
  status: string;
  public_token: string;
  generation_id: string;
  reported_at: string;
  provider: string;
  content_type: string | null;
  sha256: string | null;
  external_job_id: string | null;
  asset_id: string;
  organization_id: string;
  grant_id: string;
  auth_consumed: boolean;
};
