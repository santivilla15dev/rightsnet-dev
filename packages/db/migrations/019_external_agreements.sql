-- Existing Deal structured agreements (human-confirmed → RightsGrant)
CREATE TABLE external_agreements (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  grantor_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (
    status IN ('draft', 'pending_confirm', 'confirmed', 'rejected', 'superseded')
  ),
  title text NOT NULL,
  external_ref text,
  proposed_rights jsonb NOT NULL,
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX external_agreements_org_status_idx
  ON external_agreements (organization_id, status);

CREATE INDEX external_agreements_asset_status_idx
  ON external_agreements (asset_id, status);
