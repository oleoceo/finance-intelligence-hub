# PROJECT_STATE.md

# Finance Intelligence Hub

## Current Project State

**Documento:** `PROJECT_STATE.md`  
**Versão:** 1.0  
**Status:** ACTIVE — Operational State  
**Projeto:** Finance Intelligence Hub

---

# 1. Purpose

This file records the current operational state of the Finance Intelligence Hub.

It answers:

```text
Where are we?

What has already been completed?

What has NOT been executed yet?

Which gate is pending?

Which milestone is active?

What is the next allowed task?

Are there blockers?
```

This is not an architecture document.

Canonical architecture lives in:

```text
FINAL-FREEZE-DECISIONS.md

00-PROJECT-BLUEPRINT.md
01-MVP-REQUIREMENTS.md
02-DOMAIN-MODEL.md
03-ARCHITECTURE.md
04-DATABASE.md
05-API-CONTRACTS.md
06-WHATSAPP-FLOWS.md
07-SECURITY.md
08-BACKUP-RESTORE.md
09-ROADMAP-TESTS.md
```

---

# 2. Current overall status

M01 - Local Bootstrap: DONE.
M02 - Database Foundation: DONE; human accepted on 2026-10-20.
M02-T01, M02-T02, M02-T03, M02-T04 and M02-T05: DONE.
M03 - Master Data / Configuration: NEXT ALLOWED MILESTONE; implementation NOT STARTED.

Functional roadmap: M01 -> M02 -> M03. Gate 0 is a separate infrastructure prerequisite before live VPS/Lab/Production activity; it remains NOT EXECUTED and is not authorized by this closure.

Architecture and canonical documentation remain frozen. ADR-001/002 remain ACCEPTED. Established M01 Docker/CI evidence is preserved below. No commit or push is authorized.

---

# 3. Documentation Freeze

Status:

```text
PASS
```

Result:

```text
10 / 10 canonical documents
=
FROZEN — Baseline for Implementation
```

Authoritative ledger:

```text
FINAL-FREEZE-DECISIONS.md
Status: LOCKED
```

---

# 4. Final documentation validation

Last mechanical validation:

```text
PASS: 34
FAIL: 0

DOCUMENTATION FREEZE: PASS
```

No known blocking documentation inconsistencies remain.

---

# 5. Canonical documents

Current state:

```text
FINAL-FREEZE-DECISIONS.md
→ LOCKED

00-PROJECT-BLUEPRINT.md
→ FROZEN

01-MVP-REQUIREMENTS.md
→ FROZEN

02-DOMAIN-MODEL.md
→ FROZEN

03-ARCHITECTURE.md
→ FROZEN

04-DATABASE.md
→ FROZEN

05-API-CONTRACTS.md
→ FROZEN

06-WHATSAPP-FLOWS.md
→ FROZEN

07-SECURITY.md
→ FROZEN

08-BACKUP-RESTORE.md
→ FROZEN

09-ROADMAP-TESTS.md
→ FROZEN
```

---

# 6. Operational documents

Current:

```text
AGENTS.md
→ CREATED / ACTIVE

PROJECT_STATE.md
→ CREATED / ACTIVE

README.md
→ CREATED / ACTIVE

CHANGELOG.md
→ CREATED / ACTIVE

docs/adr/ADR-001 — Application Implementation Stack.md
→ CREATED / ACCEPTED

docs/adr/ADR-002 — UUID Strategy.md
→ CREATED / ACCEPTED

docs/adr/ADR-003 — VPS Internal Connectivity.md
→ CREATED / OPEN — Gate 0 evidence required
```

Operational documentation preparation is complete.

---

# 7. Implementation status

M01 local bootstrap: DONE. M02 database foundation: DONE and accepted.
All thirteen V0.1 tables, PK/FK/UNIQUE/CHECK constraints, indexes, exact NUMERIC(18,2) decimal-string persistence, ingestion/system structures and least-privilege roles are accepted. Audit is append-only for runtime; Outbox is empty after migrations. Both production guards remain effective.

Accepted chain: 001_technical_validation -> 002_master_data -> 003_ingestion_structure -> 004_transaction_structure -> 005_audit_idempotency_outbox. Migration 001 is unchanged. Empty bootstrap, exact history, no-pending rerun, isolated failure propagation and migration-role down/reapply are accepted.

