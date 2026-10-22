# M04 — Transaction Core: Active Milestone Overview

**Status:** ACTIVE
**Milestone state:** ACTIVE; M04-T01 DONE; M04-T02 REVIEW REQUIRED; M04-T03 through M04-T08 execution-ready
**Implementation:** M04-T01 DONE / integrated; M04-T02 implemented on `m04-t02-create-expense`, awaiting human review; M04-T03 through M04-T08 NOT AUTHORIZED
**Gate A:** NOT EXECUTED
**Gate 0:** NOT EXECUTED
**Activation review:** [M04-ACTIVATION-REVIEW.md](M04-ACTIVATION-REVIEW.md) — 2026-10-21; PASS; human accepted and integrated via PR #6 at `1c7e16d45fa03df8cd2b54c28100820af8d08142`; post-merge CI `39675385219` = SUCCESS; no material planning delta
**M04-T01 acceptance:** Human accepted on 2026-10-21. Accepted implementation head `d80672507b6fd36df9a7035af90e3cccdab44239`; GitHub Actions run `39691263503` attempt 2 = SUCCESS; unit 23 files / 664 tests PASS; PostgreSQL integration 15 files / 236 tests PASS. PR #7 was squash-merged to `main` as `9dabedefd9b58ef8090a1e0e8d88e63d9fdbd323`; post-merge GitHub Actions run `39693573292` = SUCCESS.

M04-T01 is human accepted and DONE. M04-T02 remains REVIEW REQUIRED and unmerged. M04-T03 through M04-T08 require explicit human authorization.

## Authority

Read `AGENTS.md`, `PROJECT_STATE.md`, this overview and the selected task before any future work. M01/M02/M03 are DONE and accepted; migrations 001–005 are unchanged and provide the full V0.1 physical schema including `transactions`, `audit_events` and `idempotency_keys`. No new migration is planned for M04 unless a true frozen-schema blocker is discovered during implementation.

Frozen routing: `FINAL-FREEZE-DECISIONS.md` §§21–76, 96–99, 133–148; `01-MVP-REQUIREMENTS.md` §§24–58, 95–99; `02-DOMAIN-MODEL.md` §§66–131, 244; `04-DATABASE.md` §§55–82, 83–91; `05-API-CONTRACTS.md` §§36–50, 74; `09-ROADMAP-TESTS.md` §§94–109. Accepted ADR-001/002 establish the stack/UUID baseline; neither changes.

## Objective

Implement the financial core independent of WhatsApp, Evolution, n8n, AI, Firefly and Metabase. After M04, the Finance API must support direct creation and querying of Expense, Income and Transfer transactions with atomic audit and idempotency, using only PostgreSQL as canonical Source of Truth.

## Scope boundary

M04 does NOT include:

- PATCH / Correction
- Void
- Refund creation or concurrency
- Inbox, parser, confirmation or WhatsApp behavior
- Summary, CSV or reporting
- Any M05/M06/M07/M08 functionality

Generic create supports only `expense`, `income` and `transfer`. Initial status is always `posted`. Ordinary Income created through generic create must have `refund_of_transaction_id = null`; Refund bypass is rejected.

## Eight slices and dependencies

| Task | Ownership | Dependencies |
| --- | --- | --- |
| [M04-T01](../completed/M04-T01.md) | Transaction primitives and Core ports — DONE | Accepted M02/M03 |
| [M04-T02](M04-T02.md) | Create Expense | T01 |
| [M04-T03](M04-T03.md) | Create Income | T01 |
| [M04-T04](M04-T04.md) | Create Transfer | T01 |
| [M04-T05](M04-T05.md) | Transaction Queries (Get/List/Last) | T01 |
| [M04-T06](M04-T06.md) | Direct API Idempotency Core/Database | T01 |
| [M04-T07](M04-T07.md) | Basic Audit and atomic financial create | T01, T02, T03, T04, T06 |
| [M04-T08](M04-T08.md) | API Integration and Milestone Verification | T01–T07 |

Current execution state: T01 DONE; T02 REVIEW REQUIRED. T03–T08 remain NOT AUTHORIZED; T07/T08 retain the dependency order below.

Formal graph: T01 → {T02, T03, T04, T05, T06}; {T02, T03, T04, T06} → T07; {T01, T02, T03, T04, T05, T06, T07} → T08.

T02/T03/T04 may proceed in parallel after T01 since they share repository infrastructure without coupling business use cases. T05 (queries) is read-only and may also proceed in parallel. T06 (idempotency) is independent of specific transaction types but required by T07. T07 composes Transaction + Audit + Idempotency atomically and depends on all write paths. T08 integrates everything at the API layer.

## Dependency direction

- `packages/core`: domain/application behavior, Money value object, transaction validation, financial errors, repository/read/transaction/idempotency/audit ports.
- `packages/database`: Kysely/PostgreSQL adapters satisfying Core contracts; transaction repository, idempotency repository, audit writer, financial lock integration.
- `apps/api`: TypeBox schemas, authentication/scopes, HTTP mapping, idempotency header enforcement, error mapping for transaction codes.

