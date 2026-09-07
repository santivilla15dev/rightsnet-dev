ALTER TABLE journals ADD COLUMN created_txid bigint NOT NULL DEFAULT txid_current();
CREATE FUNCTION reject_closed_journal_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
IF NOT EXISTS(SELECT 1 FROM journals WHERE id=NEW.journal_id AND created_txid=txid_current()) THEN RAISE EXCEPTION 'Journal is closed'; END IF;
RETURN NEW;
END $$;
CREATE TRIGGER closed_journals BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_closed_journal_entry();
