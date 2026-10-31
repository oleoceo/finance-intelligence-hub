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

## M09-P02 disposable encrypted protection

For local/CI verification only, set `FINANCE_RESTIC_REPOSITORY` and
`FINANCE_RCLONE_DESTINATION` to separate existing private directories. Supply
`RESTIC_PASSWORD_FILE` externally as a regular mode `0600` file. Keep that
password, the eventual rclone configuration and destination access credentials
in an independently controlled recovery store outside the VPS. Do not place
them in Git, logs or command arguments. Run
`bash scripts/backup/finance-hub-protect.sh <completed-P01-directory>`.

The runner verifies the published P01 manifest and SHA-256 before initializing
the local Restic repository. It creates a snapshot, checks the local repository,
then uses rclone to copy only encrypted repository objects to the local test
destination and compares source and destination. `OFFSITE_COMPLETE` means the
remote comparison passed. Exit 2 with `REMOTE_INCOMPLETE` means the local
snapshot and P01 artifact remain recoverable; retry the same command after
restoring the destination. Exit 1 means validation, password, snapshot or local
integrity failed. A retry may create another snapshot; this task does not prune
or delete snapshots.

Independent recovery requires the password file and access to the encrypted
repository copy. Copy the remote repository into a private local directory,
set `RESTIC_REPOSITORY` to that directory and `RESTIC_PASSWORD_FILE` to the
independently held password file, then run `restic check`, `restic snapshots`,
and `restic restore <snapshot-id> --target <private-restore-directory>`.
Compare the restored `archive.dump` to its `manifest.json` SHA-256 before any
database restore. Operational remote configuration and live restore are outside
M09-P02 authorization.