Native-WSL evidence: integration 8 files / 74 PASS, no failures/skips/zero-test suites; unit 4 files / 35 PASS; install --frozen-lockfile, lint, format:check, build and typecheck PASS. See docs/tasks/completed/M02-OVERVIEW.md and docs/tasks/active/M02-CORRECTION-REPORT.md.

M02-T01 through M02-T05: DONE, moved to docs/tasks/completed/. M03 implementation remains NOT STARTED. No application behavior or live infrastructure was changed during closure.

---

# 8. Current milestone

M02 - Database Foundation: DONE, completed and accepted on 2026-10-20.
M03 - Master Data / Configuration: NEXT ALLOWED MILESTONE; implementation NOT STARTED.
This documentation/state closure does not start M03. Gate 0 remains a separate infrastructure prerequisite, NOT EXECUTED and not authorized by this closure.

---

# 9. M01 status

```text
M01 — Local Bootstrap
Status: ✅ DONE
```

All M01 tasks T01–T10 are DONE.

**Established M01 Baseline:**
- **Stack:** Node.js 24 LTS + TypeScript (ESM, strict) + Fastify + Kysely + TypeBox + pg + Pino + Vitest + pnpm 12.3.4
- **UUID Strategy:** UUIDv7 via `uuid` package (application-layer generation)
- **Runtime Environment:** Native Linux Node.js/pnpm inside Ubuntu 26.04 WSL2; Docker Engine v29.8.0 reused from existing installation
- **PostgreSQL:** postgres:18.6-bookworm via Docker Compose; Testcontainers 12.2.0 for isolated integration tests
- **Logging:** Structured JSON logs via Fastify/Pino with UUIDv7 `request_id` and validated `correlation_id` (X-Correlation-ID header); sensitive-value redaction configured
- **Health/Readiness:** `/health` → 200 (process alive, dependency-free); `/ready` → 200 (PostgreSQL ready) or 503 (not ready); bounded 2000ms readiness check; no secret exposure
- **Migrations:** Kysely native Migrator with deterministic discovery; migration apply/status/rollback verified against empty database
- **Tests:** Unit suite (4 files / 35 tests PASS); Integration suite (3 files / 11 tests PASS); Migration suite (7/7 PASS); production-database guardrail enforced (`finance_hub_prod` never used)
- **CI:** GitHub Actions remotely verified GREEN (Node 24, pnpm 12.3.4, frozen lockfile, lint/format/typecheck/build/unit/integration/migration all passing)
- **Docker Packaging:** Multi-stage build (4 stages: deps, build, prod-deps, runtime); non-root user (appuser UID/GID 999); production-only dependencies; SIGTERM graceful shutdown verified; /health and /ready functional in container
- **Security:** No secrets committed; no VPS deployment; no production database access; no frozen documentation modified

---

# 10. M01 allowed work before Gate 0

Allowed:

```text
create Git repository

create repository structure

select implementation stack

create local development environment

create local PostgreSQL setup

initialize migration tooling

initialize test tooling

initialize CI

create API skeleton

implement /health

implement /ready

configure structured logging

create .env.example

validate UUIDv7 support
```

---

# 11. M01 forbidden VPS work before Gate 0

Do not yet:

```text
deploy Finance Hub to VPS

create finance_hub_lab on VPS

create finance_hub_prod

provision postgres-products

change shared Docker networks

modify NPM

modify firewall

grant Codex operational VPS privileges
```

---

# 12. Gate 0 status

```text
Gate 0 — VPS Safety
Status: NOT EXECUTED
```

No assumption that Gate 0 has already passed.

---

# 13. Gate 0 purpose

Gate 0 must inspect the real VPS before Finance Hub operational changes.

Required inventory includes:

```text
CPU
RAM
disk

Docker
containers
volumes
networks

NPM
Portainer

n8n
Evolution
Redis
PostgreSQL services

UFW
Fail2Ban
SSH

backup posture

filesystem ownership / UID / GID

Codex privilege model
```

---

# 14. `postgres-products` status

Canonical intended path:

```text
/opt/apps/apps/databases/postgres-products
```

