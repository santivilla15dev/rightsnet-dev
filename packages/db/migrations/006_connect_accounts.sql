-- Connect accounts per creator and Stripe environment (test|live).
-- Account Link URLs are ephemeral and must never be stored.
CREATE TABLE connect_accounts (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES creators(id),
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  stripe_account_id text NOT NULL UNIQUE,
  transfers_status text NOT NULL DEFAULT 'pending'
    CHECK (transfers_status IN ('pending', 'active', 'inactive', 'unrequested')),
  requirements_due boolean NOT NULL DEFAULT true,
  disabled_reason text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, environment)
);

CREATE INDEX connect_accounts_creator_idx ON connect_accounts(creator_id);
