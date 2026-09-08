-- RightsGrant: bilateral machine-readable authority (marketplace projection v0.1)
CREATE TABLE rights_grants (
  id uuid PRIMARY KEY,
  grantor_user_id uuid NOT NULL REFERENCES users(id),
  grantee_organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  source_type text NOT NULL CHECK (source_type IN ('MARKETPLACE_LICENSE', 'EXISTING_AGREEMENT')),
  source_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from),
  UNIQUE (source_type, source_id)
);

CREATE INDEX rights_grants_grantee_asset_status_idx
  ON rights_grants (grantee_organization_id, asset_id, status);

CREATE INDEX rights_grants_asset_status_idx
  ON rights_grants (asset_id, status);
