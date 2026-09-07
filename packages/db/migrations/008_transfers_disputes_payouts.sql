-- Separate creator Stripe balance movements from bank payouts.
-- Payouts are aggregated: never FK to a single order.
CREATE TABLE stripe_transfers (
  id uuid PRIMARY KEY,
  provider_ref text NOT NULL UNIQUE,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  connected_account_ref text NOT NULL,
  order_id uuid REFERENCES orders(id),
  payment_attempt_id uuid REFERENCES payment_attempts(id),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'EUR'),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'reversed')),
  destination_payment_ref text,
  source_transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stripe_transfer_reversals (
  id uuid PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES stripe_transfers(id),
  provider_ref text NOT NULL UNIQUE,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'EUR'),
  refund_id uuid REFERENCES refunds(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id uuid PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  provider_ref text NOT NULL UNIQUE,
  charge_ref text,
  payment_intent_ref text,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'EUR'),
  status text NOT NULL CHECK (status IN (
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost', 'prevented'
  )),
  reason text,
  evidence_due_at timestamptz,
  review_status text NOT NULL DEFAULT 'open'
    CHECK (review_status IN ('open', 'acknowledged', 'escalated', 'closed')),
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bank payout of a connected account. Never attribute to one RightsNet order.
CREATE TABLE payout_records (
  id uuid PRIMARY KEY,
  connected_account_ref text NOT NULL,
  provider_payout_id text NOT NULL UNIQUE,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'EUR'),
  status text NOT NULL CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  arrival_date date,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stripe_transfers_order_idx ON stripe_transfers(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX stripe_transfers_account_idx ON stripe_transfers(connected_account_ref);
CREATE INDEX disputes_open_idx ON disputes(review_status) WHERE review_status IN ('open', 'escalated');
CREATE INDEX payout_records_account_idx ON payout_records(connected_account_ref);

CREATE FUNCTION protect_money_provider_refs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'stripe_transfers' THEN
    IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
      RAISE EXCEPTION 'Transfer provider reference is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'disputes' THEN
    IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
      RAISE EXCEPTION 'Dispute provider reference is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'payout_records' THEN
    IF OLD.provider_payout_id IS NOT NULL AND NEW.provider_payout_id IS DISTINCT FROM OLD.provider_payout_id THEN
      RAISE EXCEPTION 'Payout provider reference is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_stripe_transfer_ref BEFORE UPDATE ON stripe_transfers
FOR EACH ROW EXECUTE FUNCTION protect_money_provider_refs();
CREATE TRIGGER immutable_dispute_ref BEFORE UPDATE ON disputes
FOR EACH ROW EXECUTE FUNCTION protect_money_provider_refs();
CREATE TRIGGER immutable_payout_ref BEFORE UPDATE ON payout_records
FOR EACH ROW EXECUTE FUNCTION protect_money_provider_refs();
