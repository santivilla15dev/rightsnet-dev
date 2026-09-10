-- Thin Accounts v2 event recovery uses its own durable cursor (V2 page tokens).
ALTER TABLE reconciliation_cursors
  DROP CONSTRAINT IF EXISTS reconciliation_cursors_kind_check;

ALTER TABLE reconciliation_cursors
  ADD CONSTRAINT reconciliation_cursors_kind_check
  CHECK (kind IN ('balance_transactions', 'events', 'thin_events'));
