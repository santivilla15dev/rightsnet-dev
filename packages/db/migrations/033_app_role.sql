-- App DML role (no DDL). Migrator remains table owner (typically `rightsnet`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rightsnet_app') THEN
    CREATE ROLE rightsnet_app LOGIN;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO rightsnet_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO rightsnet_app;
REVOKE CREATE ON SCHEMA public FROM rightsnet_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rightsnet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rightsnet_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rightsnet_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rightsnet_app;
