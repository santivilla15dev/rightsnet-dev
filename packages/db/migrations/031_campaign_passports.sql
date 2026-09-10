CREATE TABLE IF NOT EXISTS campaign_passport_seq (
  year int PRIMARY KEY,
  last_value int NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

CREATE TABLE campaign_passports (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  public_token text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  allowlist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowlist) = 'array'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  revoked_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(public_token) BETWEEN 16 AND 32)
);
CREATE INDEX campaign_passports_campaign_status
  ON campaign_passports(campaign_id, status, created_at DESC);
