-- FORCE RLS on campaign child tables (H2–H6).
-- Parent campaigns already forced in 034. Bypass/admin via app_is_org_member().

ALTER TABLE campaign_talent ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_talent FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_talent_select ON campaign_talent;
CREATE POLICY campaign_talent_select ON campaign_talent
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_talent.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_talent_insert ON campaign_talent;
CREATE POLICY campaign_talent_insert ON campaign_talent
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_talent.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_talent_update ON campaign_talent;
CREATE POLICY campaign_talent_update ON campaign_talent
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_talent.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_talent.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_talent_delete ON campaign_talent;
CREATE POLICY campaign_talent_delete ON campaign_talent
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_talent.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

ALTER TABLE campaign_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_evidence_select ON campaign_evidence;
CREATE POLICY campaign_evidence_select ON campaign_evidence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_evidence.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_evidence_insert ON campaign_evidence;
CREATE POLICY campaign_evidence_insert ON campaign_evidence
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_evidence.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_evidence_update ON campaign_evidence;
CREATE POLICY campaign_evidence_update ON campaign_evidence
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_evidence.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_evidence.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

DROP POLICY IF EXISTS campaign_evidence_delete ON campaign_evidence;
CREATE POLICY campaign_evidence_delete ON campaign_evidence
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_evidence.campaign_id
        AND app_is_org_member(c.organization_id)
    )
  );

ALTER TABLE campaign_deal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_deal_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_deal_requests_select ON campaign_deal_requests;
CREATE POLICY campaign_deal_requests_select ON campaign_deal_requests
  FOR SELECT
  USING (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_deal_requests_insert ON campaign_deal_requests;
CREATE POLICY campaign_deal_requests_insert ON campaign_deal_requests
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_deal_requests_update ON campaign_deal_requests;
CREATE POLICY campaign_deal_requests_update ON campaign_deal_requests
  FOR UPDATE
  USING (app_is_org_member(organization_id))
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_deal_requests_delete ON campaign_deal_requests;
CREATE POLICY campaign_deal_requests_delete ON campaign_deal_requests
  FOR DELETE
  USING (app_is_org_member(organization_id));

ALTER TABLE campaign_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_passports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_passports_select ON campaign_passports;
CREATE POLICY campaign_passports_select ON campaign_passports
  FOR SELECT
  USING (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_passports_insert ON campaign_passports;
CREATE POLICY campaign_passports_insert ON campaign_passports
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_passports_update ON campaign_passports;
CREATE POLICY campaign_passports_update ON campaign_passports
  FOR UPDATE
  USING (app_is_org_member(organization_id))
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaign_passports_delete ON campaign_passports;
CREATE POLICY campaign_passports_delete ON campaign_passports
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));
