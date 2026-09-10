CREATE TABLE campaigns (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  creative_brief text NOT NULL DEFAULT '' CHECK (length(creative_brief) <= 10000),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_org_created ON campaigns (organization_id, created_at DESC, id DESC);
