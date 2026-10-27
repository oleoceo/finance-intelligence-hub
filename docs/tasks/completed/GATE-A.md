# Gate A — Core Independence

**Status:** DONE — PASS
**Type:** Gate (functional proof)
**Dependencies:** Accepted M04 implementation
**Blocks:** Cleared for M05 Activation Review. M06 still also depends on Gate 0 for live acceptance.

> **Execution authorized:** 2026-10-22 by explicit human instruction.
> **Authoritative main tested:** `fed42a75a4f41eadec9e1e8ede0f41a5354b18ef`
> **CI evidence:** GitHub Actions run `39836071361` = SUCCESS.
> **Reviewer acknowledgment:** Gate evidence independently reviewed against the frozen Gate A contract.

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

---

## 11. Execution Evidence — 2026-10-22

**Determination:** PASS

### Preconditions

- M04-T01 through M04-T08 are integrated in `main`.
- PR #15 was squash-merged as `fed42a75a4f41eadec9e1e8ede0f41a5354b18ef`.
- Post-merge CI `39836071361` = SUCCESS.
- Full unit suite: **33 files / 934 tests PASS**.
- Full PostgreSQL integration suite: **22 files / 379 tests PASS**.
- Finance API/PostgreSQL E2E: **10 tests PASS**.

### Environment isolation

The official GitHub Actions workflow for the tested SHA provisions only Node.js 24, pnpm, the repository and PostgreSQL via Testcontainers. It does not provision or configure Evolution, n8n, any AI provider, Firefly or Metabase.

Repository/package inspection on the tested SHA found no runtime dependency or source reference to Evolution, n8n, AI providers, Firefly or Metabase in the Finance API/Core/Database implementation.

### Required capabilities

| Gate A capability | Evidence | Result |
| --- | --- | --- |
| Create Expense | real Finance API/PostgreSQL E2E POST `/api/v1/transactions`, posted result, Idempotency-Key | PASS |
| Create Income | E2E successful create for `income`; ordinary Income persisted without refund relation | PASS |
| Create Transfer | E2E successful create for `transfer`; destination Account persisted | PASS |
| Query Transaction | E2E GET by ID plus List query paths | PASS |
| Get Last | E2E `/api/v1/transactions/last?book_id=...` including posted/ordering semantics | PASS |

### Negative dependency checks

- Evolution: no runtime dependency/reference required by Finance API/Core/Database.
- n8n: no runtime dependency/reference required by Finance API/Core/Database.
- AI: no provider/model runtime dependency required by M04.
- Firefly: no runtime adapter/dependency required by M04.
- Metabase: no runtime dependency required by M04.
- WhatsApp ingestion is not involved in any Gate A create/query path.

### Gate result

All five mandatory capabilities work through Finance API/Core on the isolated CI environment while the external integration stack is absent.

**GATE A = PASS**

This PASS clears the Gate A prerequisite for M05/M06. It does not activate M05 or M06 automatically. M05 remains PLANNED / NOT ACTIVE / NOT AUTHORIZED until its Activation Review is separately authorized. Gate 0 remains NOT EXECUTED.