Current operational state:

```text
UNKNOWN UNTIL GATE 0
```

Do not assume:

```text
exists
running
healthy
already configured
```

---

# 15. If `postgres-products` exists

Gate 0 must validate:

```text
service health

persistent volume

network membership

no public PostgreSQL port

credentials/configuration

backup posture
```

Only then may Finance Hub use it.

---

# 16. If `postgres-products` does not exist

Required:

```text
explicit infrastructure task
```

Example:

```text
INFRA-T01
Provision postgres-products
```

This requires explicit approval.

It is not part of an ordinary application feature task.

---

# 17. Planned Finance databases

After infrastructure is approved and available:

```text
finance_hub_lab

finance_hub_prod
```

---

# 18. Test database

Local/CI tests should use:

```text
ephemeral PostgreSQL
```

through mechanisms such as:

```text
Testcontainers
Docker Compose development PostgreSQL
temporary PostgreSQL container
```

Never use:

```text
finance_hub_prod
```

for automated tests.

---

# 19. Shared Redis

Expected shared service:

```text
redis-main
```

Namespace:

```text
finance-hub:
```

But Redis is not required for basic synchronous financial CRUD unless implementation actually needs it.

---

# 20. Network state

Preferred internal application network:

```text
apps-backend
```

However:

```text
actual n8n connectivity
=
UNKNOWN UNTIL GATE 0
```

Do not modify network membership based only on documentation assumptions.

---

# 21. Finance Core architectural state

Frozen requirement:

```text
Finance API
+
Finance Core
+
PostgreSQL
```

must be sufficient for core financial functionality.

No implementation may make basic financial CRUD depend on:

```text
WhatsApp
Evolution
n8n
Redis
Firefly
Metabase
AI
Google Drive
```

---

# 22. Frozen financial model

Transaction types:

```text
expense
income
transfer
```

Statuses:

```text
posted
voided
```

---

# 23. Refund model

Canonical:

```text
Refund
=
Transaction.type = income
+
refund_of_transaction_id = original Expense
```

Refund is not a Transaction type.

---

# 24. Financial time model

V0.1 uses:

```text
transaction_date
```

No separate financial time-of-day field.

Technical timestamps remain valid.

---

# 25. Money model

Canonical persistence:

```text
NUMERIC(18,2)
```

API:

```text
decimal strings
```

No floating-point financial values.

---

# 26. Currency model

V0.1:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

No FX.

No cross-Book Transfer.

---

# 27. API security state

Frozen scopes:

```text
finance:ingest
finance:admin
```

n8n normal credential:

```text
finance:ingest
```

---

# 28. Inbox state

Canonical technical identity:

```text
source
+
source_instance
+
source_message_id
```

Authorization must occur before Finance Inbox raw content persistence.

---

# 29. Confirmation state

Canonical statuses:

```text
pending
confirmed
cancelled
expired
```

Default TTL:

```text
15 minutes
```

---

# 30. API idempotency state

Required for:

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

Canonical persistence:

```text
PostgreSQL
```

States:

```text
in_progress
completed
```

---

# 31. Backup state

Architecture is defined.

Operational backup implementation:

```text
NOT IMPLEMENTED YET
```

Future Production baseline:

```text
daily

RPO <= 24h

14 daily
8 weekly
12 monthly
```

---

# 32. Restore state

Restore architecture/runbook requirements are defined.

Actual Finance Hub restore test:

```text
NOT EXECUTED
```

This is expected at current project phase.

---

# 33. Real Data Ready

Current state:

```text
NO
```

Reason:

```text
Gate C has not been executed.
```

Real financial data must not be considered Production-ready before:

```text
Gate C PASS
+
successful isolated restore
```

---

# 34. Gate status

```text
Documentation Freeze
✅ PASS

Gate 0 — VPS Safety
⬜ NOT EXECUTED

Gate A — Core Independence
⬜ NOT EXECUTED

Gate B — Financial Integrity
⬜ NOT EXECUTED

Gate C — Real Data Ready
⬜ NOT EXECUTED
```

---

# 35. Milestone status

