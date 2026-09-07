-- Company setup for brand path: domicile AT/DE/ES, website, org_kind.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_country_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_country_check CHECK (country IN ('AT', 'DE', 'ES'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_kind text NOT NULL DEFAULT 'brand';
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_org_kind_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_org_kind_check CHECK (org_kind IN ('brand', 'agency'));
