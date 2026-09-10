CREATE TABLE campaign_deal_requests (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  selected_grant_id uuid REFERENCES rights_grants(id),
  status text NOT NULL CHECK (status IN ('DRAFT','SENT','WITHDRAWN','CLOSED')),
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(gaps) = 'array'),
  desired_usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(desired_usage) = 'object'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX campaign_deal_requests_campaign_status
  ON campaign_deal_requests(campaign_id, status, updated_at DESC);
CREATE UNIQUE INDEX campaign_deal_requests_one_draft
  ON campaign_deal_requests(campaign_id, asset_id)
  WHERE status = 'DRAFT';
