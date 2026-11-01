# Finance Hub isolated restore runbook

## M09-P05 Finance Lab operator procedure (manual only)

This section is the live Finance Lab rehearsal contract. Only operator `leoceo` executes it on the VPS after the P05 implementation PR is reviewed and exact-head CI is green. The older synthetic procedure below remains the P04 local/CI baseline. Stop on any unexpected identity, nonzero exit, missing credential, or preexisting target. Do not use `finance_hub_prod`, existing `finance-hub-restore-test`, Docker volume deletion, `pg_dumpall`, `pg_restore --clean/--create`, Restic `forget/prune`, or rclone `sync`.

1. In a private operator log, record UTC start, `postgres-products` and `finance-products-db` identity, PostgreSQL 18.6, source `finance_hub_lab`, new recovery PostgreSQL 18 instance identity, empty `finance_restore_*` target name, free space, operator and credential-file paths. The backup database identity must have read-only privileges and access only to `finance_hub_lab`; do not add `finance-backup` to sudo or Docker. Keep every password and rclone config outside the repository and command output. Establish a private before/after source fingerprint with `finance-hub-lab-fingerprint.sh`; it prints counts and SHA-256 of all 13 application tables and the migration chain, including exact decimal text, IDs and states without printing rows.
2. Set `FINANCE_BACKUP_ALLOWED_DATABASE=finance_hub_lab`, `FINANCE_BACKUP_ROOT=/opt/apps/backups`, `PGHOST=postgres-products`, `PGPORT=5432`, `PGUSER`, and a mode 0600 `PGPASSFILE` for the read-only source identity. Resolve `postgres-products` only through the authorized internal `finance-products-db` path; no public database port. From the reviewed checkout run `bash scripts/backup/finance-hub-lab-dump.sh`. It checks the effective role cannot write source tables before calling the accepted P01 dump runner. Record the new artifact name and elapsed time. The script creates a new custom dump and manifest in `/opt/apps/backups/databases/finance-hub/lab` without replacing historical artifacts. Inspect the `PGDMP` magic, `pg_restore --list`, bytes and SHA-256. Stop if the manifest does not name `lab/finance_hub_lab`.
3. Create a distinct empty restricted local Restic directory and a fresh mode 0600 password file with a password independent of the synthetic proof. Keep a recovery copy of the secret outside the VPS. Set `FINANCE_RESTIC_REPOSITORY` to that empty directory, `RESTIC_PASSWORD_FILE` to the new secret file, `RCLONE_CONFIG_FILE` to the restricted OAuth config and `FINANCE_RCLONE_REMOTE=finance-drive:FinanceHub-Backups/finance-lab-p05/<unique-run-id>`. Set `FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD=yes`. Run `bash scripts/backup/finance-hub-lab-offsite.sh protect <new-artifact-directory>`. Expect `snapshot_seconds` and `transfer_seconds`; record `restic snapshots`, `restic check`, remote encrypted object listing and rclone check. No plaintext dump or manifest belongs in Drive.
4. Create **different empty** restricted directories for recovered repository and staging. Set `FINANCE_RESTIC_REPOSITORY` to the empty recovered repository, retaining the same approved remote/password/config. Run `bash scripts/backup/finance-hub-lab-offsite.sh recover <empty-staging-directory>`. Expect `recovery_seconds` and one snapshot ID. The script downloads encrypted objects from Drive, runs `restic check`, restores the snapshot and rechecks archive manifest, size, SHA-256 and `pg_restore --list`. Do not substitute the local repository.
5. In a new independently isolated PostgreSQL 18 instance outside the source service and its network, have the authorized recovery administrator verify the exact `finance_restore_*` database does not exist, then create it once. Preserve all existing databases and the `finance-hub-restore-test` container/volume; do not change existing VPS networks. Set `FINANCE_RESTORE_ALLOWED_DATABASE` to that exact new name, `FINANCE_RESTORE_SOURCE_DATABASE=finance_hub_lab`, `FINANCE_RESTORE_SOURCE_ENVIRONMENT=lab`, `FINANCE_RESTORE_BOOTSTRAP` to `packages/database/roles/bootstrap.sql`, and `FINANCE_SOURCE_PGHOST=postgres-products`. Identify the separately authorized recovery instance as `FINANCE_RECOVERY_INSTANCE=finance-hub-p05-restore-<run-id>` and verify that identity against the actual instance. Set `PGHOST/PGPORT/PGUSER/PGPASSFILE` for this isolated recovery instance only, never the source. Run `bash scripts/backup/finance-hub-lab-restore.sh <recovered-artifact-directory> <new-target-name>`. Expect `elapsed_seconds`; any failure leaves the target untrusted and requires a separately authorized new target, never a destructive retry.
6. Verify PostgreSQL 18 versions, migration chain, roles/grants, non-superuser application role, Books, Accounts, Transactions, Refund links, Audit, Inbox, Idempotency and Summary. Compare exact source and restored row identities, statuses, relations, dates, currency and monetary decimal strings with the fingerprint script before/after/on target. Start a separate Finance API process against the restored target only, with synthetic credentials and no WhatsApp/NPM route; verify reads, Summary and idempotent replay without a duplicate effect. Record backup, transfer, recovery and restore durations, all command exit codes, exact SHA/snapshot, redacted comparison results and independent reviewer sign-off. P05 remains AWAITING OPERATOR EXECUTION until this evidence exists and is accepted.

