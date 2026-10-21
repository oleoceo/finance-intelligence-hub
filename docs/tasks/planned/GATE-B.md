# Gate B — Financial Lifecycle Integrity

**Status:** PLANNED
**Type:** Gate (integrity proof)
**Dependencies:** Accepted M07 implementation
**Blocks:** M08 activation

> **This document does NOT authorize execution.**
> Gate B occurs only after accepted M07 implementation.

---

## 1. Objective

Prove that the complete financial lifecycle maintains integrity under normal and adversarial conditions:

```text
Create → Read → Correction → Void → Refund
+ Idempotency
+ Audit
+ Inbox retry
```

All operations must preserve financial correctness, prevent duplication, and maintain audit trail.

---

## 2. Required Capabilities

All of the following must be proven with evidence:

### Core Lifecycle
1. **Create** — Expense, Income, Transfer via API
2. **Read** — Query by ID, List, Last
3. **Correction** — PATCH with optimistic locking, mutable/immutable enforcement
4. **Void** — posted→voided, idempotent, audit preserved
5. **Refund** — linked income, partial/full/multiple, concurrency safe

### Integrity Properties
6. **Idempotency** — same key + same request = same result; same key + different request = 409
7. **Audit** — every financial operation creates audit event atomically
8. **Inbox Retry** — processed duplicate = no reexecution; failed retry = same row; stale recovery works

---

## 3. Frozen Critical Scenario

This exact sequence MUST pass:

```text
Step 1: Create Expense amount=500
Step 2: Create Refund amount=200 linked to Expense
Step 3: Correct Expense to amount=450 → VALID (450 >= 200)
Step 4: Correct Expense to amount=100 → INVALID (100 < 200 posted refunds)
Step 5: Void Expense → INVALID (has posted Refund)
Step 6: Void Refund → VALID (Refund now voided)
Step 7: Void Expense → VALID (no posted Refunds remain)
```

Each step must produce the expected result with correct status codes, audit entries and financial state.

---

## 4. Duplicate Resilience Proof

Must demonstrate:

- Duplicate API create calls with same Idempotency-Key produce exactly one Transaction
- Duplicate webhook deliveries produce exactly one InboxMessage and one financial effect
- Duplicate Void calls with same Idempotency-Key return same result without side effects
- Duplicate Refund calls with same Idempotency-Key return same result without side effects
- Failed Inbox retry reuses same row and does not create duplicate financial effect

---

## 5. Required Evidence

### Test Evidence
- All M07 unit tests passing
- All M07 integration tests passing
- Frozen critical scenario executed and verified step-by-step
- Concurrent Refund race test proving over-refund impossible
- Idempotency replay tests for create/void/refund
- Inbox retry tests covering processed/failed/stale states

### API Evidence
- Each lifecycle operation demonstrated via API call
- Error responses verified for invalid operations
- Audit trail verified for each operation
- Version conflict responses verified

### Negative Evidence
- Generic create cannot produce Refund
- Refund-of-refund rejected
- Expense with posted Refund cannot be Voided
- Correction cannot violate refund amount floor
- Correction cannot violate refund date ceiling
- Stale version PATCH rejected

---

## 6. PASS/FAIL Criteria

### PASS
All capabilities proven. Frozen critical scenario passes completely. Duplicate resilience demonstrated. All M07 tests green. Evidence captured and recorded.

### FAIL
Any capability unproven. Frozen critical scenario fails at any step. Duplicate resilience not demonstrated. Any M07 test failing. Evidence incomplete.

---

## 7. Closure Artifact

Gate B closure must include:

- Exact commit SHA tested
- CI run ID confirming green
- Step-by-step frozen critical scenario execution record
- Duplicate resilience test results
- Concurrent Refund race test results
- Explicit PASS/FAIL determination
- Date and reviewer acknowledgment

---

## 8. Relationship to Other Milestones

- **M07**: Must be fully implemented and accepted before Gate B.
- **M08**: May begin Activation Review after Gate B PASS.
- **Gate A**: Must have already passed (prerequisite for M05→M06→M07 chain).
- **Gate 0**: Independent unless M07 WhatsApp testing required VPS access.
- **Gate C**: After M09.

---

## 9. Frozen Document Routing

Per AGENTS.md §6 (M07 routing applies since Gate B validates M07 output):
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `09-ROADMAP-TESTS.md`