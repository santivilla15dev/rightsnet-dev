-- FORCE RLS on licenses + generation_auths + generation_records.
-- Bypass/admin still pass via app_is_org_member().

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS licenses_select ON licenses;
CREATE POLICY licenses_select ON licenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = licenses.order_id
        AND (
          app_is_org_member(o.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = o.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS licenses_insert ON licenses;
CREATE POLICY licenses_insert ON licenses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = licenses.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS licenses_update ON licenses;
CREATE POLICY licenses_update ON licenses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = licenses.order_id
        AND (
          app_is_org_member(o.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = o.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = licenses.order_id
        AND (
          app_is_org_member(o.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = o.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS licenses_delete ON licenses;
CREATE POLICY licenses_delete ON licenses
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE generation_auths ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_auths FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generation_auths_select ON generation_auths;
CREATE POLICY generation_auths_select ON generation_auths
  FOR SELECT
  USING (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_auths_insert ON generation_auths;
CREATE POLICY generation_auths_insert ON generation_auths
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_auths_update ON generation_auths;
CREATE POLICY generation_auths_update ON generation_auths
  FOR UPDATE
  USING (app_is_org_member(organization_id))
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_auths_delete ON generation_auths;
CREATE POLICY generation_auths_delete ON generation_auths
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));

ALTER TABLE generation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generation_records_select ON generation_records;
CREATE POLICY generation_records_select ON generation_records
  FOR SELECT
  USING (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_records_insert ON generation_records;
CREATE POLICY generation_records_insert ON generation_records
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_records_update ON generation_records;
CREATE POLICY generation_records_update ON generation_records
  FOR UPDATE
  USING (app_is_org_member(organization_id))
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS generation_records_delete ON generation_records;
CREATE POLICY generation_records_delete ON generation_records
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));
