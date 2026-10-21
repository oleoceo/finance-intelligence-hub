# Activation Review Template

**Type:** Reusable Process Contract
**Applies to:** All milestones transitioning from PLANNED → ACTIVE

> This template defines the mandatory review performed immediately before
> promoting a forward plan to execution-ready ACTIVE status.

---

## 1. Milestone Identification

- **Milestone:** [e.g., M05, M06, Gate 0]
- **Forward Plan Document:** `docs/tasks/planned/<NAME>.md`
- **Authoritative Current Main SHA:** `<exact-sha>`
- **Date:** YYYY-MM-DD
- **Reviewer:** [human approver]

---

## 2. Upstream Completion Verification

Confirm that all prerequisite milestones/gates are actually completed:

| Prerequisite | Status | Evidence (commit/CI/artifact) |
|-------------|--------|-------------------------------|
| [e.g., M04 implementation] | ✅ DONE / ❌ NOT DONE | [SHA, CI run] |
| [e.g., Gate A] | ✅ PASS / ❌ NOT EXECUTED | [artifact link] |

**Do not proceed if any prerequisite is incomplete.**

---

## 3. Original Forward-Plan Assumptions

List the key assumptions made in the forward plan that may be affected by intervening implementation:

1. [Assumption about interface shape]
2. [Assumption about available infrastructure]
3. [Assumption about dependency behavior]
4. ...

---

## 4. Current Implementation Evidence

Inspect the actual current `main` and document what now exists:

- Available interfaces/signatures relevant to this milestone
- Completed migrations and schema state
- Existing test infrastructure and patterns
- Infrastructure state (if Gate 0 completed)
- Any deviations from forward-plan expectations

---

## 5. Assumption Delta Table

For each assumption from §3:

| # | Assumption | Status | Action |
|---|-----------|--------|--------|
| 1 | [assumption text] | ✅ Still Valid / ⚠️ Stale / 🔄 Replaced / 🚫 Blocker | [no change / update delta / cite replacement / STOP] |

### Status Definitions
- **Still Valid**: Assumption matches current reality. No change needed.
- **Stale**: Assumption was reasonable when written but is now outdated by accepted implementation. Update the active task contract to reflect reality.
- **Replaced by Accepted Implementation**: The assumption described something not yet built; it now exists with concrete shape. Reference the actual implementation.
- **Blocker**: Assumption contradicts frozen architecture or reveals an impossible milestone. **STOP.** Report to human. Do not silently adjust.

---

## 6. Exact Interfaces/Surfaces Now Available

Document the concrete interfaces this milestone will consume or extend:

- [Interface name, signature, location]
- [Port/adapter contract]
- [API endpoint shape]
- [Database table/column state]

Mark anything still uncertain as `ACTIVATION REVIEW REQUIRED`.

---

## 7. Final Execution Task Decomposition

Refine the provisional task decomposition from the forward plan into execution-ready tasks:

| Task ID | Goal | Allowed Paths | Dependencies |
|---------|------|--------------|-------------|
| [e.g., M05-P01] | [concise goal] | [allowed source/test paths] | [prior tasks] |

Each task must define:
- Exact allowed paths
- Relevant frozen documents
- Acceptance criteria
- Required tests
- Forbidden scope

---

## 8. Required Tests Per Task

| Task | Unit Tests | Integration Tests | Specific Scenarios |
|------|-----------|-------------------|-------------------|
| [Task ID] | [categories] | [categories] | [critical scenarios] |

---

## 9. Concurrency / Security / Financial Guardrails

Identify guardrails specific to this milestone:

- PostgreSQL locking protocol applicability
- Idempotency requirements
- Authorization boundary enforcement
- Money precision invariants
- Optimistic locking surfaces
- Secret handling requirements

---

## 10. Forbidden Scope

Explicitly list what this milestone MUST NOT implement:

- [Future milestone feature]
- [Architecture change]
- [Infrastructure modification not authorized]
- [Frozen decision override]

---

## 11. Migration / Dependency Impact

- New migrations required: YES/NO
- If YES: list migration files and describe schema changes
- New dependencies required: YES/NO
- If YES: justify against existing approved dependencies
- Lockfile impact: describe expected scope

---

## 12. Gate Dependencies

| Gate | Required Before This Milestone? | Status |
|------|-------------------------------|--------|
| Gate 0 | YES/NO | PASS/NOT EXECUTED/N/A |
| Gate A | YES/NO | PASS/NOT EXECUTED/N/A |
| Gate B | YES/NO | PASS/NOT EXECUTED/N/A |
| Gate C | YES/NO | PASS/NOT EXECUTED/N/A |

---

## 13. Human Approval

- [ ] Forward plan reviewed
- [ ] Assumption delta accepted
- [ ] Task decomposition approved
- [ ] Forbidden scope acknowledged
- [ ] Gate dependencies confirmed
- [ ] **Implementation authorized: YES/NO**

**Approver:** _______________
**Date:** YYYY-MM-DD

---

## 14. Promotion

Upon approval:

1. Copy/move milestone planning from `docs/tasks/planned/` to `docs/tasks/active/`
2. Create/finalize individual task contracts under `docs/tasks/active/`
3. Update `PROJECT_STATE.md` to reflect ACTIVE status
4. Record Activation Review SHA and date in milestone overview

**The milestone is now ACTIVE and implementation may proceed upon explicit authorization.**

---

## Rules

- Activation Review must NOT reopen frozen architecture absent a true blocker (§5 Blocker status).
- If the forward plan still fits, do not rewrite it unnecessarily. Apply only the delta needed to make execution contracts accurate.
- Do not weaken any existing human approval boundary, CI requirement, exact-head verification, coverage regression protection, self-healing discipline, or merge authorization rule.
- Task-level implementation workflow remains unchanged after activation (per `.agents/skills/finance-hub-task-runner/SKILL.md`).