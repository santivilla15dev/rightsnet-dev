CREATE TABLE campaign_talent (
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  selected_grant_id uuid REFERENCES rights_grants(id),
  added_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, asset_id)
);
CREATE INDEX campaign_talent_page ON campaign_talent(campaign_id, created_at, asset_id);
