# M02 correction report - accepted evidence

Date: 2026-10-19. Scope: local native Ubuntu WSL2 and disposable PostgreSQL Testcontainers only.

Closure disposition (2026-10-20): human review accepted M02 and its native-WSL/PostgreSQL evidence. M02 and T01-T05 are DONE; task records and overview moved to ../completed/. M03 is the NEXT ALLOWED MILESTONE, implementation NOT STARTED. Gate 0 remains NOT EXECUTED and is not authorized by closure. No implementation changes, commit or push occurred during closure.

## 1. Defects corrected

| Defect | Correction and evidence |
| --- | --- |
| 0 ? false completion | PROJECT_STATE, overview and all five tasks now require review. Prior compilation evidence and independent failing results are preserved without treating them as acceptance. |
| 1 ? root Kysely resolution | Root schema/role tests use pg Pool and parameterized SQL; migration tests call exported @finance-hub/database APIs. No root Kysely dependency or new workspace was added. |
| 2 ? migration names | Assertions use exact canonical sequence-prefixed names, including history and pending status. Migration files were not renamed. |
| 3 ? failure provider isolation | Custom failing provider runs in a separate disposable database inside the same Testcontainer. The test asserts an attempted up(), the exact Error object/message, and the Error migration result. No broken canonical migration exists. |
| 4 ? missing acceptance suites | Added ingestion-schema, transaction-schema and system-schema suites, plus independent physical-schema expectations and pg fixture helpers. Expanded T01 coverage as well. |
| 5 ? mutable Audit grants | App can SELECT/INSERT Audit; UPDATE/DELETE/TRUNCATE fail with SQLSTATE 42501. Migration 005 removes those grants in its migration transaction, including reapply. Bootstrap reconciliation is explicitly transactional. |
| 6 ? role authentication lifecycle | Bootstrap contains no passwords. Disposable setup generates and assigns test-only passwords after role creation, then uses authenticated connections for each role. All three are LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE. |
| 7 ? default privilege owner | ALTER DEFAULT PRIVILEGES FOR ROLE finance_hub_migrations IN SCHEMA public grants app CRUD and readonly SELECT. A later migration-owned probe table verifies actual access without rerunning bootstrap. |
| 8 ? migration-role acceptance | Roles are created before migration application. The migrations role owns all 13 business tables and Kysely metadata, applies 001?005, reverses 005?001, verifies empty-down, then reapplies 001?005. |

Additional contract discrepancy corrected: Inbox received_at, Transaction date/Last, and Audit history indexes now use the documented DESC ordering. Existing Category code already had `categories_no_self_parent`; documentation now states that accurately.

## 2. Files changed

Database implementation retained and corrected: `packages/database/migrations/002_master_data.ts`, `003_ingestion_structure.ts`, `004_transaction_structure.ts`, `005_audit_idempotency_outbox.ts`; `packages/database/roles/bootstrap.sql`.

Tests: `tests/integration/migration.test.ts`, `master-data-schema.test.ts`, `roles-verification.test.ts`, new `ingestion-schema.test.ts`, `transaction-schema.test.ts`, `system-schema.test.ts`, `schema-helpers.ts`, `schema-contract.ts`.

Documentation: `PROJECT_STATE.md`, `docs/tasks/active/M02-OVERVIEW.md`, `M02-T01.md` through `M02-T05.md`, and this report.

Formatting-only normalization needed by the mandatory format check: `package.json`, `pnpm-lock.yaml`, `packages/database/src/migrator.ts`, `vitest.integration.config.ts`. Git's normalized content diff for those four is empty; no dependency versions, lock resolution, runner settings or migration API behavior changed. No general formatting sweep was performed.

## 3. Exact migration chain and impact

```text
001_technical_validation
002_master_data
003_ingestion_structure
004_transaction_structure
005_audit_idempotency_outbox
```

`001_technical_validation.ts` is unchanged: working-tree and HEAD normalized Git object hashes both equal `da759abd46a1d8acf2958274e87d4c1676a92920`.

Only uncommitted M02 migrations were corrected. No new migration number, business table, endpoint, producer or worker was added. Reverse migrations intentionally remove slice-owned tables only in disposable test databases. No live schema or financial history was touched.

