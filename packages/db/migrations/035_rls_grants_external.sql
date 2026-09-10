-- FORCE RLS on rights_grants + external_agreements (org grantee / agreement org, or grantor).
-- app_is_org_member() already returns true under app.rls_bypass / app.is_admin.

ALTER TABLE rights_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rights_grants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rights_grants_select ON rights_grants;
CREATE POLICY rights_grants_select ON rights_grants
  FOR SELECT
  USING (
    app_is_org_member(grantee_organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS rights_grants_insert ON rights_grants;
CREATE POLICY rights_grants_insert ON rights_grants
  FOR INSERT
  WITH CHECK (
    app_is_org_member(grantee_organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS rights_grants_update ON rights_grants;
CREATE POLICY rights_grants_update ON rights_grants
  FOR UPDATE
  USING (
    app_is_org_member(grantee_organization_id)
    OR grantor_user_id = app_current_user_id()
  )
  WITH CHECK (
    app_is_org_member(grantee_organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS rights_grants_delete ON rights_grants;
CREATE POLICY rights_grants_delete ON rights_grants
  FOR DELETE
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR app_is_org_member(grantee_organization_id)
  );

ALTER TABLE external_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_agreements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_agreements_select ON external_agreements;
CREATE POLICY external_agreements_select ON external_agreements
  FOR SELECT
  USING (
    app_is_org_member(organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS external_agreements_insert ON external_agreements;
CREATE POLICY external_agreements_insert ON external_agreements
  FOR INSERT
  WITH CHECK (
    app_is_org_member(organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS external_agreements_update ON external_agreements;
CREATE POLICY external_agreements_update ON external_agreements
  FOR UPDATE
  USING (
    app_is_org_member(organization_id)
    OR grantor_user_id = app_current_user_id()
  )
  WITH CHECK (
    app_is_org_member(organization_id)
    OR grantor_user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS external_agreements_delete ON external_agreements;
CREATE POLICY external_agreements_delete ON external_agreements
  FOR DELETE
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR app_is_org_member(organization_id)
  );
