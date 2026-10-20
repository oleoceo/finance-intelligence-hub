-- M02 isolated/local bootstrap; live installation requires separate authorization.
-- Run as an administrator BEFORE migrations so finance_hub_migrations owns them.
-- Re-run AFTER migrations to reconcile existing grants. No credentials belong here.
-- Reconciliation is atomic, including when executed by psql with autocommit.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance_hub_migrations') THEN
    CREATE ROLE finance_hub_migrations LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance_hub_app') THEN
    CREATE ROLE finance_hub_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance_hub_readonly') THEN
    CREATE ROLE finance_hub_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, finance_hub_app, finance_hub_readonly;
GRANT USAGE, CREATE ON SCHEMA public TO finance_hub_migrations;
GRANT USAGE ON SCHEMA public TO finance_hub_app, finance_hub_readonly;

-- Defaults must name the actual object creator, not the bootstrap administrator.
ALTER DEFAULT PRIVILEGES FOR ROLE finance_hub_migrations IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finance_hub_app;
ALTER DEFAULT PRIVILEGES FOR ROLE finance_hub_migrations IN SCHEMA public
  GRANT SELECT ON TABLES TO finance_hub_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finance_hub_app;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM finance_hub_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM finance_hub_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO finance_hub_readonly;

DO $$
BEGIN
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM finance_hub_app;
  END IF;
  IF to_regclass('public.kysely_migration') IS NOT NULL THEN
    REVOKE ALL ON public.kysely_migration FROM finance_hub_app, finance_hub_readonly;
  END IF;
  IF to_regclass('public.kysely_migration_lock') IS NOT NULL THEN
    REVOKE ALL ON public.kysely_migration_lock FROM finance_hub_app, finance_hub_readonly;
  END IF;
END $$;

COMMIT;
