-- Rights Core integration: dual-path decisions, safety, consent terms, policy schema index.

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_decision_check;
ALTER TABLE requests
  ADD CONSTRAINT requests_decision_check
  CHECK (decision IN ('ALLOW', 'DENY', 'REQUIRES_APPROVAL', 'INCOMPLETE'));

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS policy_hash text,
  ADD COLUMN IF NOT EXISTS platform_policy_version text;

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS platform_policy_version text,
  ADD COLUMN IF NOT EXISTS buyer_organization_id uuid,
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS actor_role text
    CHECK (actor_role IS NULL OR actor_role IN ('creator', 'platform_reviewer')),
  ADD COLUMN IF NOT EXISTS revision integer;

ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS license_terms_version text;

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS schema_version text
    GENERATED ALWAYS AS (payload->>'schema_version') STORED;

CREATE INDEX IF NOT EXISTS policies_schema_version ON policies(schema_version);

CREATE TABLE IF NOT EXISTS safety_assessments (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES requests(id),
  request_hash text NOT NULL,
  assessor text NOT NULL,
  source text NOT NULL,
  version text NOT NULL,
  assessed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('CLEARED', 'REVIEW_REQUIRED', 'PROHIBITED', 'UNKNOWN')),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, request_hash)
);

CREATE TRIGGER immutable_safety_assessments
  BEFORE UPDATE OR DELETE ON safety_assessments
  FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();
