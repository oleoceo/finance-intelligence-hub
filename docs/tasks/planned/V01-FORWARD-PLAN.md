# V0.1 Forward Plan

**Status:** PLANNED
**Created:** 2026-10-21
**Base:** `d369261aceb8c91a2ee3449c64be7d7b24af11ab` (current main; accepted M04 planning integrated)
**Scope:** Gate 0 through Gate C (V0.1 release)

> **This document does NOT authorize implementation.**
> It defines stable scope, dependencies, invariants and acceptance criteria
> for forward planning only. Execution requires Activation Review and explicit
> human authorization per milestone.

---

## 1. Current Baseline

Completed and accepted:

- **M01** Local Bootstrap: DONE
- **M02** Database Foundation: DONE
- **M03** Master Data / Configuration: DONE (T01–T05 integrated via PR #3)
- **M04** Transaction Core: PLANNING ACCEPTED (T01–T08 planned); implementation NOT AUTHORIZED

Post-merge CI for the accepted M04 planning commit `d369261aceb8c91a2ee3449c64be7d7b24af11ab`: run `39661571275` = SUCCESS.

Architecture and canonical documentation remain FROZEN. ADR-001/002 ACCEPTED. ADR-003 OPEN pending Gate 0 evidence.

---

## 2. Product Maturity Definitions

### Usable via Core/API
After **M04 + Gate A**: Finance API/Core supports Create Expense, Create Income, Create Transfer, Query Transaction, Get Last — without Evolution, n8n, AI or Firefly. Valid financial system proven through direct API.

### Usable via WhatsApp
After **M05 + M06**: Primary WhatsApp workflow operational for Expense, Income, Transfer and Last commands. Authorized sender → Inbox → deterministic interpretation → optional Confirmation → financial effect. Transport via Evolution/n8n remains thin; no business logic in n8n.

### Functionally Complete V0.1
After **M07 + Gate B + M08**: Financial lifecycle (Correction, Void, Refund) complete. Summary and CSV export available. Operational endpoints verified. User-facing V0.1 functionality essentially complete.

### REAL DATA READY
After **M09 + Gate C**: Backup/restore operational with at least one successful isolated restore. All security, integrity, ingestion, reporting and recovery evidence verified. `REAL DATA READY`; eligible for a separately authorized `v0.1.0` release/tag.

---

## 3. Dependency Graph

```text
M04 implementation
  → Gate A

Gate A
  ├→ M05
  └→ Gate 0 (may execute independently/in parallel when separately authorized)

M05 + Gate 0
  → M06 live/VPS integration acceptance

M06
  → M07

M07
  → Gate B

Gate B
  → M08

M08
  → M09

M09
  → Gate C

Gate C PASS
  → REAL DATA READY
  → v0.1.0 release/tag eligible (separate human authorization and exact SHA verification)
```

### Critical Path

```text
M04 impl → Gate A → M05 → [Gate 0] → M06 → M07 → Gate B → M08 → M09 → Gate C
```

Gate 0 is on the critical path for M06 live acceptance but may be executed in parallel with M05 after Gate A.

### Parallelizable Opportunities

- **Gate 0** may execute independently after Gate A (or even before, if separately authorized), in parallel with M05 local/domain work.
- **M05 local/static planning and domain implementation** does not inherently require live VPS access.
- **M09 backup script/layout design** may begin during M08, but execution and isolated restore require Gate 0 evidence.

---

## 4. Gate Purposes and Prerequisites

| Gate | Purpose | Prerequisites | Evidence Required |
|------|---------|---------------|-------------------|
| **Gate 0** | Inspect actual VPS before operational changes | Separate authorization | Host inventory, container/network/volume state, postgres-products status, security posture |
| **Gate A** | Prove Finance Hub is valid financial system without messaging/AI | Accepted M04 implementation | Create Expense/Income/Transfer, Query, Last via Finance API/Core only |
| **Gate B** | Prove financial lifecycle integrity | Accepted M07 | Correction, Void, Refund, Idempotency, Audit, Inbox retry; frozen scenario proof |
| **Gate C** | Real-data readiness | Accepted M09 + all prior gates | Full CORE/INTEGRITY/INGESTION/REPORTING/SECURITY/OPERATIONS/RECOVERY evidence; actual isolated restore |

### Gate Relationships

- Gate 0 is an **infrastructure safety prerequisite** for real VPS/Lab activity. It is NOT replaced by Gate A.
- Gate A is **functional Core independence**.
- Gate B is **financial lifecycle integrity**.
- Gate C is **real-data readiness**.
- Live M06 Evolution/n8n acceptance MUST NOT bypass Gate 0.
- M09 operational implementation necessarily relies on Gate 0 evidence.
- Gate C requires an **actually executed** isolated restore, not documentation-only claims.

---

## 5. Milestone Ownership Boundaries

| Milestone | Scope | Exclusions |
|-----------|-------|------------|
| **M05** | Inbox authorization, persistence, retry, interpretation, parser, ClassificationRules, defaults, ConfirmationSession | Evolution/n8n transport (M06), Summary (M08) |
| **M06** | Evolution + n8n → Finance API transport; reply mapping; duplicate resilience | Financial business logic in n8n, Summary (M08) |
| **M07** | Correction, Void, Refund, optimistic locking, idempotency, mandatory WhatsApp Confirmation for Void/Refund and conditional Confirmation for ambiguous Correction | Summary (M08), Backup (M09) |
| **M08** | Summary, CSV export, operational verification, WhatsApp Summary | Dashboard/Metabase, Backup (M09) |
| **M09** | Backup scripts, Restic/rclone encrypted off-site, scheduler, retention, restore runbook, isolated restore | Shared postgres-products pg_dumpall, Production mutations |

---

## 6. Planned vs Active Semantics

### PLANNED
Approved forward plan stored under `docs/tasks/planned/`. Defines stable objective, scope, exclusions, dependencies, invariants, provisional task decomposition, acceptance criteria, test categories, gate dependencies and known risks.

**MUST NOT** be treated as implementation authorization.
**SHOULD NOT** over-specify exact future class names, function signatures, repository filenames, concrete adapters not yet created, or implementation mechanics depending on unfinished milestones.

### ACTIVE
Execution-ready contracts based on real current code. Only ACTIVE tasks may authorize implementation. Created during Activation Review by comparing PLANNED assumptions against actual `main`.

### Lifecycle

```text
PLANNED
  ↓
ACTIVATION REVIEW
  ↓
ACTIVE
  ↓
REVIEW REQUIRED
  ↓
DONE
```

---

## 7. Activation Review Procedure

Immediately before implementing a milestone:

1. Compare approved forward plan against actual current `main` SHA.
2. Identify assumptions made stale by earlier implementation.
3. Update only stale deltas — do not rewrite stable content.
4. Finalize execution-ready task contracts with exact interfaces/signatures.
5. Promote from `docs/tasks/planned/` to `docs/tasks/active/`.
6. Obtain explicit human authorization before implementation.

See `docs/tasks/planned/ACTIVATION-REVIEW.md` for the reusable template.

Activation Review must NOT reopen frozen architecture absent a true blocker.

---

## 8. Post-V0.1 Expansion

M10–M20 remain post-v0.1 roadmap concepts:

```text
M10 Firefly Adapter
M11 Cards / Installments / Recurrence
M12 Products / Consumption
M13 Price Intelligence
M14 Receipts / Fiscal
M15 Vehicles / Fuel
M16 Imports / Reconciliation
M17 Metabase / Analytics
M18 Custom Dashboard
M19 Natural Language Intelligence
M20 Alerts / Predictions
```

These do NOT block V0.1 release. No detailed M10–M20 planning is included in this forward plan.

---

## 9. Known Risks Deferred to Activation Review

- Exact M04 transaction/idempotency/audit interface signatures consumed by M05/M07.
- Actual VPS container names, network names, host UID/GID, filesystem ownership (deferred to Gate 0).
- Real Evolution/n8n instance configuration, secrets and connectivity (deferred to Gate 0 + M06 Activation Review).
- Whether `postgres-products` exists and is operational (deferred to Gate 0).
- Concrete backup container/runtime details (deferred to M09 Activation Review post-Gate 0).

---

## 10. Cross-Milestone Handoff Summary

| Handoff | What Must Be Preserved |
|---------|----------------------|
| M04 → M05 | Transaction create/query contracts, idempotency/audit availability, no messaging dependency |
| M05 → M06 | `POST /api/v1/inbox/messages` (`finance:ingest`), normalized ingestion envelope, reply/result contract, retry identity |
| M06 → M07 | Confirmation and target-version flow, WhatsApp transport remains thin |
| M07 → M08 | Refund/Void semantics required by Summary formulas |
| M08 → M09 | Summary must be available to validate restored environment |
| M09 → Gate C | Actual restore evidence, not documentation-only claim |

No currently visible M04 blocker has been identified. If a contradiction is discovered during Activation Review, it will be reported rather than silently editing accepted M04 planning.
