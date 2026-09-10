-- FORCE RLS on payment_attempts + refunds via parent order (038 visibility).

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attempts_select ON payment_attempts;
CREATE POLICY payment_attempts_select ON payment_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = payment_attempts.order_id
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

DROP POLICY IF EXISTS payment_attempts_insert ON payment_attempts;
CREATE POLICY payment_attempts_insert ON payment_attempts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = payment_attempts.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS payment_attempts_update ON payment_attempts;
CREATE POLICY payment_attempts_update ON payment_attempts
  FOR UPDATE
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = payment_attempts.order_id
        AND app_is_org_member(o.organization_id)
    )
  )
  WITH CHECK (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = payment_attempts.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS payment_attempts_delete ON payment_attempts;
CREATE POLICY payment_attempts_delete ON payment_attempts
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_select ON refunds;
CREATE POLICY refunds_select ON refunds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = refunds.order_id
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

DROP POLICY IF EXISTS refunds_insert ON refunds;
CREATE POLICY refunds_insert ON refunds
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = refunds.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS refunds_update ON refunds;
CREATE POLICY refunds_update ON refunds
  FOR UPDATE
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = refunds.order_id
        AND app_is_org_member(o.organization_id)
    )
  )
  WITH CHECK (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = refunds.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS refunds_delete ON refunds;
CREATE POLICY refunds_delete ON refunds
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());
