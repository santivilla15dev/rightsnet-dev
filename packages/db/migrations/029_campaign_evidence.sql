CREATE TABLE campaign_evidence (
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  kind text NOT NULL CHECK (kind IN ('AUTH','OUTPUT')),
  evidence_id uuid NOT NULL,
  added_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id,kind,evidence_id)
);