### Operator command checkpoints

Run each block only after its inputs and resource identities above have been checked privately. Never paste password values into a command or evidence log. A nonzero exit is a stop point.

```bash
set -euo pipefail
test "$FINANCE_BACKUP_ALLOWED_DATABASE" = finance_hub_lab
test "$FINANCE_BACKUP_ROOT" = /opt/apps/backups
test -f "$PGPASSFILE" && test "$(stat -c %a "$PGPASSFILE")" = 600
bash scripts/backup/finance-hub-lab-fingerprint.sh source > "$FINANCE_P05_EVIDENCE/source-before.fingerprint"
time bash scripts/backup/finance-hub-lab-dump.sh
```

Expected: one newly named Lab artifact, `archive.dump` and `manifest.json`; no historical artifact replaced. Stop if source identity, permissions or manifest disagree.

```bash
set -euo pipefail
test "$FINANCE_LAB_P05_CONFIRM_NEW_PASSWORD" = yes
test -f "$RESTIC_PASSWORD_FILE" && test "$(stat -c %a "$RESTIC_PASSWORD_FILE")" = 600
time bash scripts/backup/finance-hub-lab-offsite.sh protect "$FINANCE_P05_ARTIFACT"
```

Expected: `snapshot_seconds` and `transfer_seconds`, with a new encrypted repository and no plaintext dump in Drive. Stop on an existing remote prefix or failed check.

```bash
set -euo pipefail
test -z "$(find "$FINANCE_P05_STAGING" -mindepth 1 -maxdepth 1 -print -quit)"
time bash scripts/backup/finance-hub-lab-offsite.sh recover "$FINANCE_P05_STAGING"
```

Expected: `recovery_seconds` and one snapshot ID from the independently downloaded repository. Stop if the recovered manifest/hash differs.

```bash
set -euo pipefail
test "$FINANCE_RESTORE_SOURCE_DATABASE" = finance_hub_lab
test "$FINANCE_RESTORE_ALLOWED_DATABASE" = "$FINANCE_P05_TARGET"
test "$PGHOST" != postgres-products
time bash scripts/backup/finance-hub-lab-restore.sh "$FINANCE_P05_RECOVERED_ARTIFACT" "$FINANCE_P05_TARGET"
```

Expected: `finance restore: complete elapsed_seconds=...` on the new empty isolated target. Stop on any preexisting database/object or mismatch; do not retry against the same target.

After restore, switch the private `PG*` variables to the source read-only identity, capture `source-after.fingerprint`, and require `diff -u source-before.fingerprint source-after.fingerprint` to be empty. Switch `PG*` to the isolated target read identity, capture `target.fingerprint`, then compare the fingerprint files after removing only their first `database=` line. Any table count/hash or migration mismatch is failure. Finally run the isolated API checks; do not mark P05 DONE on SQL fingerprints alone.

**Scope:** authorized recovery rehearsal using a synthetic Finance Hub archive and a disposable PostgreSQL 18 database. M09-P04 does not authorize a live host, Lab, Production, real credentials, or operational recovery. Gate 0 and Gate C remain pending.

## Authorization and inputs

