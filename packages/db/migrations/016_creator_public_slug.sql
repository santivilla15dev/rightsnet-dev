-- Public marketing slug for creator profile URLs (canonical asset id remains UUID).
ALTER TABLE creators ADD COLUMN IF NOT EXISTS public_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS creators_public_slug_uidx ON creators (public_slug) WHERE public_slug IS NOT NULL;
