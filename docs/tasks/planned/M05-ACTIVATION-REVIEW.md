# M05 Activation Review — proposed for human acceptance

**Status:** REVIEW REQUIRED; documentation proposal only. M05 remains PLANNED on `main` and M05-P01–P06 implementation is NOT AUTHORIZED.
**Forward plan:** [M05-OVERVIEW.md](M05-OVERVIEW.md)

**Authoritative main:** `d4cfb5a4b93506e4c42e11179a6999dfbd59d6d1`

**Date:** 2026-10-27
**Reviewer:** pending human review

## 1. Upstream completion

| Prerequisite | Evidence | Result |
| --- | --- | --- |
| M04-T01–T08 | PR #15 merged as `fed42a75a4f41eadec9e1e8ede0f41a5354b18ef`; 33 unit files / 934 tests, 22 PostgreSQL files / 379 tests, 10 API E2E tests | DONE |
| Gate A | [closure](../completed/GATE-A.md), PASS on M04 main; PR #16 merged; main CI `40514723831` SUCCESS at review baseline | PASS |
| Gate 0, B, C | No M05 local dependency | NOT EXECUTED |

## 2. Forward assumptions and implementation evidence

| # | Forward-plan assumption | Delta | Action |
| --- | --- | --- | --- |
| 1 | M04 create interfaces to be determined | Replaced | Consume `GenericCreateTransaction.execute(input, idempotencyKey, {correlationId})` and the exact `CreateTransactionInput` union; P05 owns the narrow extension for Inbox atomicity and source attribution. M04 source/Audit enums currently contain only `direct_api`; trusted Inbox provenance needs an explicit M05 addition. |
| 2 | Inbox/Confirmation physical schema exists | Valid | Migration `003_ingestion_structure.ts` has all three tables, checks, FKs and unique indexes. `db-types.ts` lacks these declarations; P01/P04 add declarations only. No migration. |
| 3 | Sender/rule access available | Replaced | Existing `AuthorizedSenderRepository.findByChannelAndReference` and `ClassificationRuleRepository.find` exist in Core/Database. Transaction contexts do not expose both; P01/P03 own needed read adapters, P05 composes transaction-scoped access. |
| 4 | Existing M04 idempotency can be reused | Valid with integration delta | Scope is `transactions:create`. Deterministic Inbox identity yields a stable, namespaced key. P05 must commit Inbox outcome with create/idempotency/audit in one PostgreSQL transaction, without nested commits. |
| 5 | Admin auth can be reused for ingest | Stale | `adminAuthentication` deliberately rejects ingest token with 403. P05 adds a separate ingest guard and route registration; admin routes retain their existing guard. |
| 6 | One pending confirmation per sender | Valid | Migration has partial unique index `uq_confirmation_pending_channel_sender`; P04 supplies row locking, expiry and supersede policy. |
| 7 | Parser can be deterministic without AI | Valid | No AI runtime dependency exists; P02/P03 operate entirely in Core. |
| 8 | Gate A clears M05 review | Valid | Gate A closure explicitly clears Activation Review, not implementation. |

No frozen-schema or architectural blocker was found. The M04 transaction ownership mismatch is an ordinary bounded P05 integration change, not a reason to redesign the financial engine.

## 3. Exact accepted surfaces

- `packages/core/src/application/finance/create-transaction.ts`: `GenericCreateTransaction.execute(CreateTransactionInput, unknown, FinancialRequestContext): Promise<TransactionRecord>` owns `FinancialTransactionPort.runInTransaction`; dispatches `createExpense`, `createOrdinaryIncome`, `createTransfer`. It currently writes `TRANSACTION_CREATED` with `source: 'direct_api'`, `actorReference: null`; `transaction-types.ts` and `audit-ports.ts` allow only `direct_api`, and all three type executors hard-code it. P05 must preserve direct API behavior while adding trusted Inbox provenance through the same engine, consistent with frozen server-controlled source semantics.
- `packages/core/src/application/ports/transaction-ports.ts`: expense/income require `bookId`, decimal-string `amount`, `accountId`, `description`, `transactionDate`; transfer additionally requires `destinationAccountId` and excludes category/merchant. `TransactionRecord` already has `source`, `sourceReference`, `inboxMessageId`; the current type executors and repository must be checked and narrowly extended by P05 to persist Inbox provenance. No refund create via generic input.
- `packages/core/src/application/ports/financial-transaction-port.ts`: `FinancialTransactionContext` supplies Books, Accounts, Categories, Merchants, ordered locks, financial usage, Transaction repository, idempotency keys and Audit; `runInTransaction<T>(fn)` commits or rolls back the callback. `packages/database/src/transaction/financial-transaction.ts` implements it with bounded whole-transaction retries. P05 owns one shared outer transaction for Inbox finalization plus financial effect.
- `packages/core/src/application/ports/transaction-ports.ts`: `TransactionReadPort.findById`, `list`, `getLast`; `getLast` remains posted, `created_at DESC, id DESC`. P05 may use reads for structured results; it must not create a second query engine.
- `packages/core/src/application/ports/idempotency-ports.ts` and `audit-ports.ts`: PostgreSQL idempotency and Audit are transaction-scoped; create scope is `transactions:create`. `packages/database/src/repositories/idempotency-key-repository.ts` and `audit-writer.ts` are accepted adapters.
- `packages/core/src/application/ports/master-data-ports.ts` and `rule-sender-ports.ts`: Book, Account, Category, Merchant, ClassificationRule and AuthorizedSender ports; `ConfigurationLockPort.acquireLocks` follows Book → Account → Category → Merchant → Rule → Sender, UUID ascending within rank. Existing rule/sender adapters are in `packages/database/src/repositories/`.
- `apps/api/src/index.ts`: admin route plugin uses `adminAuthentication` onRequest; `apps/api/src/middleware/auth.ts` compares credentials in constant time and rejects ingest on admin routes. `apps/api/src/middleware/errors.ts` maps public Core/DB errors and returns generic 500/503 bodies. P05 registers a separately guarded ingest plugin and preserves auth-before-body-validation.
- Migration `003_ingestion_structure.ts`: `inbox_messages` has identity UNIQUE(source, source_instance, source_message_id), sender FK, raw text, status CHECK (`received`, `processing`, `needs_confirmation`, `processed`, `failed`, `ignored`), attempt/time/failure metadata and indexes. `interpretations` has UNIQUE(inbox_message_id, attempt_number). `confirmation_sessions` has status/resolved checks, origin/resolver FKs, target version, expiry and one-pending partial unique index. Migration `004_transaction_structure.ts` supplies nullable `transactions.inbox_message_id` and its FK/index.

