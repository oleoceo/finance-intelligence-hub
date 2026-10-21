# Gate A — Core Independence

**Status:** PLANNED
**Type:** Gate (functional proof)
**Dependencies:** Accepted M04 implementation
**Blocks:** M05 activation, M06 activation

> **This document does NOT authorize execution.**
> Gate A occurs only after accepted M04 implementation.

---

## 1. Frozen Objective

Prove that Finance Hub is a valid financial system **without**:

- Evolution
- n8n
- AI
- Firefly
- Metabase

Proof must be through Finance API/Core only.

---

## 2. Required Capabilities

All of the following must succeed via Finance API/Core with external integrations stopped/unavailable:

1. **Create Expense** — posted, with valid Book/Account/Category/Merchant references
2. **Create Income** — posted, ordinary income (no refund relation)
3. **Create Transfer** — posted, same Book/currency, source ≠ destination
4. **Query Transaction** — retrieve by ID with full financial data
5. **Get Last** — most recently created posted Transaction in a Book

---

## 3. Preconditions

- M04 implementation accepted and integrated to `main`
- All M04 unit and integration tests passing
- Finance API running locally or in isolated test environment
- No dependency on Evolution, n8n, AI, Firefly or Metabase at runtime
- Test database populated with minimal master data (Book, Accounts, Category, Merchant)

---

## 4. Environment Isolation

Gate A must demonstrate Core independence by verifying that:

- Evolution API is stopped or unreachable
- n8n is stopped or unreachable
- AI provider is unavailable or unconfigured
- Firefly adapter is absent or disabled
- Metabase is absent or disabled

Finance API/Core must function correctly under these conditions.

---

## 5. Negative Dependency Checks

Confirm that no runtime code path for Create/Query/Last requires:

- WhatsApp message ingestion
- n8n webhook processing
- AI classification or parsing
- Firefly synchronization
- External dashboard queries

If any such dependency exists, Gate A FAILS and the dependency must be removed before re-evaluation.

---

## 6. Required Tests and Evidence

### API-Level Evidence
- Successful POST `/api/v1/transactions` for expense, income, transfer
- Successful GET `/api/v1/transactions/{id}` returning complete financial data
- Successful GET `/api/v1/transactions/last?book_id=...` returning correct result
- All responses use decimal string amounts (no floating point)
- All transactions have `status: posted`
- Idempotency-Key honored on create operations

### Integration Test Evidence
- Unit tests: all M04 suites passing
- PostgreSQL integration tests: all M04 suites passing
- No test requires external service connectivity

### Negative Evidence
- Confirmation that no API route handler imports or calls Evolution/n8n/AI/Firefly modules
- Confirmation that Finance Core package has zero dependencies on messaging infrastructure

---

## 7. PASS/FAIL Criteria

### PASS
All five capabilities succeed. All negative dependency checks pass. All M04 tests green. Evidence captured and recorded.

### FAIL
Any capability fails. Any external dependency detected. Any M04 test failing. Evidence incomplete.

---

## 8. Closure Artifact

Gate A closure must include:

- Exact commit SHA tested
- CI run ID confirming green
- Evidence of each capability succeeding
- Evidence of negative dependency checks
- Explicit PASS/FAIL determination
- Date and reviewer acknowledgment

---

## 9. Relationship to Other Milestones

- **M04**: Must be fully implemented and accepted before Gate A.
- **M05**: May begin Activation Review after Gate A PASS. M05 local/domain work does not require live VPS.
- **Gate 0**: Independent. May execute before or after Gate A.
- **M06**: Requires both Gate A PASS and (for live acceptance) Gate 0 PASS.

---

## 10. Frozen Document Routing

Per AGENTS.md §6 (M04 routing applies since Gate A validates M04 output):
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `09-ROADMAP-TESTS.md`