# M04 — Transaction Core: Activation Review

**Date:** 2026-10-21

**Authoritative main:** `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`

**Result:** `M04 ACTIVATION REVIEW: PASS`

**Implementation:** NOT AUTHORIZED; each task requires explicit human authorization

## Prerequisites and authority

| Prerequisite | Evidence | Result |
| --- | --- | --- |
| M01, M02, M03 accepted | `PROJECT_STATE.md`, completed M02/M03 overviews; M03 merge `f94f965d448160bdf54d8a86b14d2eb6411d70ad`, post-merge CI `39645547149` SUCCESS | Met |
| M04 planning accepted | Main merge `d369261aceb8c91a2ee3449c64be7d7b24af11ab`, post-merge CI `39661571275` SUCCESS | Met |
| V0.1 Forward Planning accepted | Main merge `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`, post-merge CI `39672168104` SUCCESS | Met |
| Intervening application changes | `git diff --name-only d369261aceb8c91a2ee3449c64be7d7b24af11ab 6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`: planning/process documents only | None |

M04 is the transition milestone: its accepted execution contracts already reside in `docs/tasks/active/`; they were not moved. This review compares those contracts with exact current main, the M04-routed frozen documents, accepted M02/M03 records, and current source/tests. Gate 0 and Gate A have not executed and are not prerequisites for local M04 implementation. No live environment was inspected.

## Current implementation evidence and available surfaces

| Area | Exact current surface | M04 implication |
| --- | --- | --- |
| Core master data | `packages/core/src/application/ports/master-data-ports.ts`: `BookRepository`, `AccountRepository`, `CategoryRepository`, `MerchantRepository`, `FinancialUsageReader`, `ConfigurationLockPort.acquireLocks(LockSpec)`, `TransactionPort<Context>.runInTransaction(fn)`, `MasterDataTransactionContextT04` | Financial ports/context can extend the Core contract; existing master-data behavior remains intact. |
| Core rules/senders | `packages/core/src/application/ports/rule-sender-ports.ts`: `ClassificationRuleRepository`, `AuthorizedSenderRepository`; `packages/core/src/index.ts` exports accepted M03 ports and use cases | No conflicting Money, Transaction, financial transaction, idempotency or audit port/export exists. Core has no Kysely, pg, Fastify or Database dependency. |
| Database transaction | `packages/database/src/transaction/configuration-transaction.ts`: `KyselyConfigurationLockPort` orders Books → Accounts → Categories → Merchants → Rules → Senders and UUIDs ascending; `KyselyTransactionPort` creates one Kysely transaction and retries whole transactions for lock-set change/deadlock | M04 financial writes can participate in the accepted lock order and extend/compose this transaction pattern; T01/T07 must not create nested independent commits. |
| Database repositories | Existing Book/Account/Category/Merchant and Rule/Sender adapters under `packages/database/src/repositories/`; `packages/database/src/readers/financial-usage-reader.ts` reads historical transaction usage | Reuse current master-data readers/locks after post-lock re-read. Transaction/idempotency/audit adapters are not yet present. |
| Physical schema | `packages/database/migrations/004_transaction_structure.ts` creates `transactions` with `NUMERIC(18,2)`, `human_ref` UNIQUE, FKs, checks and Last index; `005_audit_idempotency_outbox.ts` creates `audit_events` and `idempotency_keys`, including unique `(scope, idempotency_key)` | No M04 migration required. `packages/database/src/db-types.ts` already declares `transactions`, but `account_id` is typed nullable despite migration 004 `NOT NULL`; audit/idempotency table types are absent. The accepted T02/T06/T07 type-alignment work remains. |
| API | `apps/api/src/middleware/auth.ts` provides reusable `adminAuthentication` with 401/403 scope separation; `middleware/errors.ts` provides safe envelopes/mapping. `apps/api/src/index.ts` registers M03 admin routes under the authentication hook; `schemas/configuration.ts` and admin route modules use strict TypeBox schemas | T08 can follow established auth, error, schema and composition conventions. No M04 transaction route or conflicting financial API exists. |
| Tests | Core Vitest unit tests under `packages/core/src`; database unit tests under `packages/database/src`; canonical PostgreSQL/Testcontainers suites under `tests/integration/`, including `transaction-schema.test.ts`, repository concurrency tests and `api/admin/configuration.test.ts`; `vitest.integration.config.ts` | Extend the existing unit and real PostgreSQL integration organization. No second test framework is needed. |

The accepted dependency direction remains API → Core; API composition → Database; Database → Core contracts. Database owns Kysely/PostgreSQL mechanics; Core ports do not expose infrastructure transactions.

## Assumption delta