## 4. Final decomposition and test ownership

| Task | Owner and prerequisite | Evidence required |
| --- | --- | --- |
| [P01](M05-P01.md) | Pre-persistence authorization, Inbox repository/claim/retry; M04 + Gate A | Core unit; real PostgreSQL unique/failed/stale/authorization races |
| [P02](M05-P02.md) | Pure interpretation model/parser; P01 contract | Determinism, one command, unknown/ambiguous, exact Money/date unit tests |
| [P03](M05-P03.md) | Rule/default/alias resolution; P02 | Core priority/compatibility unit and PostgreSQL configuration race tests |
| [P04](M05-P04.md) | Confirmation repository/state machine; P01–P03 | TTL, short reply, supersede, original Inbox finalization, two-connection races |
| [P05](M05-P05.md) | API and shared transactional orchestration; P01–P04 | ingest/admin isolation, Inbox-to-financial-effect and rollback PostgreSQL tests |
| [P06](M05-P06.md) | Milestone verification only; P01–P05 | full CI-equivalent suite and M05 API/PostgreSQL E2E |

P01 owns Inbox persistence and claim semantics; P04 owns Confirmation persistence; P03 owns resolution; P05 owns only cross-component transaction composition and API. P06 adds acceptance tests and fixes only defects found within M05 scope. No parallel implementation of a second financial writer.

## 5. Security, concurrency and financial boundary

Authenticate `finance:ingest` before processing a body; filter group/from_me; normalize sender; lock and re-read active AuthorizedSender before inserting raw Inbox content. A concurrent revoke must serialize with insertion and prohibit later command execution after revoke. Keep unauthorized raw text out of Inbox, Audit, logs and error responses. Inbox identity and PostgreSQL row locks serialize duplicates; failed/stale claims reuse one row. A stale claimant must not commit after takeover: use a row lock or claim generation checked at finalization. Terminal Inbox and posted Transaction/idempotency/Audit must commit atomically. Derive a stable Inbox key from immutable Inbox identity/ID, never user-supplied arbitrary idempotency material. Confirmed commands commit session resolution, original Inbox terminal state and financial effect atomically; cancelled/expired/superseded commands have no effect. Lock ordering must respect the M03 rank; restart whole transactions on incomplete discovery. Use real PostgreSQL independent connections and deterministic barriers for races.

M04 Money, currency, Book timezone date, source of truth, transaction type and version rules continue unchanged. Explicit input outranks manual rule, known alias and any optional AI; no AI is required. Do not infer a financial command when required fields remain ambiguous.

## 6. Scope, migrations, gates and approval

No migration, external dependency, lockfile or frozen-document change is planned. No Evolution/n8n transport, M07 correction/void/refund, M08 reporting, M09 recovery, VPS/Lab/Production or gate execution. Gate A is PASS; Gate 0/B/C are NOT EXECUTED and do not gate local M05.

- [ ] Human accepts assumption deltas and P01–P06 contracts.
- [ ] Human approves promotion to `docs/tasks/active/`.
- [ ] Human separately authorizes M05-P01 implementation.

**Decision pending:** On acceptance, promote this overview and six contracts from `planned/` to `active/`, update `PROJECT_STATE.md`, and record the accepted review SHA. Until then M05 is PLANNED and no implementation task is authorized.
