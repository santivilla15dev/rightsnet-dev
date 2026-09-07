-- Creator identity verification checks (external provider refs only; no ID document blobs).
CREATE TABLE identity_checks (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES creators(id),
  provider text NOT NULL CHECK (provider IN ('sandbox', 'stripe')),
  provider_ref text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'verified', 'requires_input', 'rejected', 'canceled')),
  adult_verified boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (provider, provider_ref)
);

CREATE INDEX identity_checks_creator_idx ON identity_checks (creator_id, created_at DESC);
