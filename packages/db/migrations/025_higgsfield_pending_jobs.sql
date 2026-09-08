-- Pending HF jobs awaiting webhook completion (L3)
CREATE TABLE higgsfield_pending_jobs (
  hf_job_id text PRIMARY KEY,
  auth_id uuid NOT NULL REFERENCES generation_auths(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  grant_id uuid NOT NULL REFERENCES rights_grants(id),
  content_type text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('sandbox', 'live')),
  status text NOT NULL CHECK (status IN ('pending', 'reported', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz,
  last_error text
);

CREATE INDEX higgsfield_pending_jobs_auth_idx ON higgsfield_pending_jobs (auth_id);
CREATE INDEX higgsfield_pending_jobs_status_idx ON higgsfield_pending_jobs (status);
