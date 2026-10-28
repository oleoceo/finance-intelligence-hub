# INFRA-T01 operational contract — REVIEW REQUIRED

## Gate 0, coleta de 2026-10-28

A coleta administrativa informa Docker 29.3.0, Compose 5.1.0, 12 GiB RAM e 173 GB livres; `postgres-products`, `finance_postgres_products_data` e `finance-products-db` ausentes. n8n 2.23.3 está em `n8n_internal`/`proxy`; Evolution em `apps-backend`/`proxy`; Redis em `apps-backend`. UFW e Fail2Ban estão ativos. SSH efetivo permite root e senha, além de chave pública. Recuperação e backup pré-mudança seguem sem prova. A execução única restante, os critérios de aceite e as decisões constam de `GATE0-REMAINING.md`; até seu fechamento, esta sequência operacional não está liberada. A ausência do banco é condição para INFRA-T01, não falha do Gate 0.

Target: `/opt/apps/apps/databases/postgres-products`. This directory is a local staging package. Nothing here authorizes VPS changes. Scope is one PostgreSQL 18 Lab instance, one dedicated named volume, and the internal `finance-products-db` network. No host port, Production database, shared network change, or secret is included.

## Image and bootstrap

`docker buildx imagetools inspect postgres:18.6-bookworm` on 2026-10-28 returned OCI index `sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8`; linux/amd64 manifest `sha256:41a369edc91d9bdd7a58be6bc71ea0f8f7a3f49e82818a9f0829021ea7840b7c`. The Compose pins the index and architecture. Before approved deployment, pull by digest and verify the resolved platform manifest and image provenance on the target host. Registry inspection is not a signature verification. Record digest and Compose SHA-256 in the change record.

The official image creates a bootstrap PostgreSQL superuser. It must never be used by the Finance API. After initial health, an authorized operator applies the existing reviewed `packages/database/roles/bootstrap.sql` to `finance_hub_lab`, creates distinct credentials for `finance_hub_migrations`, `finance_hub_app`, and optional `finance_hub_readonly` through an approved secret channel, and checks `rolsuper=false`, `rolcreatedb=false`, `rolcreaterole=false`. Reapply the bootstrap after migrations to reconcile grants. Do not put passwords in SQL, argv, logs or this package. The migration role owns schema objects; the app role does not run migrations. No `finance_hub_prod` creation is included.

## Preconditions and bounded sequence

1. Record Gate 0 PASS, prove `postgres-products`, its volume and the target network do not already exist, and confirm capacity, ownership, recovery access and a recoverable pre-change snapshot. If any exists, stop for reconciliation; do not overwrite it.
2. Approve INFRA-T01 as an ACTIVE task and the exact Compose digest, operator, change window, secret delivery, backup destination, retention, RPO/RTO and rollback. Stage this directory only at the target path. Create `secrets/postgres_password` outside Git with mode 0600 and restrictive directory permissions; never print it.
3. Run `docker compose -f compose.yml config --quiet`, pull the pinned image, inspect its digest/platform, then `docker compose -f compose.yml up -d --no-deps postgres-products` in the approved window. Check health, named volume mount, network membership and absence of published ports. Do not attach n8n, Evolution or NPM to the DB network.
4. Apply the existing role bootstrap and provision credentials through the approved channel. Run migrations as the migration role only after a Lab backup exists. Verify application access with its own role and deny schema creation, superuser and cross-database access.
5. Produce an encrypted off-host backup and perform the isolated restore below. Capture checksums, restore duration, schema/data validation and alerts before operational acceptance. Use synthetic Lab data only.

The operator's privilege must be limited to the approved stack and audited. `fih-audit` gets no Docker group, socket or unrestricted sudo. Shared services and firewall remain outside this contract.

## Backup and isolated restore

Use `/opt/apps/backups/databases/finance-hub/lab/`, outside the data volume, with `umask 077`. The authorized sudo operator runs these commands from the staged directory after the separate live change approval. Keep shell tracing disabled and do not paste command output containing credentials into evidence.

```bash
set -euo pipefail
set +x
umask 077
cd /opt/apps/apps/databases/postgres-products
sudo docker compose -f compose.yml config --quiet
sudo docker compose -f compose.yml pull postgres-products
sudo docker compose -f compose.yml up -d --no-deps postgres-products
sudo docker exec postgres-products pg_isready -U postgres -d finance_hub_lab
sudo docker exec -i postgres-products psql -X -v ON_ERROR_STOP=1 -U postgres -d finance_hub_lab < /opt/apps/apps/finance-intelligence-hub/packages/database/roles/bootstrap.sql
```

