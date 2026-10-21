# M07 — Correction / Void / Refund

**Status:** PLANNED
**Dependencies:** M06 accepted
**Blocks:** Gate B

> **This document does NOT authorize implementation.**
> Provisional task decomposition and scope are defined here. Execution-ready
> contracts are finalized during Activation Review.

---

## 1. Objective

Complete the safe financial lifecycle:

```text
Correction (PATCH with optimistic locking)
Void (idempotent, audit-preserved)
Refund (partial/full/multiple, concurrency-safe)
WhatsApp Confirmation for destructive operations
```

---

## 2. Stable Scope

### Correction / PATCH
Mutable fields:
- `amount`
- `account_id`
- `category_id`
- `merchant_id`
- `description`
- `notes`
- `transaction_date`

Immutable fields:
- `book_id`
- `type`
- `status`
- `source`
- `refund_of_transaction_id`

Mechanism:
- Optimistic locking via `version` field
- Stale `target_version` → `409 VERSION_CONFLICT`
- Wrong Book correction: Void + recreate (not PATCH)

### Void
- Transitions `posted → voided`
- Requires current `version`
- Requires `Idempotency-Key`
- Preserves full audit history
- Idempotent: same key returns same logical result

### Refund
- Represented as `Transaction.type = income` with `refund_of_transaction_id` pointing to original Expense
- Dedicated endpoint: `POST /transactions/{id}/refunds`
- NEVER created via generic `POST /transactions`
- Target: posted Expense only
- Partial, full and multiple refunds permitted
- Same Book and currency inherited from original Expense
- Refund Account must be in same Book/currency
- `refund.transaction_date >= original.transaction_date`
- Refund-of-refund: REJECTED
- Refund immutable except via Void
- `sum(posted refunds) <= original Expense amount`
- Concurrent over-refund: IMPOSSIBLE (PostgreSQL locking)
- Original Expense with posted Refund: cannot be Voided
- Expense amount correction cannot go below sum of posted refunds
- Expense date correction cannot move after any posted Refund date

### WhatsApp Integration
- Void via WhatsApp always requires explicit Confirmation.
- Refund via WhatsApp always requires explicit Confirmation.
- Clear ordinary Correction may execute without a second confirmation only when the target and fields/change are unambiguous and the target version is valid.
- Ambiguous Correction or one requiring a choice may use ConfirmationSession.
- Whenever ConfirmationSession targets a Transaction, preserve `target_entity_id` and `target_version`; execution validates freshness.

---

## 3. Exclusions

- Summary or reporting formulas (M08)
- CSV export (M08)
- Backup/restore (M09)
- Dashboard/Metabase (post-V0.1)
- New Transaction types (frozen: expense/income/transfer only)
- Adjustment type (not V0.1)

---

## 4. M04/M05 Contracts Consumed

M07 expects to consume:

From M04:
- Transaction read/write ports
- Idempotency-Key persistence and lookup
- Audit event creation
- Money value object
- Version field on Transaction entity
- Book/Account/Currency validation ports

From M05:
- ConfirmationSession lifecycle (create, confirm, cancel, expire)
- Confirmation target tracking (`target_entity_id`, `target_version`)
- Inbox finalization after confirmation resolution

**ACTIVATION REVIEW REQUIRED**: All concrete reuse of M04 transaction/idempotency/audit interfaces and M05 confirmation interfaces must be verified against actual implementations. Do not guess exact signatures now.

---

## 5. Provisional Task Decomposition

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| **M07-P01** | Correction + optimistic locking | PATCH endpoint/use case, version validation, mutable field enforcement, immutable field rejection, stale version error |
| **M07-P02** | Void + idempotency + audit | Void endpoint/use case, Idempotency-Key requirement, posted→voided transition, audit preservation, idempotent replay |
| **M07-P03** | Refund creation and invariants | Refund endpoint, linked-income representation, amount/date/Book/currency validation, refund-of-refund rejection, dedicated endpoint enforcement |
| **M07-P04** | Refund concurrency / original Expense locking | PostgreSQL FOR UPDATE or equivalent on original Expense, concurrent over-refund prevention, Expense-with-refunds void blocking, correction amount floor enforcement, correction date ceiling enforcement |
| **M07-P05** | WhatsApp Confirmation integration for correction/void/refund | Explicit Confirmation for every WhatsApp Void and Refund; clear ordinary Correction may execute directly when target, change and version are unambiguous; ambiguous Correction may use ConfirmationSession; Transaction sessions carry target_entity_id/target_version, reject stale confirmation, and finalize original Inbox |
| **M07-P06** | API integration and milestone verification | All endpoints wired, frozen critical scenario proven, unit/integration suites green |

---

## 6. Frozen Critical Scenario

This exact scenario MUST be provable:

```text
Expense 500
→ Refund 200
→ correction to 450: VALID (450 >= 200)
→ correction to 100: INVALID (100 < 200 posted refunds)
→ Void Expense: INVALID (has posted Refund)
→ Void Refund: VALID
→ Void Expense: VALID (Refund now voided)
```

---

## 7. Required Test Categories

### Unit Tests
- Correction mutable/immutable field enforcement
- Version conflict detection
- Void state transition validation
- Refund invariant checks (amount, date, Book, currency, refund-of-refund)
- Clear ordinary Correction direct execution only with unambiguous target, fields/change and valid version
- Mandatory explicit Confirmation for WhatsApp Void and Refund; choice-driven Correction may use ConfirmationSession
- Confirmation target entity and version validation whenever a session targets a Transaction

### Integration Tests (PostgreSQL)
- Optimistic locking under concurrent PATCH
- Idempotent Void replay
- Concurrent Refund creation against same Expense (over-refund impossible)
- Expense-with-refunds Void rejection
- Correction amount floor with posted refunds
- Correction date ceiling with posted refunds
- Refund inherits Book/currency from original
- Dedicated refund endpoint only (generic create rejects refund)

### Acceptance Scenarios
- Full frozen critical scenario passes
- Duplicate Void API call returns same result
- Duplicate Refund API call returns same result
- WhatsApp Void requires Confirmation
- WhatsApp Refund requires Confirmation
- Clear ordinary WhatsApp Correction can execute without a second confirmation when target, fields/change and target version are unambiguous and valid
- Ambiguous WhatsApp Correction requests a choice and may use ConfirmationSession
- Transaction ConfirmationSession preserves `target_entity_id` and `target_version`
- Stale Confirmation target_version rejected
- Generic create cannot produce Refund

---

## 8. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Indirectly (via M05/M06 chain) |
| Gate 0 | Conditional | Only if WhatsApp live testing requires VPS |
| Gate B | THIS milestone leads to Gate B | Gate B validates M07 output |
| Gate C | NO | After M09 |

---

## 9. Known Risks Deferred to Activation Review

- Exact M04 Transaction port interface for PATCH/version operations
- Whether M04 already exposes a version field or if M07 must add it
- Exact M05 ConfirmationSession API for creating sessions with target_entity_id/target_version
- Whether existing audit infrastructure supports Void/Refund event types
- PostgreSQL locking strategy for concurrent Refund (FOR UPDATE vs advisory lock)
- Whether M02 migration already includes all required columns for Correction/Void/Refund

---

## 10. Frozen Document Routing

Per AGENTS.md §6:
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `09-ROADMAP-TESTS.md`
