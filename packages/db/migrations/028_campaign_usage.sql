ALTER TABLE campaigns ADD COLUMN usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object');
