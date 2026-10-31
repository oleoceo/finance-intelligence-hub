# Finance Hub backup layout template

For disposable local/CI use, create a private root with
`databases/finance-hub/local` or `databases/finance-hub/lab` (mode `0700`).
Set `FINANCE_BACKUP_ROOT` to that root and `FINANCE_BACKUP_ALLOWED_DATABASE`
to the exact database name. Supply `PGHOST`, `PGPORT`, `PGUSER`, and a mode
`0600` `PGPASSFILE` externally. Invoke `scripts/backup/finance-hub-dump.sh
local <database>`.
Each completed run is published as one private directory containing
`archive.dump` and `manifest.json`. A hidden `.staging.*` directory is
incomplete and must not be used for restore. The wrapper passes only its
explicit PostgreSQL connection settings to `pg_dump`, so inherited libpq
service and host overrides cannot redirect a run.

The future host layout is `/opt/apps/backups/databases/finance-hub/{lab,production}/`.
This template does not authorize or configure host deployment, Production,
scheduling, retention, upload, or restore. Recovery role creation uses the
existing `packages/database/roles/bootstrap.sql` under an authorized
administrator identity.