Evidence includes empty database apply; exact history; rerun with no pending migrations; incremental 001?002?003?004?005 upgrades with earlier synthetic Books/Accounts/Inbox/Transactions retained; reverse rollback preserving predecessor rows; full reapply; isolated intentional failure propagation. The compiled pnpm `migrate:status`, `migrate:down`, `migrate:up` and repeated `migrate:up` use the same names as source/Vitest.

## 4. Integration discovery and results

| Exact discovered file under tests/integration/ | Tests |
| --- | ---: |
| postgres.test.ts | 2 |
| readiness-postgres.test.ts | 2 |
| migration.test.ts | 11 |
| master-data-schema.test.ts | 23 |
| ingestion-schema.test.ts | 10 |
| transaction-schema.test.ts | 9 |
| system-schema.test.ts | 10 |
| roles-verification.test.ts | 7 |
| Total | 74 |

The complete validation run passed all 8 files and all 74 tests, with no skipped, failed or zero-test intended suite. The final rerun after explicit bootstrap BEGIN/COMMIT also passed all 8 files / 74 tests (Vitest start 22:31:46, duration 50.89s).

Preserved execution history: independent verification had 2/5 files passing, 9 tests passing, 3 failing, and 2 suites failing before tests. During correction, one run had 58 pass/1 fail (oversized source fixture), and another 72 pass/1 fail (invalid UUID fixture after an overly broad substitution). Both fixture errors were corrected without weakening SQLSTATE assertions. The subsequent complete validation passed 74/74.

## 5. Constraint and negative-case evidence

- T01: all six physical schemas/UUID PKs; currency and archive consistency on INSERT/UPDATE; account types and same-Book/currency FKs; scoped name uniqueness; root/child category uniqueness, self-parent and cross-Book/missing parent rejection; restrictive deletes; nullable classification targets and all four target FKs; sender identity/default consistency. Inactive referenced rows retain history.
- T02: source triple duplicate rejected while each source component distinguishes identity; sender NOT NULL/FK; six statuses; nonnegative attempt_count; attempt uniqueness/range and nullable confidence [0,1]; four Confirmation statuses; every pending/resolved consistency branch; target_version; one pending per channel/sender, including conflicting UPDATE; sender/origin/resolution FKs and deletion protection; retry/JSON/TTL/supersede storage across a new connection.
- T03: only expense/income/transfer and posted/voided; positive amount/version; source/destination/category/refund composite FKs reject missing/cross-Book/cross-currency contexts; Transfer destination required and distinct; Expense/Income destination prohibited; linked Refund must be Income; posted/voided metadata NULL combinations rejected on INSERT/UPDATE; duplicate human_ref/non-null Inbox rejected; multiple null Inbox rows accepted; all specified indexes and Last ordering verified.
- T04: exact Audit/Idempotency/Outbox columns, types, lengths, nullability/defaults and UUID PKs; Audit indexes/JSONB/polymorphic IDs; scoped idempotency identity, two statuses and completion timestamp consistency; four Outbox states, lock/publication metadata and JSONB; all thirteen business tables empty after migrations.
- Database failures assert SQLSTATE 23505 (unique), 23503 (FK), 23514 (CHECK), 23502 (NOT NULL), 22003 (numeric overflow), 42501 (privilege denial), and 22012 (forced division-by-zero rollback), as applicable. Selected constraints are asserted by name.
- Concurrent pending-confirmation and idempotency tests use two different backend PIDs, observe `pg_blocking_pids` before COMMIT, then prove exactly one row persists and the loser receives 23505.

## 6. Precision and canonical Last

`amount` metadata is NUMERIC precision 18 / scale 2; pg returns strings unchanged for `0.10`, `0.20` and `9999999999999999.99`. PostgreSQL decimal `0.10 + 0.20` returns string `0.30`. `10000000000000000.00` overflows with 22003. No canonical money conversion to JavaScript Number was introduced.

`transaction_date` is DATE; technical timestamps are TIMESTAMPTZ. No occurred_at column. Last orders posted rows by created_at DESC, id DESC, ignores a newer voided row and selects the newest-created backdated posted transaction.

## 7. Role/grant and security results

Real authenticated role connections prove the privilege boundaries, beyond catalog checks. App CRUD works on ordinary business data; Audit append/read works, existing Audit UPDATE/DELETE/TRUNCATE fails, and the original event remains unchanged. App/readonly cannot CREATE/ALTER/DROP business tables or TRUNCATE them. Readonly SELECT works on each of all thirteen business tables; INSERT/UPDATE/DELETE/TRUNCATE fails on each. Kysely metadata is denied to app/readonly after grant reconciliation.

