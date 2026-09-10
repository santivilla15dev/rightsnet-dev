-- FORCE RLS on contract_acceptances (via order) and provider_events (system-only).

ALTER TABLE contract_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_acceptances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_acceptances_select ON contract_acceptances;
CREATE POLICY contract_acceptances_select ON contract_acceptances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = contract_acceptances.order_id
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

DROP POLICY IF EXISTS contract_acceptances_insert ON contract_acceptances;
CREATE POLICY contract_acceptances_insert ON contract_acceptances
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = contract_acceptances.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS contract_acceptances_update ON contract_acceptances;
CREATE POLICY contract_acceptances_update ON contract_acceptances
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS contract_acceptances_delete ON contract_acceptances;
CREATE POLICY contract_acceptances_delete ON contract_acceptances
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_events_select ON provider_events;
CREATE POLICY provider_events_select ON provider_events
  FOR SELECT
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS provider_events_insert ON provider_events;
CREATE POLICY provider_events_insert ON provider_events
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS provider_events_update ON provider_events;
CREATE POLICY provider_events_update ON provider_events
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS provider_events_delete ON provider_events;
CREATE POLICY provider_events_delete ON provider_events
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());
