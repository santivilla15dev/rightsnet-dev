-- Durable Stripe refund tracking. Full refunds only in MVP.
-- License legal status remains separate from money movement.
ALTER TABLE refunds
  ADD COLUMN attempt_id uuid REFERENCES payment_attempts(id),
  ADD COLUMN payment_intent_ref text,
  ADD COLUMN charge_ref text,
  ADD COLUMN transfer_reversal_ref text,
  ADD COLUMN application_fee_refund_ref text,
  ADD COLUMN amount_minor integer CHECK (amount_minor IS NULL OR amount_minor > 0),
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  ADD COLUMN failure_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('requested', 'pending', 'succeeded', 'failed'));

CREATE UNIQUE INDEX refunds_provider_ref_uidx ON refunds(provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX refunds_pending_idx ON refunds(status) WHERE status IN ('requested', 'pending');

CREATE FUNCTION protect_refund_provider_refs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
    RAISE EXCEPTION 'Refund provider reference is immutable';
  END IF;
  IF OLD.payment_intent_ref IS NOT NULL AND NEW.payment_intent_ref IS DISTINCT FROM OLD.payment_intent_ref THEN
    RAISE EXCEPTION 'Refund PaymentIntent reference is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_refund_provider_refs BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION protect_refund_provider_refs();