A synthetic table created by finance_hub_migrations inherits app CRUD and readonly SELECT. Readonly mutations and app TRUNCATE/DROP fail without rerunning bootstrap. The migration owner can create/drop that probe and apply/revert the actual chain. No superuser runtime, credentials in bootstrap, RLS policy, business trigger or real-data fixture was introduced.

Production guard remains effective: isolated subprocesses exercise both forbidden DATABASE_URL and PGDATABASE values and abort before any connection. No real production hostname or credentials are used.

## 8. Synthetic atomicity

Four cases cover commit/forced rollback, each with and without optional Outbox. Successful COMMIT persists Transaction + Audit + completed Idempotency (and optional Outbox); a deliberate PostgreSQL error followed by ROLLBACK leaves zero rows for every attempted fixture. Cases without Outbox leave zero corresponding events. This proves PostgreSQL transaction behavior only; it is not M04/M07 financial orchestration.

## 9. Commands and environment

Native Ubuntu WSL2; Node 24.22.0; pnpm 12.3.4; Docker Engine 29.8.0; Testcontainers 12.2.0; postgres:18.6-bookworm. Execution used the native Linux Node/pnpm PATH, not Windows Docker availability.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | PASS, exit 0 |
| pnpm lint | PASS, exit 0 |
| pnpm format:check | PASS, exit 0 |
| pnpm build | PASS, exit 0 |
| pnpm typecheck | PASS, exit 0 |
| pnpm test | PASS, 4 files / 35 tests |
| pnpm test:integration:postgres | PASS, 8 files / 74 tests |
| pnpm exec eslint on all added/changed integration test/helper files | PASS, exit 0, no warnings |
| git diff --check | PASS, exit 0 |
| git diff --name-only -- docs/frozen | Empty, exit 0 |

The root pnpm lint/typecheck scripts retain their established workspace scope; the extra ESLint command explicitly covers these root integration files. Logs are available in the local WSL directory `/tmp/finance-m02-correction/` (ephemeral evidence, not committed).

## 10. Remaining issues and boundaries

Human review accepted the implementation on 2026-10-20; documentation/state closure is complete. No acceptance failure remains in the completed validation run. Initial dependency installation logged an optional cpu-features native-build failure because a compiler was unavailable, but install returned 0; the final frozen install returned 0 without that failure and all tests passed. Existing Fastify FSTDEP023 deprecation notices occurred in unit tests; no unrelated upgrade was made.

M03 configuration behavior, M04/M07 refund totals/concurrency/future-date logic and orchestration, M05 sender authorization workflow/TTL execution, Outbox producers, M09 recovery, live role installation and shared infrastructure remain outside this correction. Global-role removal is not executed; disposable container cleanup removes test roles. No remote CI publication was authorized.

## 11. Historical correction-run git verification (before closure)

At the correction-run checkpoint, all M02 work was uncommitted and task files were active. Task records and overview were subsequently moved to completed on 2026-10-20; the snapshot below is historical. Final `git diff --check` passed; `git diff --name-only -- docs/frozen` returned empty. Expanded `git status --short --untracked-files=all`:

```text
 M PROJECT_STATE.md
 M package.json
 M packages/database/src/migrator.ts
 M pnpm-lock.yaml
 M tests/integration/migration.test.ts
 M vitest.integration.config.ts
?? docs/tasks/active/M02-CORRECTION-REPORT.md
?? docs/tasks/active/M02-OVERVIEW.md
?? docs/tasks/active/M02-T01.md
?? docs/tasks/active/M02-T02.md
?? docs/tasks/active/M02-T03.md
?? docs/tasks/active/M02-T04.md
?? docs/tasks/active/M02-T05.md
?? packages/database/migrations/002_master_data.ts
?? packages/database/migrations/003_ingestion_structure.ts
?? packages/database/migrations/004_transaction_structure.ts
?? packages/database/migrations/005_audit_idempotency_outbox.ts
?? packages/database/roles/bootstrap.sql
?? tests/integration/ingestion-schema.test.ts
?? tests/integration/master-data-schema.test.ts
?? tests/integration/roles-verification.test.ts
?? tests/integration/schema-contract.ts
?? tests/integration/schema-helpers.ts
?? tests/integration/system-schema.test.ts
?? tests/integration/transaction-schema.test.ts
```
