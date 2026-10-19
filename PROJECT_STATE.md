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

```text
PROJECT PHASE
=
M01 — Local Bootstrap ALL TASKS DONE (awaiting milestone closure)
```

Architecture and canonical documentation are frozen.

All M01 implementation tasks T01–T10 are DONE.
ADR-001 and ADR-002 are ACCEPTED.
Docker packaging baseline established (M01-T10).

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

```text
M01-T01 (stack decision)
→ DONE

Application code
→ NOT STARTED

Database migrations
→ NOT STARTED

Finance API
→ NOT STARTED

Finance Core
→ NOT STARTED

WhatsApp Finance workflow
→ NOT STARTED

Backup automation
→ NOT STARTED

Docker/container runtime
→ PENDING (required before PostgreSQL integration work)
```

---

# 8. Current milestone

Current roadmap position:

```text
DOCUMENTATION FREEZE
        ✅
        ↓
OPERATIONAL DOCUMENTS
        ✅
        ↓
M01 — Local Bootstrap
        ← NEXT IMPLEMENTATION MILESTONE
        ↓
Gate 0 / VPS Safety
```

Gate 0 may be executed in parallel with permitted local M01 work when VPS inspection intentionally begins.

---

# 9. M01 status

```text
M01 — Local Bootstrap
Status: IN PROGRESS
```

M01-T01 (stack decision) is DONE.
M01-T02 (workspace baseline) is DONE.
M01-T03 (local PostgreSQL/container runtime preflight) is DONE.
M01-T04 (WSL2 development runtime and local PostgreSQL provisioning) is DONE.
M01-T05 (logging/request correlation baseline) is DONE.
M01-T06 (health/readiness baseline) is DONE.
M01-T07 (migration tooling baseline) is DONE.
M01-T08 (test infrastructure) is DONE.
M01-T09 (CI Baseline) is DONE.
Selected local container runtime: existing Docker Engine inside Ubuntu 26.04 WSL2.
Local PostgreSQL baseline: postgres:18.6-bookworm.
Testcontainers integration: validated.
Structured Fastify/Pino logging baseline established with UUIDv7 request correlation.
Health/Readiness endpoints implemented with bounded PostgreSQL readiness check (packages/database).
Migration tooling baseline established with Kysely native Migrator, deterministic source/compiled discovery, and verified failure propagation.
Standardized test infrastructure established with explicit Vitest unit configuration, deterministic discovery excluding dist/integration paths, and Vitest 5-compatible single-fork integration configuration.
GitHub Actions CI baseline established and remotely verified GREEN: Node 24, pnpm 12.3.4, frozen lockfile, lint/format/typecheck/build/unit/integration all passing; Testcontainers 12.2.0 with PostgreSQL 18.6-bookworm on Ubuntu runner; build-before-typecheck ordering; integration hookTimeout 120_000 for cold-start tolerance; production database guardrail preserved.
Next task: M01-T10 (Lab-Ready Docker Packaging).
M01 remains IN PROGRESS.

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
🔄 IN PROGRESS (M01-T01 DONE, M01-T02 DONE, M01-T03 NEXT)

M02 Database Foundation
⬜ NOT STARTED

M03 Master Data / Configuration
⬜ NOT STARTED

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

Known architectural blockers:

```text
NONE
```

Known implementation blockers:

```text
NONE
```

Known VPS operational unknowns:

```text
Gate 0 has not been executed.
```

This is not yet a blocker because M01 local work is allowed.

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

Allowed immediately:

```text
verify Git remote configuration

create the documentation-baseline Git tag

begin M01 locally

prepare Gate 0 read-only inspection
```

Gate 0 may be executed in parallel when VPS access is intentionally started.

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

```text
NOT YET SELECTED / VALIDATED
```

The stack should be decided during M01.

Selection should evaluate:

```text
PostgreSQL support

database transactions

migrations

strict validation

testing

structured logging

Docker deployment

maintainability
```

---

# 44. UUID status

Frozen preference:

```text
UUIDv7
```

Final implementation decision:

```text
PENDING M01 VALIDATION
```

Fallback:

```text
UUIDv4
```

only if the selected runtime/library lacks reliable maintained UUIDv7 support.

If fallback is required:

```text
ADR required
```

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

```text
NOT CONFIGURED
```

M01 target:

```text
lint
typecheck where applicable
unit tests
integration tests
```

---

# 47. Environment status

```text
development
→ NOT CREATED

test
→ NOT CREATED

lab
→ NOT DEPLOYED

production
→ NOT DEPLOYED
```

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

```text
M01-T03 — Local PostgreSQL Development Environment
```

M01-T01 (stack decision) is complete.
M01-T02 (workspace baseline) is complete.
M01-T03 will set up local PostgreSQL for development and testing, pending Docker/container runtime availability.

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
⬜ NOT STARTED

Gate 0
⬜ NOT EXECUTED

M01
⬜ NOT STARTED

Real Data Ready
❌ NO

Known architecture blockers
NONE
```

---

# 63. Next action

Before the first implementation commit:

```text
verify Git remote
↓
create tag docs-freeze-v0.1
↓
begin M01-T01
```

Gate 0 may be prepared/executed in parallel when VPS operational inspection begins.