| Accepted M04 assumption | Current evidence | Delta/action |
| --- | --- | --- |
| Money uses positive ASCII decimal strings, 0–2 fractional digits, canonical two decimals, max `9999999999999999.99`, no float; financial dates are real calendar dates | Frozen requirements/database/API and T01 agree; no conflicting financial value object exists | Still valid; T01 implements string/BigInt-safe validation and strict dates. |
| `human_ref` is application-generated through an injectable generator, uppercase ASCII alphanumeric, at most 16 characters; DB UNIQUE and bounded PostgreSQL-safe collision retry | Migration 004 has `varchar(16)` and `uq_transactions_human_ref`; no existing generator conflicts | Still valid; T02 uses `ON CONFLICT (human_ref) DO NOTHING RETURNING`, at most three candidates. |
| One outer `FinancialTransactionPort.runInTransaction`; T02/T03/T04 executors receive its context; T07 composes atomically; T08 calls GenericCreateTransaction only | M03 `TransactionPort.runInTransaction` and Database adapter supply the compatible transaction pattern; no financial orchestrator exists yet | Still valid; no nested independent commit. |
| Financial writers preserve M03 Books → Accounts → Categories → Merchants locking, UUID order, post-lock re-read and bounded whole-transaction retry | `KyselyConfigurationLockPort` and accepted M03 completion record establish the pattern; no accepted M03 writer contradicts extension | Still valid; T02–T04/T07 must prove both race orders with PostgreSQL barriers. |
| Create idempotency uses scope `transactions:create`, SHA-256 of canonical validated command, PostgreSQL persistence, conflict-safe claim, same-command replay, differing-command conflict, pre-COMMIT rollback and bounded `in_progress` handling | Migration 005 has persistent status/hash/result fields and unique scope/key; no application idempotency implementation exists | Still valid; T06/T07 retain one outer transaction and `ON CONFLICT DO NOTHING RETURNING`. |
| `TRANSACTION_CREATED` Audit shares the outer PostgreSQL transaction, source `direct_api`, actor_reference null, no credential material | Migration 005 contains Audit columns and runtime append-only grant posture; no Audit writer conflicts | Still valid; T07 owns write and atomicity. |
| T08 exposes POST/GET `/api/v1/transactions`, GET `/api/v1/transactions/last`, GET `/api/v1/transactions/{id}`; M07 PATCH/Void/Refund routes excluded | Frozen API and T08 agree; current API registers no transaction routes | Still valid; `finance:admin`, strict TypeBox and auth/error precedence remain required. |
| M04 provides create/query, idempotency, Audit and version-compatible surfaces for M05/M07 without implementing later behavior | Integrated V0.1 forward plan M04→M05 and M06→M07 handoffs match accepted T01–T08 scope | Still valid; `M04 FORWARD-HANDOFF COMPATIBLE`. No speculative M05/M07 abstractions. |

**No material planning delta required.** The missing financial implementation is the planned work, not a stale assumption or blocker.

## Execution-ready decomposition and evidence

The accepted graph remains `T01 → {T02, T03, T04, T05, T06} → T07 → T08`; T07 depends on T02/T03/T04/T06, and T08 depends on all prior tasks. Each linked contract retains its exact allowed paths, frozen routing, acceptance criteria, required tests and forbidden scope.

| Task | Scope and required proof |
| --- | --- |
| [T01](M04-T01.md) | Money/transaction primitives and Core ports; unit boundaries/date validation and PostgreSQL schema/type compatibility. |
| [T02](M04-T02.md) | Expense executor/repository; active compatible references, human_ref collision and independent-backend archive/currency races. |
| [T03](M04-T03.md) | Income executor; ordinary-income refund null, Book/Account/currency/date and PostgreSQL contention proof. |
| [T04](M04-T04.md) | Transfer executor; two Accounts, same Book/currency, deterministic locks and races. |
| [T05](M04-T05.md) | Get/List/Last queries; filters/pagination and posted Last ordering against PostgreSQL. |
| [T06](M04-T06.md) | Canonical fingerprint and PostgreSQL idempotency lifecycle, conflict, replay, rollback and concurrency. |
| [T07](M04-T07.md) | One atomic generic-create orchestration with Transaction + Audit + Idempotency; rollback and duplicate races. |
| [T08](M04-T08.md) | Four strict `finance:admin` API routes; exact auth/error behavior and full API/PostgreSQL acceptance. |

## Guardrails, impacts and gates

- **Financial/concurrency:** PostgreSQL is canonical; no float money, no FX or cross-Book Transfer. Lock Books, Accounts, then supplied Categories/Merchants in deterministic order, re-read after lock, and restart the whole transaction on incomplete lock discovery. One outer transaction owns create, idempotency and Audit. No unbounded wait, process mutex, Redis authority or nested independent commit.
- **Security:** `finance:admin` is required for M04 routes; `finance:ingest` cannot use them. Authentication precedes validation. Keep credentials out of Audit, fingerprint, logs and responses. M04 direct API Audit uses `actor_reference=null`.
- **Migrations/dependencies:** No new migration or external dependency is identified. Existing schema 004/005 needs only planned TypeScript DB declaration alignment. No manifest or lockfile change is expected from this review.
- **Forbidden scope:** No M05–M09 behavior, WhatsApp/n8n/AI, PATCH, Void, Refund, Summary, CSV, new transaction type, infrastructure deployment, frozen-document change or Gate execution.
- **Gates:** Gate 0 NOT EXECUTED and unnecessary for local M04; Gate A NOT EXECUTED and follows accepted M04 implementation. Gates B/C are later and NOT EXECUTED.

## Promotion and human boundary

M04 overview and T01–T08 are marked ACTIVE / execution-ready in this review package because the accepted contracts already live under `active/`. This is a documentation promotion only. The next candidate task is M04-T01, but **implementation remains NOT AUTHORIZED** pending explicit human authorization for that task. The activation package itself remains REVIEW REQUIRED for human review; no task is IN PROGRESS or DONE.

`M04 ACTIVATION REVIEW: PASS`

`No material planning delta required.`

`M04 FORWARD-HANDOFF COMPATIBLE`
