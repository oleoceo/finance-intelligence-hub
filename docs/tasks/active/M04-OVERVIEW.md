# M04 — Transaction Core: Milestone Planning Overview

**Status:** PLANNING
**Milestone state:** PLANNED
**Implementation:** NOT AUTHORIZED
**Gate A:** NOT EXECUTED
**Gate 0:** NOT EXECUTED

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
| [M04-T01](M04-T01.md) | Transaction primitives and Core ports | Accepted M02/M03 |
| [M04-T02](M04-T02.md) | Create Expense | T01 |
| [M04-T03](M04-T03.md) | Create Income | T01 |
| [M04-T04](M04-T04.md) | Create Transfer | T01 |
| [M04-T05](M04-T05.md) | Transaction Queries (Get/List/Last) | T01 |
| [M04-T06](M04-T06.md) | Direct API Idempotency Core/Database | T01 |
| [M04-T07](M04-T07.md) | Basic Audit and atomic financial create | T01, T02, T03, T04, T06 |
| [M04-T08](M04-T08.md) | API Integration and Milestone Verification | T01–T07 |

Preferred execution: human authorization → T01 → {T02, T03, T04, T05, T06} → T07 → T08.

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
- Money: `NUMERIC(18,2)` canonical; API decimal strings; `amount > 0`
- Currency: `Book.currency = Account.currency = Transaction.currency`; no FX
- Book: exactly one active Book per Transaction; inactive Book rejected
- Expense/Income: active source Account required; Account belongs to Book; currency matches; Category/Merchant optional but must satisfy active/context rules if supplied
- Transfer: source and destination active; source ≠ destination; same Book; same currency; no cross-Book
- Generic Income: `refund_of_transaction_id = null` always
- Financial date: `transaction_date DATE`; `transaction_date <= today in Book timezone`
- Last: `status = posted`; `ORDER BY created_at DESC, id DESC`; `book_id` required
- Idempotency: PostgreSQL canonical; `in_progress | completed`; same key + same fingerprint → same result; same key + different fingerprint → 409; pre-COMMIT failure rolls back everything
- Audit: `TRANSACTION_CREATED` in same PostgreSQL transaction as Transaction + Idempotency

## API boundary

M04 exposes only:

- `POST /api/v1/transactions` (with `Idempotency-Key`)
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/last?book_id=<uuid>`
- `GET /api/v1/transactions/{id}`

All require `finance:admin`. No PATCH, Void, Refund, audit-query or refund-list routes are implemented in M04.

## Planning verification

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

## Git

Branch: `m04-planning`
Single planning commit after final review.
Draft PR targeting `main`. Do not merge.