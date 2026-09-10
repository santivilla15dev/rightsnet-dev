-- Org-pilot RLS (FORCE). App pool sets app.rls_bypass=1 by default; tests clear it.

CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT lower(coalesce(nullif(current_setting('app.rls_bypass', true), ''), '0'))
    IN ('1', 'true', 'on');
$$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT lower(coalesce(nullif(current_setting('app.is_admin', true), ''), '0'))
    IN ('1', 'true', 'on');
$$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Bypass RLS while resolving membership (avoids policy recursion under FORCE).
CREATE OR REPLACE FUNCTION app_is_org_member(p_org uuid) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF app_rls_bypass() OR app_is_admin() THEN
    RETURN true;
  END IF;
  IF app_current_user_id() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM organization_members m
    WHERE m.organization_id = p_org
      AND m.user_id = app_current_user_id()
  );
END;
$$;

REVOKE ALL ON FUNCTION app_rls_bypass() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rls_bypass() TO rightsnet_app;
GRANT EXECUTE ON FUNCTION app_is_admin() TO rightsnet_app;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO rightsnet_app;
GRANT EXECUTE ON FUNCTION app_is_org_member(uuid) TO rightsnet_app;

-- organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations
  FOR SELECT
  USING (app_is_org_member(id));

DROP POLICY IF EXISTS organizations_insert ON organizations;
CREATE POLICY organizations_insert ON organizations
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin() OR app_current_user_id() IS NOT NULL);

DROP POLICY IF EXISTS organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING (app_is_org_member(id))
  WITH CHECK (app_is_org_member(id));

DROP POLICY IF EXISTS organizations_delete ON organizations;
CREATE POLICY organizations_delete ON organizations
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

-- organization_members
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_select ON organization_members;
CREATE POLICY organization_members_select ON organization_members
  FOR SELECT
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR user_id = app_current_user_id()
    OR app_is_org_member(organization_id)
  );

DROP POLICY IF EXISTS organization_members_insert ON organization_members;
CREATE POLICY organization_members_insert ON organization_members
  FOR INSERT
  WITH CHECK (
    app_rls_bypass()
    OR app_is_admin()
    OR user_id = app_current_user_id()
  );

DROP POLICY IF EXISTS organization_members_update ON organization_members;
CREATE POLICY organization_members_update ON organization_members
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id))
  WITH CHECK (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));

DROP POLICY IF EXISTS organization_members_delete ON organization_members;
CREATE POLICY organization_members_delete ON organization_members
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));

-- campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select ON campaigns;
CREATE POLICY campaigns_select ON campaigns
  FOR SELECT
  USING (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaigns_insert ON campaigns;
CREATE POLICY campaigns_insert ON campaigns
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaigns_update ON campaigns;
CREATE POLICY campaigns_update ON campaigns
  FOR UPDATE
  USING (app_is_org_member(organization_id))
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS campaigns_delete ON campaigns;
CREATE POLICY campaigns_delete ON campaigns
  FOR DELETE
  USING (app_is_org_member(organization_id));
