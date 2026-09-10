-- FORCE RLS on outbox + journals + ledger_entries.
-- Visibility via orders (038): org member OR asset creator.
-- Bypass/admin via app_is_org_member() / app_rls_bypass().

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_select ON outbox;
CREATE POLICY outbox_select ON outbox
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = outbox.order_id
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

DROP POLICY IF EXISTS outbox_insert ON outbox;
CREATE POLICY outbox_insert ON outbox
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = outbox.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS outbox_update ON outbox;
CREATE POLICY outbox_update ON outbox
  FOR UPDATE
  USING (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = outbox.order_id
        AND app_is_org_member(o.organization_id)
    )
  )
  WITH CHECK (
    app_rls_bypass()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = outbox.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS outbox_delete ON outbox;
CREATE POLICY outbox_delete ON outbox
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journals_select ON journals;
CREATE POLICY journals_select ON journals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = journals.order_id
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

DROP POLICY IF EXISTS journals_insert ON journals;
CREATE POLICY journals_insert ON journals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = journals.order_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS journals_update ON journals;
CREATE POLICY journals_update ON journals
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS journals_delete ON journals;
CREATE POLICY journals_delete ON journals
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_entries_select ON ledger_entries;
CREATE POLICY ledger_entries_select ON ledger_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM journals j
      JOIN orders o ON o.id = j.order_id
      WHERE j.id = ledger_entries.journal_id
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

DROP POLICY IF EXISTS ledger_entries_insert ON ledger_entries;
CREATE POLICY ledger_entries_insert ON ledger_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM journals j
      JOIN orders o ON o.id = j.order_id
      WHERE j.id = ledger_entries.journal_id
        AND app_is_org_member(o.organization_id)
    )
  );

DROP POLICY IF EXISTS ledger_entries_update ON ledger_entries;
CREATE POLICY ledger_entries_update ON ledger_entries
  FOR UPDATE
  USING (app_rls_bypass() OR app_is_admin());

DROP POLICY IF EXISTS ledger_entries_delete ON ledger_entries;
CREATE POLICY ledger_entries_delete ON ledger_entries
  FOR DELETE
  USING (app_rls_bypass() OR app_is_admin());
