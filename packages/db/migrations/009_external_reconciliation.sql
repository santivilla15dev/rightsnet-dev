-- External Stripe reconciliation is separate from the internal double-entry balance trigger.
CREATE TABLE stripe_balance_transactions (
  id uuid PRIMARY KEY,
  provider_ref text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  account_ref text NOT NULL, -- 'platform' or connected acct_*
  type text NOT NULL,
  amount_minor integer NOT NULL,
  fee_minor integer NOT NULL DEFAULT 0,
  net_minor integer NOT NULL,
  currency text NOT NULL CHECK (currency = 'EUR'),
  source_ref text,
  description text,
  available_on timestamptz,
  created_at_stripe timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_ref, account_ref, environment)
);

CREATE TABLE reconciliation_cursors (
  id uuid PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  account_ref text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('balance_transactions', 'events')),
  cursor_ref text,
  cursor_created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, account_ref, kind)
);

CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  account_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  imported_count integer NOT NULL DEFAULT 0,
  difference_count integer NOT NULL DEFAULT 0,
  recovered_events integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE reconciliation_differences (
  id uuid PRIMARY KEY,
  run_id uuid REFERENCES reconciliation_runs(id),
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  account_ref text NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  provider_ref text,
  local_ref text,
  amount_minor integer,
  currency text CHECK (currency IS NULL OR currency = 'EUR'),
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id)
);

CREATE INDEX balance_tx_account_idx ON stripe_balance_transactions(account_ref, created_at_stripe DESC);
CREATE INDEX recon_diff_open_idx ON reconciliation_differences(status) WHERE status = 'open';