1. Record the change owner, source environment, artifact identifier, recovery operator, disposable PostgreSQL instance, and exact target database. The target must be a newly created, empty `finance_restore_*` database distinct from the source and any independent database. Stop if these facts cannot be established.
2. Obtain the completed P01 artifact directory containing `archive.dump` and `manifest.json`, or retrieve it from a verified P02 Restic snapshot into a restricted local directory. Hidden `.staging.*` directories and standalone dumps are incomplete. Keep the Restic password, rclone configuration, PostgreSQL password file, and any recovery copy outside the VPS and outside Git. Optional Finance Hub files, if separately protected, are restored to a separate restricted staging directory and verified independently; this PostgreSQL procedure does not imply they exist.
3. Use PostgreSQL 18 client tools (`pg_restore`, `psql`, `createdb`), Python 3, `sha256sum`, Bash, and the same major server version as the archive. Record `pg_restore --version` and `SHOW server_version`. Supply a privileged recovery/bootstrap identity through `PGHOST`, `PGPORT`, `PGUSER`, and a mode 0600 `PGPASSFILE`; do not pass passwords on the command line or in logs. The recovery identity must be explicitly authorized for role creation, `SET ROLE finance_hub_migrations`, and the isolated target. `finance_hub_app` must never be used for bootstrap.

## Preflight and restore

1. Verify the artifact before connecting: compare `manifest.json` bytes and SHA-256 to `archive.dump` (`stat -c %s`, `sha256sum`), then inspect `pg_restore --list archive.dump`. Confirm the manifest identifies the intended synthetic source and custom format. A checksum mismatch, truncated archive, or unexpected content stops the procedure.
2. Create the target on the disposable instance using the recovery administrator, after checking `pg_database` for collisions. Create only the approved `finance_restore_*` name. Do not use `--clean`, `--create`, or `--if-exists` on `pg_restore`. Never drop an existing database to make it empty.
3. Export `FINANCE_RESTORE_ALLOWED_DATABASE` with the exact new target name, `FINANCE_RESTORE_SOURCE_DATABASE` with the authorized source name, `FINANCE_RESTORE_SOURCE_ENVIRONMENT` with its authorized `local` or `lab` environment, and `FINANCE_RESTORE_BOOTSTRAP` pointing to the repository's `packages/database/roles/bootstrap.sql`. Set `PG*` connection variables and invoke `bash scripts/backup/finance-hub-restore.sh ARTIFACT_DIRECTORY TARGET_DATABASE`. The runner checks the manifest source identity and rejects staging artifacts before connection. It rejects a target containing user schemas, relations, functions, types or other user objects before bootstrap, executes the versioned bootstrap before restore, restores in one transaction with `--exit-on-error --single-transaction --no-owner --no-acl --role=finance_hub_migrations`, and reruns the same bootstrap to reconcile grants. It reports only elapsed local seconds. A nonzero exit is failure, even if some target objects exist.
4. Verify schema compatibility: `kysely_migration` must contain the accepted 001–005 chain and `migrateUp` on the restored database must report no pending migration. Do not apply new migrations as part of this rehearsal. Confirm table ownership by `finance_hub_migrations`, `finance_hub_app` is non-superuser without `CREATEROLE`, `CREATEDB`, or schema `CREATE`, and Audit UPDATE/DELETE/TRUNCATE remain denied.

## Financial and functional verification

Use exact SQL text for `numeric(18,2)` and exact API decimal strings; do not convert financial values through JavaScript Number. Compare source and target Books, Accounts, Transactions, Refund links, currencies, statuses, Audit Events, Inbox states, and Idempotency rows. Reconcile posted Expense, Income, Transfer, and Refund totals against Summary (`ordinary_income`, `gross_expenses`, `refunds`, `net_expenses`, `net`) for the same Book/date filters. Preserve IDs, dates, relations, and transaction versions. Query both databases through separate connections.

Configure a separate Finance Hub API process with `DATABASE_URL` pointing **only** to the restored target and temporary synthetic admin/ingest tokens. Check Transaction, Refund history, Audit and Summary GET responses against the source API. Replay a persisted Idempotency-Key with the same request and confirm the original result, then confirm no duplicate financial or audit effect. Never route operational traffic to the rehearsal API. Record SQL and API comparisons separately.

## Evidence and recovery from failure

Record artifact SHA-256, manifest, archive listing result, PostgreSQL versions, target identity, bootstrap/grant checks, migration status, SQL comparison, API response comparison, source and unrelated database checksums/state, start/end timestamps, elapsed local duration, and redacted command exit statuses. The measured duration is local/CI evidence, **not** proven Production RTO.

On checksum, bootstrap, restore, migration, or functional failure, stop. Do not start the API on the failed target. Preserve redacted failure evidence and the original artifact. If `pg_restore` is interrupted, treat the target as untrusted even though `--single-transaction` rolls back archive changes. An authorized operator may discard only the named disposable target after verifying its identity and ownership, then create a new empty target and restart from artifact verification. Never delete the source, an unrelated database, a shared volume, or any path inferred from untrusted input. Cleanup of the disposable test container and local artifact staging is bounded to resources created by that run; keep evidence according to the review process.
