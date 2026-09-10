-- FORCE RLS on Stripe money / reconciliation tables.
-- Helpers: order visibility + connected-account ownership.

CREATE OR REPLACE FUNCTION app_can_see_order(oid uuid) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT oid IS NOT NULL AND EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = oid
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
  );
$$;

CREATE OR REPLACE FUNCTION app_owns_connected_account(acct text) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT acct IS NOT NULL
    AND acct <> ''
    AND (
      app_rls_bypass()
      OR app_is_admin()
      OR EXISTS (
        SELECT 1
        FROM creators c
        WHERE c.connected_account = acct
          AND c.user_id = app_current_user_id()
      )
    );
$$;

REVOKE ALL ON FUNCTION app_can_see_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_owns_connected_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_see_order(uuid) TO rightsnet_app;
GRANT EXECUTE ON FUNCTION app_owns_connected_account(text) TO rightsnet_app;

ALTER TABLE stripe_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_transfers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_transfers_select ON stripe_transfers;
CREATE POLICY stripe_transfers_select ON stripe_transfers
  FOR SELECT
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR app_can_see_order(order_id)
    OR app_owns_connected_account(connected_account_ref)
  );

DROP POLICY IF EXISTS stripe_transfers_insert ON stripe_transfers;
CREATE POLICY stripe_transfers_insert ON stripe_transfers
  FOR INSERT
  WITH CHECK (
    app_rls_bypass()
    OR app_is_admin()
    OR app_can_see_order(order_id)
    OR app_owns_connected_account(connected_account_ref)
  );

DROP POLICY IF EXISTS stripe_transfers_update ON stripe_transfers;
CREATE POLICY stripe_transfers_update ON stripe_transfers
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS stripe_transfers_delete ON stripe_transfers;
CREATE POLICY stripe_transfers_delete ON stripe_transfers
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE stripe_transfer_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_transfer_reversals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_transfer_reversals_select ON stripe_transfer_reversals;
CREATE POLICY stripe_transfer_reversals_select ON stripe_transfer_reversals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM stripe_transfers t
      WHERE t.id = stripe_transfer_reversals.transfer_id
        AND (
          app_rls_bypass()
          OR app_is_admin()
          OR app_can_see_order(t.order_id)
          OR app_owns_connected_account(t.connected_account_ref)
        )
    )
  );

DROP POLICY IF EXISTS stripe_transfer_reversals_insert ON stripe_transfer_reversals;
CREATE POLICY stripe_transfer_reversals_insert ON stripe_transfer_reversals
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS stripe_transfer_reversals_update ON stripe_transfer_reversals;
CREATE POLICY stripe_transfer_reversals_update ON stripe_transfer_reversals
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS stripe_transfer_reversals_delete ON stripe_transfer_reversals;
CREATE POLICY stripe_transfer_reversals_delete ON stripe_transfer_reversals
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS disputes_select ON disputes;
CREATE POLICY disputes_select ON disputes
  FOR SELECT
  USING (app_rls_bypass() OR app_is_admin() OR app_can_see_order(order_id));

DROP POLICY IF EXISTS disputes_insert ON disputes;
CREATE POLICY disputes_insert ON disputes
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin() OR app_can_see_order(order_id));

DROP POLICY IF EXISTS disputes_update ON disputes;
CREATE POLICY disputes_update ON disputes
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS disputes_delete ON disputes;
CREATE POLICY disputes_delete ON disputes
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE payout_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_records_select ON payout_records;
CREATE POLICY payout_records_select ON payout_records
  FOR SELECT
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR app_owns_connected_account(connected_account_ref)
  );

DROP POLICY IF EXISTS payout_records_insert ON payout_records;
CREATE POLICY payout_records_insert ON payout_records
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS payout_records_update ON payout_records;
CREATE POLICY payout_records_update ON payout_records
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS payout_records_delete ON payout_records;
CREATE POLICY payout_records_delete ON payout_records
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE stripe_balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_balance_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_balance_transactions_select ON stripe_balance_transactions;
CREATE POLICY stripe_balance_transactions_select ON stripe_balance_transactions
  FOR SELECT
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR (
      account_ref <> 'platform'
      AND app_owns_connected_account(account_ref)
    )
  );

DROP POLICY IF EXISTS stripe_balance_transactions_insert ON stripe_balance_transactions;
CREATE POLICY stripe_balance_transactions_insert ON stripe_balance_transactions
  FOR INSERT
  WITH CHECK (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS stripe_balance_transactions_update ON stripe_balance_transactions;
CREATE POLICY stripe_balance_transactions_update ON stripe_balance_transactions
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS stripe_balance_transactions_delete ON stripe_balance_transactions;
CREATE POLICY stripe_balance_transactions_delete ON stripe_balance_transactions
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE reconciliation_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_cursors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_cursors_all ON reconciliation_cursors;
CREATE POLICY reconciliation_cursors_all ON reconciliation_cursors
  FOR ALL
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_runs_all ON reconciliation_runs;
CREATE POLICY reconciliation_runs_all ON reconciliation_runs
  FOR ALL
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());

ALTER TABLE reconciliation_differences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_differences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_differences_all ON reconciliation_differences;
CREATE POLICY reconciliation_differences_all ON reconciliation_differences
  FOR ALL
  USING (app_rls_bypass() OR app_is_admin())
  WITH CHECK (app_rls_bypass() OR app_is_admin());
