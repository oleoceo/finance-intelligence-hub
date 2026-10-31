# M08 — Reports / Export / Operations

**Status:** ACTIVE — P01-P04 DONE; P05 REVIEW REQUIRED after local/WSL/CI implementation.
**Dependencies:** [Gate B PASS (local/CI)](../completed/GATE-B.md); Gate B closure main@539a210342b8d9235eca176f5070e68ad5b5d786, CI #187 SUCCESS. [M08 Activation Review](M08-ACTIVATION-REVIEW.md) defines execution contracts.
**Blocks:** M09 activation

> **Execution gating:** Execute one selected active task at a time. P01-P04 are DONE; P05 is REVIEW REQUIRED. Do not infer VPS/Production permission. See linked contracts below.

---

## 1. Objective

Make financial data consultable and operable:

- Summary (by Book/period)
- CSV export (with injection mitigation)
- Operational verification endpoints
- WhatsApp Summary integration via M06 pipeline

No dashboard or Metabase in V0.1.

---

## 2. Stable Scope

### Summary Formulas

All formulas operate per Book, per period. Transfers excluded. Voided excluded.

```text
ordinary_income = posted income WHERE refund_of_transaction_id IS NULL
gross_expenses = posted expense
refunds = posted income WHERE refund_of_transaction_id IS NOT NULL
net_expenses = gross_expenses - refunds
net = ordinary_income - net_expenses
```

### Direct API Summary
- `GET /api/v1/reports/summary` returns aggregate values, not a paginated collection
- `book_id` required
- `date_from` and `date_to` optional
- Default period = current month in Book timezone
- Response includes all five formula values as decimal strings

### WhatsApp Summary
- Activated through M06 ingest pipeline (no financial logic in n8n)
- Commands: `resumo`, `resumo pessoal`, `resumo empresa`
- Uses AuthorizedSender default_book_id when Book not explicit
- Response formatted for WhatsApp readability

### CSV Export
- By Book and period
- CSV injection mitigation: prefix cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` with single quote or equivalent safe encoding
- Decimal string amounts (no floating point)

### Operational Verification
- Health endpoint: process alive, dependency-free
- Readiness endpoint: PostgreSQL connectivity verified
- Structured logs: request_id, correlation_id, error codes, secret redaction
- No secret exposure in any operational output

---

## 3. Exclusions

- Dashboard / Metabase (post-V0.1)
- Backup/restore (M09)
- New Transaction types or statuses
- Financial business logic changes
- Correction/Void/Refund operations (M07)

---

## 4. M06/M07 Contracts Consumed

From M06:
- Ingest pipeline available for WhatsApp Summary command routing
- Reply delivery mechanism for Summary responses

From M07:
- Refund semantics (refund_of_transaction_id distinction) required for Summary formula correctness
- Void semantics (voided exclusion) required for Summary formula correctness

**Activation inventory recorded:** See [M08 Activation Review](M08-ACTIVATION-REVIEW.md) for exact M06/M07 interfaces, the missing Summary read port, CSV approach, Book timezone and reply boundaries. No new migration/dependency is planned.

---

## 5. Execution Task Decomposition (P01–P06 sequential)

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| [**M08-P01**](../completed/M08-P01.md) | Summary Core/query contracts — DONE | Summary calculation logic, period handling, Book timezone support, formula unit tests |
| [**M08-P02**](../completed/M08-P02.md) | Summary API — DONE | `GET /api/v1/reports/summary`, required book_id, optional date_from/date_to, current-month Book-timezone default, aggregate decimal string response |
| [**M08-P03**](../completed/M08-P03.md) | WhatsApp Summary integration — DONE | Command recognition in parser, Summary orchestration through ingest pipeline, reply formatting |
| [**M08-P04**](../completed/M08-P04.md) | CSV export and injection hardening - DONE | CSV generation, injection mitigation, content-type headers, download endpoint |
| [**M08-P05**](M08-P05.md) | Operational endpoint/logging verification | Health/readiness verification, structured log audit, secret redaction confirmation |
| [**M08-P06**](M08-P06.md) | M08 milestone E2E verification | All Summary formulas verified, WhatsApp Summary E2E, CSV correctness, pagination default 50/max 100 verified only on existing paginated API surfaces, operational checks green |

---

## 6. Required Test Categories

### Unit Tests
- Summary formula correctness (ordinary_income excludes refunds, net_expenses subtracts refunds, transfers excluded, voided excluded)
- Period boundary handling (month start/end, timezone conversion)
- CSV injection mitigation for all dangerous prefixes
- Pagination default 50/max 100 on existing paginated API surfaces where applicable; Summary and CSV export are not assigned pagination by this plan

### Integration Tests (PostgreSQL)
- Summary query against realistic dataset with mixed posted/voided/refund transactions
- Summary correctness after Correction/Void/Refund operations
- CSV export matches Summary totals
- WhatsApp Summary command produces correct reply

### Acceptance Scenarios
- `resumo` returns correct Summary for default Book
- `resumo pessoal` returns correct Summary for Pessoal Book
- `resumo empresa` returns correct Summary for Empresa Book
- Direct API Summary matches WhatsApp Summary values
- CSV download contains no injectable formulas
- Health returns 200 without DB dependency
- Readiness returns 200 with DB, 503 without
- Logs contain request_id/correlation_id, no secrets

---

## 7. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Indirectly (via M05→M06→M07 chain) |
| Gate 0 | Conditional | Only if WhatsApp live testing requires VPS |
| Gate B | YES | Must PASS before M08 activation |
| Gate C | NO | After M09 |

---

## 8. Previously Deferred Risks — Reviewed in Activation Review

- Whether M06 ingest pipeline supports Summary command routing without modification
- Exact M07 refund/void query interfaces needed for Summary filtering
- Book timezone storage and retrieval mechanism
- Whether existing CSV library handles injection mitigation or requires custom encoding
- Operational endpoint framework already established in M01 (verify compatibility)

---

## 9. Frozen Document Routing

Per AGENTS.md §6:
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `07-SECURITY.md`
- `09-ROADMAP-TESTS.md`
