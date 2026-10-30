# M07 — Correction / Void / Refund

**Status:** TECHNICAL COMPLETE; GATE B PASS (local/CI) — M07-P01–P06 DONE/integrated. Gate 0 formal PASS and Production not approved.
**Dependencies:** M06 DONE / owner-accepted for isolated Lab; PR #41 merged at `645ea0193188be54ec5c9e0d988ec6348b0038ef`; post-merge CI 40943150391 SUCCESS
**Blocks:** Gate B cleared for M08 Activation Review; no live/M08 implementation authorization.

> **Activation accepted:** [review](M07-ACTIVATION-REVIEW.md), PR #42 squash `18dd52a619c0b93ebb14d8b2a4c5335205284c10`, independent REVIEW PASS head `3bbdc4705f72fb0255f80778639f20b620ff2b02`, CI #40963187248 SUCCESS.
> M07-P01–P04 DONE after independent REVIEW PASS and authorized merges (#44, #46, #48, #50); P04 squash `e7392e3ff863ff226c0a6303cfa1111a42859001`. P05 accepted and integrated via PR #52 (`fc169713a1089db0f20585eb25535e0e0abcd6f5`, CI #41074567587 SUCCESS); P06 independent REVIEW PASS and integrated via PR #54. Gate B not executed. No VPS/Production authorization.

P04 final evidence: [race matrix and exact tests](../completed/M07-P04.md) cover 27 PostgreSQL cases (22 A–J + 5 actual original-Expense FOR UPDATE waits). Independent REVIEW PASS #5712722020; PR #50 final head `a6339606ba60dfb7cd3cb25b4ce1b700dc291dca`, exact CI #41058232833 SUCCESS (1,059 unit; 506 PostgreSQL; M06 regressions) and squash `e7392e3ff863ff226c0a6303cfa1111a42859001`. Postmerge run #41061198756.

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
- Administrative `GET /api/v1/transactions/{id}/refunds` exposes linked Refund history; `GET /api/v1/transactions/{id}/audit` exposes the target's append-only audit (both `finance:admin`, assigned to P06)

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

**Activation Review accepted:** [concrete implementation inventory and delta](M07-ACTIVATION-REVIEW.md). Schema/version/session targets exist; mutation ports, audit actions, operation idempotency scopes and mutation confirmation dispatch require bounded extensions. No migration or dependency is planned. M07-P01–P02 have been accepted and integrated; P03–P06 remain separately gated.

---

## 5. Task Decomposition — activated execution contracts

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| **M07-P01** | DONE / integrated — Correction + optimistic locking | PATCH endpoint/use case, version validation, mutable field enforcement, immutable field rejection, stale version error |
| **M07-P02** | DONE / integrated — Void + idempotency + audit | Void endpoint/use case, Idempotency-Key requirement, posted→voided transition, audit preservation, idempotent replay |
| **M07-P03** | DONE / integrated — Refund creation and invariants | Refund endpoint, linked-income representation, amount/date/Book/currency validation, refund-of-refund rejection, dedicated endpoint enforcement |
| **M07-P04** | DONE / integrated — Refund concurrency / original Expense locking | PostgreSQL FOR UPDATE or equivalent on original Expense, concurrent over-refund prevention, Expense-with-refunds void blocking, correction amount floor enforcement, correction date ceiling enforcement |
| **M07-P05** | DONE / integrated — WhatsApp Confirmation integration for correction/void/refund | Explicit Confirmation for every WhatsApp Void and Refund; clear ordinary Correction may execute directly when target, change and version are unambiguous; ambiguous Correction may use ConfirmationSession; Transaction sessions carry target_entity_id/target_version, reject stale confirmation, and finalize original Inbox |
| **M07-P06** | DONE / integrated — Administrative reads, API integration and milestone verification | Frozen Refund/audit GET endpoints with `finance:admin`, schema/response/authorization tests; mutation endpoints verified, critical scenario proven, unit/integration suites green |

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
- Refund and audit GETs require `finance:admin`, return scoped linked history and target audit, and reject unauthorized/malformed requests

---

## 8. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Indirectly (via M05/M06 chain) |
| Gate 0 | Conditional | Only if WhatsApp live testing requires VPS |
| Gate B | PASS — isolated CI financial integrity | [Gate B evidence](../completed/GATE-B.md); M08 Activation Review eligible |
| Gate C | NO | After M09 |

---

## 9. Activation Review and execution handoff

[Accepted Activation Review](M07-ACTIVATION-REVIEW.md) and active execution contracts
[M07-P01](../completed/M07-P01.md), [M07-P02](../completed/M07-P02.md), [M07-P03](../completed/M07-P03.md),
[M07-P04](../completed/M07-P04.md), [M07-P05](../completed/M07-P05.md), [M07-P06](../completed/M07-P06.md)
resolve the former interface/schema/locking questions against the main baseline.

P01–P03 include the safety guards needed when each endpoint is introduced; P04
consolidates cross-operation concurrency proof. P05 extends the existing Inbox
pipeline; P06 implements both frozen administrative Transaction GETs and proves
the exact frozen scenario and full regression. The milestone and its execution contracts are ACTIVE after documentary promotion; P01–P05 DONE / integrated in PRs #44, #46, #48, #50, #52; P06 independently accepted and integrated via PR #54; M07 technical delivery complete. Gate B NOT EXECUTED, future implementation tasks and gates separately controlled; no live infrastructure authorization is implied. Gate 0 still has no formal PASS and Production is not homologated.

---

## 10. Frozen Document Routing

Per AGENTS.md §6:
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `09-ROADMAP-TESTS.md`

**M07-P05 acceptance addendum (2026-10-30):** P05 independent REVIEW PASS #5714149479, reviewed head `bfd4ec5713a0aec9c5c948d65fb6551c5e10e41a`, exact-head CI #41074567587 SUCCESS (1,060 unit/516 PostgreSQL/M06 124 native/25 simulated/2 synthetic leak), PR #52 squash `fc169713a1089db0f20585eb25535e0e0abcd6f5`, post-merge CI #41076299512. P06 implementation authorized for local-WSL-CI; Gate 0 and Production remain unapproved.

**P06 technical acceptance record (2026-10-30):** PR #54 final head `0a07afbbaaa57c2edd94a1314f6552ca4523d24c`, independent REVIEW PASS #5715504972, exact CI #41090178258 SUCCESS (1,060 unit; 518 PostgreSQL incl 2 P06; 124 M06 native; 25 simulated; 2 synthetic leak), squash `66b95474ed5d1b1182bb220efe6ed3ec9aafe48e`, feature postmerge CI #41091824152 (SUCCESS required before documentary closure merge). See [acceptance evidence](M07-P06-ACCEPTANCE-EVIDENCE.md). All six P tasks reviewed/integrated; Gate B and Production are still pending.

**Gate B closure:** PASS on main@dc2c86314d6e66addbceb2ce85418e890a6bfbfe, CI #185 SUCCESS; [evidence](../completed/GATE-B.md). Gate 0 formal PASS and Production still pending.
