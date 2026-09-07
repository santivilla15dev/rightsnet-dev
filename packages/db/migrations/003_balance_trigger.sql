CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; deb bigint; cred bigint; n bigint;
BEGIN
jid := (to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='journals' THEN 'id' ELSE 'journal_id' END)::uuid;
SELECT count(*),coalesce(sum(amount_minor) FILTER(WHERE side='debit'),0),coalesce(sum(amount_minor) FILTER(WHERE side='credit'),0) INTO n,deb,cred FROM ledger_entries WHERE journal_id=jid;
IF n<2 OR deb<>cred THEN RAISE EXCEPTION 'Unbalanced journal %',jid; END IF;
RETURN NEW;
END $$;
