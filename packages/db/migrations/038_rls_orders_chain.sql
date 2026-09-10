-- FORCE RLS on commerce chain: requests → quotes → orders.
-- Visibility aligns with licenses (036): org member OR asset creator.
-- Bypass/admin still pass via app_is_org_member() / app_rls_bypass().

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requests_select ON requests;
CREATE POLICY requests_select ON requests
  FOR SELECT
  USING (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = requests.asset_id
        AND c.user_id = app_current_user_id()
    )
  );

DROP POLICY IF EXISTS requests_insert ON requests;
CREATE POLICY requests_insert ON requests
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS requests_update ON requests;
CREATE POLICY requests_update ON requests
  FOR UPDATE
  USING (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = requests.asset_id
        AND c.user_id = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = requests.asset_id
        AND c.user_id = app_current_user_id()
    )
  );

DROP POLICY IF EXISTS requests_delete ON requests;
CREATE POLICY requests_delete ON requests
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM requests r
      WHERE r.id = quotes.request_id
        AND (
          app_is_org_member(r.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = r.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM requests r
      WHERE r.id = quotes.request_id
        AND app_is_org_member(r.organization_id)
    )
  );

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM requests r
      WHERE r.id = quotes.request_id
        AND (
          app_is_org_member(r.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = r.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM requests r
      WHERE r.id = quotes.request_id
        AND (
          app_is_org_member(r.organization_id)
          OR EXISTS (
            SELECT 1
            FROM assets a
            JOIN creators c ON c.id = a.creator_id
            WHERE a.id = r.asset_id
              AND c.user_id = app_current_user_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT
  USING (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = orders.asset_id
        AND c.user_id = app_current_user_id()
    )
  );

DROP POLICY IF EXISTS orders_insert ON orders;
CREATE POLICY orders_insert ON orders
  FOR INSERT
  WITH CHECK (app_is_org_member(organization_id));

DROP POLICY IF EXISTS orders_update ON orders;
CREATE POLICY orders_update ON orders
  FOR UPDATE
  USING (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = orders.asset_id
        AND c.user_id = app_current_user_id()
    )
  )
  WITH CHECK (
    app_is_org_member(organization_id)
    OR EXISTS (
      SELECT 1
      FROM assets a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.id = orders.asset_id
        AND c.user_id = app_current_user_id()
    )
  );

DROP POLICY IF EXISTS orders_delete ON orders;
CREATE POLICY orders_delete ON orders
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin() OR app_is_org_member(organization_id));
