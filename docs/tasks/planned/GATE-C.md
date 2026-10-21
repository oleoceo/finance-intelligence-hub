# Gate C — Real Data Ready

**Status:** PLANNED
**Type:** Gate (final V0.1 release gate)
**Dependencies:** Accepted M09 implementation including actual isolated restore
**Blocks:** v0.1.0 release, real financial data usage

> **This document does NOT authorize execution.**
> Gate C occurs only after accepted M09 implementation with proven restore.

---

## 1. Objective

Answer definitively:

```text
Can this system safely store real personal financial data?
```

PASS means `REAL DATA READY` and satisfies V0.1 release criteria. Creating the `v0.1.0` tag/release is a separate action requiring explicit human authorization and exact SHA verification.

---

## 2. Required Evidence Categories

### CORE
- [ ] Expense create/query/correct/void
- [ ] Income create/query
- [ ] Transfer create/query
- [ ] Correction with optimistic locking
- [ ] Void with idempotency
- [ ] Refund (partial/full/multiple) with concurrency safety

### INTEGRITY
- [ ] Money precision (NUMERIC(18,2), decimal strings, no floating point)
- [ ] Book isolation and integrity
- [ ] Currency consistency (Book = Account = Transaction)
- [ ] Idempotency on create/void/refund
- [ ] Audit trail complete for all financial operations

### INGESTION
- [ ] AuthorizedSender check before raw persistence
- [ ] Pre-raw authorization ordering enforced
- [ ] Inbox retry lifecycle (processed/failed/stale)
- [ ] ConfirmationSession lifecycle (pending/confirmed/cancelled/expired/superseded)
- [ ] WhatsApp commands functional through full pipeline

### REPORTING
- [ ] Summary formulas correct (ordinary_income, gross_expenses, refunds, net_expenses, net)
- [ ] WhatsApp Summary functional
- [ ] CSV export with injection mitigation

### SECURITY
- [ ] `finance:ingest` credential cannot perform admin financial operations
- [ ] `finance:admin` separated from ingest
- [ ] PostgreSQL not publicly exposed
- [ ] Redis not publicly exposed
- [ ] Secrets protected (no exposure in logs, Git, responses)
- [ ] Agent/Codex privileges bounded

### OPERATIONS
- [ ] Structured logs with request_id/correlation_id
- [ ] Health endpoint functional
- [ ] Readiness endpoint functional
- [ ] Secret redaction verified

### RECOVERY
- [ ] Daily backup executing
- [ ] Encrypted off-site copy confirmed
- [ ] Retention policy enforced (14d/8w/12m)
- [ ] Restore runbook documented
- [ ] Successful isolated restore executed and validated
- [ ] Production untouched during restore validation

---

## 3. Hard FAIL Conditions

Any of the following results in immediate FAIL:

- No actual restore test executed (documentation-only claim is insufficient)
- Ingest credential (`finance:ingest`) can perform admin financial operation
- Unauthorized sender can persist Finance Inbox raw content
- Webhook retry duplicates financial effect
- Refund can exceed original Expense amount
- PostgreSQL or Redis publicly exposed
- Secrets found in logs, Git history, or API responses
- Frozen critical scenario (Gate B) not passing
- Summary formulas incorrect
- Backup not executing daily
- Off-site copy missing or unencrypted

---

## 4. PASS Criteria

ALL evidence categories satisfied. NO hard FAIL conditions present. Explicit human review and acceptance.

Upon PASS:
- Declare `REAL DATA READY`
- Real personal financial data may be stored in Production
- Record eligibility for a separately authorized `v0.1.0` release/tag

---

## 5. Closure Artifact

Gate C closure must include:

- Checklist with all evidence categories marked and referenced
- Exact commit SHA tested
- CI run ID confirming green
- Isolated restore execution record with validation results
- Security scan/audit summary
- Backup verification evidence
- Explicit PASS/FAIL determination
- Date and reviewer acknowledgment
- Release eligibility and recommended exact release SHA; actual `v0.1.0` tag/release requires separate explicit human authorization and SHA verification

---

## 6. Relationship to Other Milestones

- **M09**: Must be fully implemented and accepted before Gate C, including actual isolated restore.
- **Gate A/B**: Must have already passed.
- **Gate 0**: Must have passed; Gate C recovery evidence depends on Gate 0 infrastructure findings.
- **v0.1.0**: Eligible after Gate C PASS; release/tag creation is separately authorized with exact SHA verification.
- **M10+**: Post-V0.1 expansion; do not block Gate C.

---

## 7. Frozen Document Routing

Per AGENTS.md §6 (comprehensive V0.1 validation):
- All frozen canonical documents are relevant for Gate C cross-reference
- Primary focus: `07-SECURITY.md`, `08-BACKUP-RESTORE.md`, `09-ROADMAP-TESTS.md`
