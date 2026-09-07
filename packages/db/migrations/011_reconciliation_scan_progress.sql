-- Keep the completed watermark separate from an unfinished newest-first scan.
ALTER TABLE reconciliation_cursors
  ADD COLUMN scan_after text,
  ADD COLUMN scan_since bigint,
  ADD COLUMN scan_newest_ref text,
  ADD COLUMN scan_newest_created bigint;
