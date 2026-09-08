-- Immutable GenerationRecord from partner report_output (output metadata embedded)
CREATE TABLE generation_records (
  id uuid PRIMARY KEY,
  auth_id uuid NOT NULL REFERENCES generation_auths(id),
  grant_id uuid NOT NULL REFERENCES rights_grants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  provider text NOT NULL,
  idempotency_key text,
  payload jsonb NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_id)
);

CREATE UNIQUE INDEX generation_records_org_idempotency_uidx
  ON generation_records (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX generation_records_org_reported_idx
  ON generation_records (organization_id, reported_at DESC);