```text
M01 Local Bootstrap
✅ DONE

M02 Database Foundation
DONE

M03 Master Data / Configuration
NEXT ALLOWED MILESTONE - implementation NOT STARTED

M04 Transaction Core
⬜ NOT STARTED

M05 Inbox / Parser / Confirmation
⬜ NOT STARTED

M06 WhatsApp Integration
⬜ NOT STARTED

M07 Correction / Void / Refund
⬜ NOT STARTED

M08 Reports / Export / Operations
⬜ NOT STARTED

M09 Backup / Restore
⬜ NOT STARTED
```

---

# 36. Future milestones

Not started and not part of V0.1 implementation:

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

---

# 37. Current blockers

No demonstrated frozen-architecture blocker or unresolved M02 acceptance failure. Human review accepted M02 on 2026-10-20.
The prior failed verification and correction rationale remain recorded as history in the accepted evidence report.
VPS state remains unknown. Gate 0 is required before live infrastructure activity, is NOT EXECUTED and is not authorized by this closure.

---

# 38. Current risks

Current risks are primarily operational, not architectural:

```text
actual VPS state not yet inspected

postgres-products existence unknown

n8n apps-backend membership unknown

actual backup posture unknown

Codex VPS privilege model not yet configured
```

These belong to Gate 0.

---

# 39. Current allowed next actions

Functional roadmap progression: M01 -> M02 -> M03.
M03 - Master Data / Configuration is the NEXT ALLOWED MILESTONE. Its implementation is NOT STARTED; this closure authorizes no implementation work.
Gate 0 is separate from functional roadmap progression and is not authorized by this closure. No commit or push.

---

# 40. Current forbidden next actions

Do not yet:

```text
start M02 on VPS

create Finance Production DB

use real financial data

deploy Finance Hub Production

change shared infrastructure casually

give agent unrestricted VPS/Docker access
```

---

# 41. Operational document queue

```text
AGENTS.md
✅ completed

PROJECT_STATE.md
✅ completed

README.md
✅ completed

CHANGELOG.md
✅ completed

ADR-001
✅ created

ADR-002
✅ created

ADR-003
✅ created
```

No additional pre-implementation architecture document is required before M01.

---

# 42. Initial ADR status

Initial ADRs are already created:

```text
ADR-001
Application implementation stack
Status: ACCEPTED

ADR-002
UUID implementation choice
Status: ACCEPTED

ADR-003
VPS internal connectivity decision
Status: OPEN — Gate 0 evidence required
```

ADR-003 must remain open until Gate 0 provides real VPS evidence.

---

# 43. Implementation stack status

Established M01 stack: Node.js 24.22.0, pnpm 12.3.4, TypeScript ESM/strict, Fastify, Kysely (packages/database ownership), pg, Pino and Vitest. No dependency upgrades in this correction.

---

# 44. UUID status

ADR-002 ACCEPTED: application-generated UUIDv7 using uuid.v7(); PostgreSQL UUID persistence. Synthetic schema fixtures include a UUIDv7 round trip. No UUID strategy change.

---

# 45. Git repository status

```text
INITIALIZED
```

Observed baseline in the validated project archive:

```text
branch: main

baseline commit:
chore: establish project documentation baseline

local main:
96eeae64bfab666bab08d8ffd3472727acaa32aa

origin/main:
96eeae64bfab666bab08d8ffd3472727acaa32aa
```

This indicates the local `main` and recorded `origin/main` reference are aligned at the documentation-baseline commit.

Before M01 implementation, verify the configured remote with:

```text
git remote -v
```

Baseline tag still to create:

```text
docs-freeze-v0.1
```

---

# 46. CI status

Existing M01 CI configuration retained. Historical M01 remote GREEN evidence is preserved in section 9.
No remote CI run or publication was performed for the uncommitted M02 correction; native-WSL results govern current evidence.

---

# 47. Environment status

Local/test: native Ubuntu WSL2, Node 24.22.0, pnpm 12.3.4, Docker Engine 29.8.0, Testcontainers 12.2.0, postgres:18.6-bookworm.
Lab/Production: not accessed or deployed by this task. Gate 0 not executed.

---

# 48. Application directories

Final repository structure will be selected/created during M01 according to frozen architecture.

Do not invent unnecessary microservices.

Initial architecture:

