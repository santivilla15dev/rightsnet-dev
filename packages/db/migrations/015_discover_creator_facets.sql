-- Marketplace discovery facets (declarative; not KYC).
ALTER TABLE creators ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unspecified';
ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_gender_check;
ALTER TABLE creators ADD CONSTRAINT creators_gender_check CHECK (gender IN ('female', 'male', 'non_binary', 'unspecified'));
ALTER TABLE creators ADD COLUMN IF NOT EXISTS age_band text NOT NULL DEFAULT '25_34';
ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_age_band_check;
ALTER TABLE creators ADD CONSTRAINT creators_age_band_check CHECK (age_band IN ('18_24', '25_34', '35_44', '45_plus'));