The repository checkout path in the last command must be verified on the host before execution. The SQL creates roles without credentials. Provision each role interactively through the approved secret channel using `sudo docker exec -it postgres-products psql -X -U postgres -d finance_hub_lab`, then run `\password finance_hub_migrations`, `\password finance_hub_app`, and, if used, `\password finance_hub_readonly`; exit with `\q`. Do not record the terminal session or use `ALTER ROLE ... PASSWORD '...'`. Verify `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname LIKE 'finance_hub_%';` and database/schema grants. The operator must arrange the migration role's protected connection file and an approved migration runner with access to `finance-products-db`; do not assume the DB container contains Node or the repository.

After the pre-migration Lab dump below is validated, run from the built repository in that runner (with Node/pnpm and dependencies installed), with `/run/finance-hub/migrations-database-url` mounted read-only by the approved secret mechanism:

```bash
set -euo pipefail
set +x
umask 077
cd /app
IFS= read -r DATABASE_URL < /run/finance-hub/migrations-database-url
export DATABASE_URL
pnpm --filter @finance-hub/database migrate:status
pnpm --filter @finance-hub/database migrate:up
pnpm --filter @finance-hub/database migrate:status
unset DATABASE_URL
```

The protected URL must identify `finance_hub_migrations@postgres-products` and `finance_hub_lab`; verify that identity without printing the URL. Reapply `bootstrap.sql` with the same `docker exec -i ... psql ... < ...` command after migration, then verify `finance_hub_app` cannot create schema objects and cannot access migration/audit write privileges. The exact migration runner and secret mount are deployment prerequisites to record before execution.

A guarded Lab dump command is:

```bash
set -euo pipefail
umask 077
out="/opt/apps/backups/databases/finance-hub/lab/finance_hub_lab_$(date +%Y-%m-%d_%H%M%S).dump"
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" /opt/apps/backups/databases/finance-hub/lab
test ! -e "$out"
sudo docker exec postgres-products pg_dump -U postgres -d finance_hub_lab -Fc --no-owner --no-acl > "$out"
test -s "$out"
sha256sum "$out"
```

Encrypt and transfer to the approved off-host destination; confirm integrity, retention and recovery key availability independently. A local dump alone is not an accepted backup. If the agreed RPO requires point-in-time recovery, add and validate WAL archival before acceptance.

Restore test uses a separately approved disposable PostgreSQL 18 container, dedicated volume and internal network, with no connection to operational Lab or Production. The following creates an isolated instance from the approved pinned image after verifying that the test names are unused. `/run/finance-hub/restore-postgres-password` is an operator-provisioned protected file; its contents are never shown. Creation and cleanup require their own approved window. Run from the dump-owning account.

```bash
set -euo pipefail
set +x
umask 077
test -s "$out"
sha256sum -c "${out}.sha256"
test -f /run/finance-hub/restore-postgres-password
test -z "$(sudo docker ps -aq --filter name='^/finance-hub-restore-test$')"
test -z "$(sudo docker volume ls -q --filter name='^finance_hub_restore_test_data$')"
test -z "$(sudo docker network ls -q --filter name='^finance-hub-restore-test-net$')"
sudo docker network create --internal finance-hub-restore-test-net
sudo docker volume create finance_hub_restore_test_data
sudo docker run -d --name finance-hub-restore-test --network finance-hub-restore-test-net --mount type=volume,src=finance_hub_restore_test_data,dst=/var/lib/postgresql --mount type=bind,src=/run/finance-hub/restore-postgres-password,dst=/run/secrets/postgres_password,readonly -e POSTGRES_DB=finance_hub_restore_test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password postgres:18.6-bookworm@sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8
until sudo docker exec finance-hub-restore-test pg_isready -U postgres -d finance_hub_restore_test >/dev/null; do sleep 2; done
sudo docker exec -i finance-hub-restore-test pg_restore --list < "$out" > /dev/null
start=$(date +%s)
sudo docker exec -i finance-hub-restore-test pg_restore -U postgres -d finance_hub_restore_test --exit-on-error --no-owner --no-acl < "$out"
elapsed=$(( $(date +%s) - start ))
printf 'restore_seconds=%s\n' "$elapsed"
sudo docker exec finance-hub-restore-test psql -X -v ON_ERROR_STOP=1 -U postgres -d finance_hub_restore_test -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';'
```

Create the checksum sidecar after the dump with `sha256sum "$out" > "${out}.sha256"`; verify the off-host copy using the same digest before restore. Record table row counts, constraints and synthetic financial query results against the source baseline, plus duration against approved RTO. Never target `finance_hub_lab` or `finance_hub_prod` for a restore test.

## Rollback

Before client writes, on failed initial creation and after ownership check, `docker compose -f compose.yml down` is permitted only in the approved window; it retains the volume. Never use `down -v`, `volume rm` or `prune`. If a name collision exists, stop without `down`. After any data or migration, stop new writes through the approved application procedure, preserve volume and evidence, take another backup, and recover in isolation. No in-place PostgreSQL major downgrade or Production restore is authorized by this contract.
