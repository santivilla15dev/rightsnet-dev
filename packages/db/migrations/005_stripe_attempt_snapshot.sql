ALTER TABLE payment_attempts ADD COLUMN stripe_request jsonb;
ALTER TABLE payment_attempts ADD COLUMN payment_intent_ref text UNIQUE;

CREATE FUNCTION protect_stripe_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.stripe_request IS NOT NULL AND NEW.stripe_request IS DISTINCT FROM OLD.stripe_request THEN
    RAISE EXCEPTION 'Stripe request snapshot is immutable';
  END IF;
  IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
    RAISE EXCEPTION 'Provider reference is immutable';
  END IF;
  IF OLD.payment_intent_ref IS NOT NULL AND NEW.payment_intent_ref IS DISTINCT FROM OLD.payment_intent_ref THEN
    RAISE EXCEPTION 'PaymentIntent reference is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_stripe_request BEFORE UPDATE ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION protect_stripe_request();
