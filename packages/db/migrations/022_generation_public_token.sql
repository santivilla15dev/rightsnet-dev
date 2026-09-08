-- RN-GEN-YYYY-###### public tokens for generation verify
CREATE TABLE IF NOT EXISTS generation_public_seq (
  year int PRIMARY KEY,
  last_value int NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);

ALTER TABLE generation_records
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS generation_records_public_token_uidx
  ON generation_records (public_token)
  WHERE public_token IS NOT NULL;
