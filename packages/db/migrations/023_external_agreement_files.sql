-- Existing Deal contract files + extract status (OCR L1 sandbox)
ALTER TABLE external_agreements
  ADD COLUMN IF NOT EXISTS extract_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS extract_mode text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS extract_error text;

ALTER TABLE external_agreements DROP CONSTRAINT IF EXISTS external_agreements_extract_status_check;
ALTER TABLE external_agreements
  ADD CONSTRAINT external_agreements_extract_status_check
  CHECK (extract_status IN ('none', 'pending', 'ready', 'failed'));

ALTER TABLE external_agreements DROP CONSTRAINT IF EXISTS external_agreements_extract_mode_check;
ALTER TABLE external_agreements
  ADD CONSTRAINT external_agreements_extract_mode_check
  CHECK (extract_mode IN ('sandbox', 'live'));

CREATE TABLE external_agreement_files (
  id uuid PRIMARY KEY,
  agreement_id uuid NOT NULL REFERENCES external_agreements(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  scan_status text NOT NULL CHECK (scan_status IN ('pending', 'clean', 'rejected')),
  original_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id)
);

CREATE INDEX external_agreement_files_agreement_idx
  ON external_agreement_files (agreement_id);
