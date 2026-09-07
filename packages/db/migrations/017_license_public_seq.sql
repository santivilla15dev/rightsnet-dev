-- Sequential public license ids: RN-LIC-YYYY-######
CREATE TABLE IF NOT EXISTS license_public_seq (
  year int PRIMARY KEY,
  last_value int NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);
