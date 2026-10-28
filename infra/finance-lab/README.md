# Finance API Lab deployment

Stage this repository checkout at `/opt/apps/apps/lab/finance-hub` after independent review, Gate 0 closure, backup/restore evidence and explicit deployment authorization. Run commands from that directory. The Compose file is `infra/finance-lab/compose.yml`; it joins the existing `finance-products-db` network and never creates or changes it.

## Protected inputs

Create `secrets/` outside Git-tracked content with mode `0700` and four individual files with mode `0600`, owned by the deployment operator: `app_password`, `migrations_password`, `admin_token`, `ingest_token`. Use distinct Lab values. The first two must match the already provisioned `finance_hub_app` and `finance_hub_migrations` roles. Do not put credentials into a Compose environment file, command line, Git, logs or screenshots. Restrict access to the checkout because local Docker Compose secrets are file mounts. Never use the migration role for the API.

## Preflight and deployment (future authorized Lab operation)

1. Record the exact Git SHA and image ID. Verify `postgres-products` is healthy, `finance-products-db` exists with `internal=true`, and no PostgreSQL public port exists. Confirm current backup plus externally stored backup and isolated restore evidence before applying migrations. Confirm the migration and app role grants without printing passwords.
2. `docker compose -f infra/finance-lab/compose.yml config --quiet` and `docker compose -f infra/finance-lab/compose.yml build api`.
3. `docker compose -f infra/finance-lab/compose.yml --profile maintenance run --rm migrate migrate:status` to list pending migrations. Review the exact list against the five accepted migrations.
4. `docker compose -f infra/finance-lab/compose.yml --profile maintenance run --rm migrate migrate:up`. This invokes the compiled official database CLI. Do not use `migrate:down` as an automatic rollback.
5. Repeat `migrate:status`; require zero pending migrations. Then `docker compose -f infra/finance-lab/compose.yml up -d --no-deps api`.
6. Check `docker compose -f infra/finance-lab/compose.yml ps` and run `docker compose -f infra/finance-lab/compose.yml exec api node -e "Promise.all(['/health','/ready'].map(p => fetch('http://127.0.0.1:3000'+p).then(r => { if (!r.ok) throw Error(p+' '+r.status); console.log(p+' '+r.status) }))).catch(() => process.exit(1))"`. Inspect API logs with credentials redacted. `/health` checks process liveness; `/ready` checks PostgreSQL. Confirm API uses only the app role and has no published ports.

Compose intentionally has no n8n-facing network or port. ADR-003 still requires actual topology evidence and a separately reviewed n8n-to-API route. Do not attach n8n, Evolution or NPM to `finance-products-db`. Finance API admin token must not be supplied to the normal n8n workflow; the ingest token has `finance:ingest` scope.

## Lab rollback

For an API deployment failure, stop only this Compose project's API and redeploy the previously recorded image and Git SHA after verifying compatibility. Leave `postgres-products`, its network and volume untouched. For a migration failure, stop the API, preserve database state and logs, inspect migration status, and decide recovery against the verified pre-migration backup. Database restore or `migrate:down` requires separate explicit approval and an isolated rehearsal. No Production steps are included.

No migration, external backup or isolated restore was executed as part of this PR.
