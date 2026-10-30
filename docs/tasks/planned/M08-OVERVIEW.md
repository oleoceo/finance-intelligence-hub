# M08 — Reports / Export / Operations

**Status:** PLANNED — M08 Activation Review eligible after Gate B PASS; implementation NOT AUTHORIZED.
**Dependencies:** [Gate B PASS (local/CI)](../completed/GATE-B.md), baseline main@dc2c86314d6e66addbceb2ce85418e890a6bfbfe, CI #185 SUCCESS.
**Blocks:** M09 activation

> **This document does NOT authorize implementation.**
> Provisional task decomposition and scope are defined here. Execution-ready
> contracts are finalized during Activation Review.

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

**ACTIVATION REVIEW REQUIRED**: Exact Summary query port interface, CSV generation approach, and WhatsApp reply formatting must be verified against actual M06/M07 implementations.

---

## 5. Provisional Task Decomposition

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| **M08-P01** | Summary Core/query contracts | Summary calculation logic, period handling, Book timezone support, formula unit tests |
| **M08-P02** | Summary API | `GET /api/v1/reports/summary`, required book_id, optional date_from/date_to, current-month Book-timezone default, aggregate decimal string response |
| **M08-P03** | WhatsApp Summary integration | Command recognition in parser, Summary orchestration through ingest pipeline, reply formatting |
| **M08-P04** | CSV export and injection hardening | CSV generation, injection mitigation, content-type headers, download endpoint |
| **M08-P05** | Operational endpoint/logging verification | Health/readiness verification, structured log audit, secret redaction confirmation |
| **M08-P06** | M08 milestone E2E verification | All Summary formulas verified, WhatsApp Summary E2E, CSV correctness, pagination default 50/max 100 verified only on existing paginated API surfaces, operational checks green |

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

## 8. Known Risks Deferred to Activation Review

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
