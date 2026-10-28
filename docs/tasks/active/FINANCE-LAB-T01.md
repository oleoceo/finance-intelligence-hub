# FINANCE-LAB-T01 — API packaging and Lab migration executor

**Status:** REVIEW REQUIRED
**Operational correction:** PR #35 was merged as `29c2e42`; the secret-owner UID fix is pending independent review. Scope is limited to Compose runtime identity, a disposable Compose bind-mount test and the associated procedure/CI steps. No VPS or migration execution.
**Activation review:** 2026-10-28, against `origin/main` `df85f58e02b97d2faec12950a9c40dfd59d5668f`.
**Authorization:** Owner requested local implementation and Draft PR; no VPS mutation or merge.

## Boundary

Package existing Node 24/pnpm API, invoke the official `@finance-hub/database` compiled migration CLI, and document a reproducible Lab deployment at `/opt/apps/apps/lab/finance-hub`.

Allowed: `apps/api/Dockerfile`, `infra/finance-lab/`, task/state documents, and focused CI validation. Relevant frozen contracts: `FINAL-FREEZE-DECISIONS.md`, `03-ARCHITECTURE.md`, `04-DATABASE.md`, `07-SECURITY.md`, `08-BACKUP-RESTORE.md`, `09-ROADMAP-TESTS.md`; ADR-003 remains OPEN.

Prerequisites: INFRA-T01 merged in PR #34; owner reports healthy `postgres-products`, private `finance-products-db`, Lab DB and distinct roles. Gate 0 remains pending, so this task authorizes artifacts and local checks only.

Acceptance: reproducible Docker build; migration and API use separate roles; protected secret files; no database/public/admin API ports; health/readiness checks; Lab-only deployment and rollback procedure; lint, format, build, typecheck, unit, integration and Compose checks; Draft PR with CI. No schema or financial-rule change.

Excluded: VPS changes, live migrations, production WhatsApp, n8n network attachment, ADR-003 closure, Gate 0 PASS, M06 completion and merge.