API → Core; API composition → Database; Database → Core contracts. Core must never import Database, Kysely, pg or Fastify. Transaction ports must not expose Kysely objects to Core.

## Locking protocol for financial writes

M04 financial writes MUST participate in the accepted M03 locking protocol (`packages/database/src/transaction/configuration-transaction.ts`). The total lock rank is:

1. Books
2. Accounts
3. Categories
4. Merchants
5. Classification Rules
6. Authorized Senders

Within each entity kind, lock UUIDs in ascending deterministic order. Financial writes must acquire Book and Account locks BEFORE financial validation/insertion so configuration mutations cannot race through financial usage checks. This is compatible with the existing `KyselyConfigurationLockPort` and `KyselyTransactionPort`.

For Transfer, both source and destination Accounts must be locked (along with their shared Book) in deterministic UUID order. For Expense/Income, the single Account and its Book must be locked. Category and Merchant locks are taken only when those references are supplied and non-null.

Preliminary reads may discover reference IDs. After locking, re-read authoritative state within the same transaction, validate invariants, then write. If reference discovery changes and the current lock set is incomplete, roll back and restart with the corrected ordered lock set. Never acquire an earlier-ranked lock after a later-ranked lock. Bound retries and surface the accepted concurrency error after exhaustion.

## Persistence baseline verification

M02 already provides the complete physical schema for `transactions`, `audit_events` and `idempotency_keys` via migrations 004 and 005. Verified columns, constraints, indexes and FKs match frozen `04-DATABASE.md` §§55–91. No missing physical schema was found during planning. Missing behavior in Core/Database adapters is expected and is the purpose of M04 tasks.

## Financial invariants enforced by M04

- Transaction types: exactly `expense | income | transfer`
- Initial status: always `posted`
- Money: positive ASCII decimal strings with zero to two fractional digits and up to 16 integral digits; max `9999999999999999.99`; no leading zeroes (except `0.xx`), sign, whitespace, exponent, NaN or Infinity. Canonical two-decimal string throughout Core/persistence/response; string/BigInt-safe validation; no PostgreSQL rounding
- Currency: `Book.currency = Account.currency = Transaction.currency`; no FX
- Book: exactly one active Book per Transaction; inactive Book rejected
- Expense/Income: active source Account required; Account belongs to Book; currency matches; Category optional (exists, active, same Book); global Merchant optional (exists, active), without a Merchant Book-context rule
- Transfer: source and destination active; source ≠ destination; same Book; same currency; no cross-Book
- Generic Income: `refund_of_transaction_id = null` always; client field including null is schema-invalid. Transfer category_id and merchant_id are also server-controlled null
- Financial date: `transaction_date DATE`; `transaction_date <= today in Book timezone`
- Last: `status = posted`; `ORDER BY created_at DESC, id DESC`; `book_id` required
- Idempotency: scope exactly `transactions:create`; Core hashes canonical validated command (SHA-256 lowercase hex), including canonical Money and semantic text; PostgreSQL `ON CONFLICT DO NOTHING RETURNING` claim and bounded wait/re-read; replay same resource/201 without duplicate Audit; pre-COMMIT failure rolls back everything
- Audit: `TRANSACTION_CREATED` in same PostgreSQL transaction as Transaction + Idempotency; direct_api actor_reference=null and no credential material

## Transaction ownership and race proof

T07 GenericCreateTransaction is the production orchestration entry point and owns the only outer `FinancialTransactionPort.runInTransaction(...)`. T02/T03/T04 type-specific executors receive its context and never commit independently. T08 calls GenericCreateTransaction only. Financial writers obey M03 lock rank and independently test both orders against Book/Account/Category/Merchant archives and Book/Account currency/type changes with real PostgreSQL barriers; see task-specific applicability. T02 corrects `transactions.account_id` DB type to non-null; T06/T07 add existing physical idempotency/audit table declarations to DB types. No migrations.

## API boundary

M04 exposes only:

- `POST /api/v1/transactions` (with `Idempotency-Key`)
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/last?book_id=<uuid>`
- `GET /api/v1/transactions/{id}`

All require `finance:admin`. No PATCH, Void, Refund, audit-query or refund-list routes are implemented in M04.

## Historical planning verification

Before committing this planning package:

- Only `PROJECT_STATE.md` and `docs/tasks/active/M04-*.md` changed
- Frozen docs unchanged
- Source/tests unchanged
- Migrations unchanged
- Manifests/lockfile unchanged
- Skill unchanged
- No provider-specific skill artifact
- No M05/M06/M07 implementation
- `git diff --check` clean
- Semantic sweep for contradictory task statuses

## Historical planning Git

Branch: `m04-planning`
One consolidated correction commit on this existing branch after review.
Draft PR targeting `main`. Do not merge.
