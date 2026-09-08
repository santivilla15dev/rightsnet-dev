-- RN-AUTH issuance ledger (Option B): short-lived signed generation authority
CREATE TABLE generation_auths (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES rights_grants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  provider text NOT NULL,
  use_snapshot jsonb NOT NULL,
  payload jsonb NOT NULL,
  signature text NOT NULL,
  key_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ISSUED', 'REVOKED', 'CONSUMED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at)
);

CREATE INDEX generation_auths_org_asset_idx
  ON generation_auths (organization_id, asset_id, status);

CREATE INDEX generation_auths_grant_idx
  ON generation_auths (grant_id);

CREATE INDEX generation_auths_expires_idx
  ON generation_auths (expires_at)
  WHERE status = 'ISSUED';
