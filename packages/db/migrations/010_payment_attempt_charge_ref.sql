-- Charge id from PaymentIntent.latest_charge — used to match balance transactions (source=ch_…).
ALTER TABLE payment_attempts ADD COLUMN charge_ref text;
CREATE UNIQUE INDEX payment_attempts_charge_ref_uidx ON payment_attempts(charge_ref) WHERE charge_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_charge_ref_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.charge_ref IS NOT NULL AND NEW.charge_ref IS DISTINCT FROM OLD.charge_ref THEN
    RAISE EXCEPTION 'charge_ref is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_charge_ref BEFORE UPDATE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_charge_ref_mutation();