```text
MODULAR MONOLITH
```

---

# 49. Worker status

```text
NOT ACTIVE
```

A worker may be scaffolded if useful, but a separate runtime should only be activated when real asynchronous work exists.

---

# 50. Firefly status

```text
OUTSIDE V0.1
NOT IMPLEMENTED
```

---

# 51. Metabase status

```text
FUTURE
NOT IMPLEMENTED
```

---

# 52. AI status

AI is:

```text
optional fallback
```

No AI provider is required to begin M01–M04.

---

# 53. WhatsApp infrastructure

Existing external components intended for later integration:

```text
Evolution API
n8n
```

Finance-specific integration work begins later under:

```text
M05 / M06
```

Do not prematurely implement Finance business logic in n8n.

---

# 54. State update rule

Update this document after every completed implementation task.

At minimum update:

```text
Current milestone

Completed tasks

Gate status

Tests executed

Environment status

Known issues

Current blockers

Next allowed task
```

---

# 55. Task completion record format

Use a compact record:

```text
TASK:
M04-T02

STATUS:
DONE

SUMMARY:
Implemented Expense use case.

TESTS:
unit: PASS
integration: PASS

MIGRATION:
none

KNOWN ISSUES:
none

NEXT:
M04-T03
```

---

# 56. Do not turn PROJECT_STATE into a diary

Do not append unlimited historical logs.

This document describes:

```text
current state
```

not complete history.

History belongs to:

```text
Git
CHANGELOG
ADRs
issue/task system
```

---

# 57. Replace stale information

When project state changes:

```text
update the current value
```

instead of keeping multiple contradictory state declarations.

---

# 58. Example after M01

Future state may become:

```text
M01
✅ PASS

local API
✅

local PostgreSQL
✅

CI
✅

Gate 0
⬜ pending

NEXT
Gate 0 + M02 preparation
```

---

# 59. Example after Gate 0

If `postgres-products` exists and is valid:

```text
Gate 0
✅ PASS

postgres-products
✅ operational

finance_hub_lab
⬜ create during M02
```

If absent:

```text
Gate 0
✅ PASS

postgres-products
❌ absent

BLOCKER BEFORE VPS M02:
INFRA-T01 Provision postgres-products
```

---

# 60. Current next task

M03 - Master Data / Configuration is the NEXT ALLOWED MILESTONE; implementation NOT STARTED.
M02 and M02-T01 through M02-T05 are DONE and accepted. Completed task records and milestone overview are in docs/tasks/completed/.
Gate 0 remains NOT EXECUTED, a separate prerequisite before live VPS/Lab/Production activity, and is not authorized by this closure.

---

# 61. Recommended M01 task sequence

Provisional decomposition:

```text
M01-T01
Repository and workspace bootstrap

M01-T02
Runtime / framework baseline

M01-T03
Local PostgreSQL development environment

M01-T04
Configuration and environment validation

M01-T05
Logging / request correlation

M01-T06
Health / readiness

M01-T07
Migration tooling baseline

M01-T08
Test infrastructure

M01-T09
CI baseline

M01-T10
Lab-ready Docker packaging
```

Exact decomposition may be adjusted without reopening architecture if acceptance criteria remain unchanged.

---

# 62. Final current-state summary

```text
Architecture
✅ FROZEN

Documentation
✅ FROZEN

AGENTS.md
✅ ACTIVE

PROJECT_STATE.md
✅ ACTIVE

README.md
✅ ACTIVE

CHANGELOG.md
✅ ACTIVE

Initial ADRs
✅ CREATED

Git repository
✅ INITIALIZED

Documentation baseline commit
✅ PRESENT

Documentation baseline tag
⬜ PENDING

Implementation
M01 and M02 DONE; M03 NEXT ALLOWED MILESTONE, implementation NOT STARTED

Gate 0
⬜ NOT EXECUTED

M01
✅ DONE

M02 Database Foundation
DONE

Real Data Ready
❌ NO

Known architecture blockers
NONE
```

---

# 63. Next action

Documentation/state closure is complete. M02 is DONE. M03 is the NEXT ALLOWED MILESTONE, implementation NOT STARTED. Stop without starting M03, executing Gate 0, committing or pushing.

---
