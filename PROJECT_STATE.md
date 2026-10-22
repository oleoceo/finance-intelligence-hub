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
M03 - Master Data / Configuration: DONE; M03-T01 DONE; M03-T02 DONE; M03-T03 DONE; M03-T04 DONE; M03-T05 DONE and integrated via PR #3.

Functional roadmap completed through M03. M04 planning was accepted and integrated at `d369261aceb8c91a2ee3449c64be7d7b24af11ab` (post-merge CI `39661571275` = SUCCESS). M04 Activation Review PASS against current main `ead8f7380ed214cd3ce680fb87c6391cadd45011`. M04 is ACTIVE. M04-T01 is human accepted and DONE on PR #7; accepted implementation head `d80672507b6fd36df9a7035af90e3cccdab44239`; exact-head GitHub Actions run `39691263503` attempt 2 = SUCCESS (unit 23 files / 664 tests; PostgreSQL integration 15 files / 236 tests). PR #7 was squash-merged to `main` as `9dabedefd9b58ef8090a1e0e8d88e63d9fdbd323`; post-merge GitHub Actions run `39693573292` = SUCCESS. M04-T02 is DONE / integrated via PR #9; squash commit `ad041e8ed31846794c6263596b9cf1da173d4f52`; post-merge CI `39705765258` = SUCCESS. M04-T03 is DONE / integrated via PR #10; exact-head CI `39773475190` = SUCCESS; squash `51b3c97880d154c6543a3c753ef6e7419ea1ea0d`; post-merge CI `39777604808` = SUCCESS; M04-T04 is DONE / integrated via PR #11; squash `5c4ef3971d411b4706265c452180185e34c84bef`; post-merge CI `39790495902` = SUCCESS; M04-T05 DONE / integrated; PR #12 MERGED as `815309db057489e402db8061a9ec9fd7bab92db0` (post-merge CI `39801330979` SUCCESS); M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. Gate A and Gate 0 are NOT EXECUTED.

Architecture and canonical documentation remain frozen. ADR-001/002 remain ACCEPTED. Established M01 Docker/CI evidence is preserved below. M03-T05 is human accepted, DONE and integrated. Accepted implementation head `da0a6ced16e8ce5831e144d498e841dc2a6a0ead`; GitHub Actions run `39640634314` = SUCCESS. PR #3 was squash-merged to `main` as `f94f965d448160bdf54d8a86b14d2eb6411d70ad`; post-merge GitHub Actions run `39645547149` = SUCCESS. T04 remains human accepted and DONE. V0.1 Forward Planning was accepted and integrated at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`; post-merge CI `39672168104` = SUCCESS.

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

M02-T01 through M02-T05: DONE, moved to docs/tasks/completed/. M03 is DONE; M03-T01 is DONE and human accepted. Accepted evidence: 32 new unit tests, 67 total unit tests PASS; PostgreSQL regression: 8 integration files / 74 tests PASS, zero failures. No application behavior or live infrastructure was changed during closure.

M03-T02: DONE, functionally approved by human review on 2026-10-20; record moved to docs/tasks/completed/M03-T02.md. Accepted evidence: unit 9 files / 102 tests PASS; integration 9 files / 100 tests PASS; T02-specific integration 26 tests PASS; critical concurrency/race scenarios PASS; build, typecheck, lint and T02 formatting PASS. Final hygiene: pnpm-lock.yaml restored from HEAD with only three importer dependency changes (11 insertions / 1 deletion); native-WSL Node 24.22.0 / pnpm 12.3.4 frozen install and package dependency consistency PASS. No source/test changes during cleanup, no migration/security change, no remaining T02 blocker. M03-T03, M03-T04 and M03-T05 are human accepted and DONE.

---

# 8. Current milestone

M02 - Database Foundation: DONE, completed and accepted on 2026-10-20.
M03 - Master Data / Configuration: DONE; M03-T01 DONE; M03-T02 DONE; M03-T03 DONE; M03-T04 DONE; M03-T05 DONE and integrated via PR #3.
M03-T01 through M03-T05 are accepted; completed records and the [M03 overview](docs/tasks/completed/M03-OVERVIEW.md) are in docs/tasks/completed/. Draft PR #2 was squash-merged to main as fd5aa49ab129bcdb87f18a0c58025bc1de6a739b; post-merge main CI 39585567173 = SUCCESS. PR #3 was squash-merged to `main` as `f94f965d448160bdf54d8a86b14d2eb6411d70ad`; post-merge GitHub Actions run `39645547149` = SUCCESS. M04 planning was accepted and squash-merged to `main` as `d369261aceb8c91a2ee3449c64be7d7b24af11ab`; post-merge CI `39661571275` = SUCCESS. V0.1 Forward Planning was accepted and integrated at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`; post-merge CI `39672168104` = SUCCESS. M04 Activation Review was accepted and integrated via PR #6 at `1c7e16d45fa03df8cd2b54c28100820af8d08142`; post-merge CI `39675385219` = SUCCESS. M04 is ACTIVE / execution-ready. M04-T01 is human accepted and DONE; accepted head `d80672507b6fd36df9a7035af90e3cccdab44239`, GitHub Actions run `39691263503` attempt 2 = SUCCESS. PR #7 was squash-merged to `main` as `9dabedefd9b58ef8090a1e0e8d88e63d9fdbd323`; post-merge CI `39693573292` = SUCCESS. M04-T02 is DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 is DONE / integrated via PR #10; exact-head CI `39773475190` = SUCCESS; squash `51b3c97880d154c6543a3c753ef6e7419ea1ea0d`; post-merge CI `39777604808` = SUCCESS; M04-T04 is DONE / integrated via PR #11; exact-head CI `39788951807` = SUCCESS; squash `5c4ef3971d411b4706265c452180185e34c84bef`; post-merge CI `39790495902` = SUCCESS; M04-T05 is DONE / integrated via PR #12; squash `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. Gate A and Gate 0 remain NOT EXECUTED.

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
DONE - M03-T01 DONE; M03-T02 DONE; M03-T03 DONE; M03-T04 DONE; M03-T05 DONE and integrated via PR #3

M04 Transaction Core
ACTIVE — M04-T01 DONE / human accepted; M04-T02 DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 DONE / integrated; PR #10 MERGED as `51b3c97880d154c6543a3c753ef6e7419ea1ea0d` (post-merge CI `39777604808` SUCCESS); M04-T04 DONE / integrated; PR #11 MERGED as `5c4ef3971d411b4706265c452180185e34c84bef` (post-merge CI `39790495902` SUCCESS); M04-T05 DONE / integrated; PR #12 MERGED as `815309db057489e402db8061a9ec9fd7bab92db0` (post-merge CI `39801330979` SUCCESS); M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED; Gate A NOT EXECUTED; Gate 0 NOT EXECUTED

V0.1 Forward Planning
ACCEPTED / INTEGRATED — merge `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`; post-merge CI `39672168104` = SUCCESS. M05–M09 forward plans remain PLANNED, NOT ACTIVE and implementation NOT AUTHORIZED; each requires its own Activation Review.

M05 Inbox / Parser / Confirmation
⬜ PLANNED (forward plan accepted; NOT ACTIVE; implementation NOT AUTHORIZED)

M06 WhatsApp Integration
⬜ PLANNED (forward plan accepted; NOT ACTIVE; implementation NOT AUTHORIZED)

M07 Correction / Void / Refund
⬜ PLANNED (forward plan accepted; NOT ACTIVE; implementation NOT AUTHORIZED)

M08 Reports / Export / Operations
⬜ PLANNED (forward plan accepted; NOT ACTIVE; implementation NOT AUTHORIZED)

M09 Backup / Restore
⬜ PLANNED (forward plan accepted; NOT ACTIVE; implementation NOT AUTHORIZED)
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

M01, M02 and M03 are DONE. M04 is ACTIVE after Activation Review PASS. M04-T01 is human accepted and DONE; its completed record is `docs/tasks/completed/M04-T01.md`. Accepted head `d80672507b6fd36df9a7035af90e3cccdab44239`; GitHub Actions run `39691263503` attempt 2 = SUCCESS. PR #7 is integrated via squash commit `9dabedefd9b58ef8090a1e0e8d88e63d9fdbd323`; post-merge CI `39693573292` = SUCCESS. M04-T02 is DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 is DONE / integrated via PR #10; exact-head CI `39773475190` = SUCCESS; squash `51b3c97880d154c6543a3c753ef6e7419ea1ea0d`; post-merge CI `39777604808` = SUCCESS; M04-T04 is DONE / integrated via PR #11; exact-head CI `39788951807` = SUCCESS; squash `5c4ef3971d411b4706265c452180185e34c84bef`; post-merge CI `39790495902` = SUCCESS; M04-T05 is DONE / integrated via PR #12; squash `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. V0.1 Forward Planning is ACCEPTED / INTEGRATED at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9` (CI `39672168104` SUCCESS). M05–M09 remain PLANNED, NOT ACTIVE and NOT AUTHORIZED. Gate 0, Gate A, Gate B and Gate C are NOT EXECUTED. Current next action: review M04-T08 implementation; do not execute any Gate.

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

Branch baseline / externally reviewed merge-base: `ead8f7380ed214cd3ce680fb87c6391cadd45011` (M04 Activation Review accepted/integrated; post-merge CI `39675385219` = SUCCESS).

Documentation baseline tag `docs-freeze-v0.1`: PRESENT; do not modify it.

---

# 46. CI status

M03-T04 is human accepted and DONE. Accepted head: `681a51b37d7ea0e917a6f2b401e8e847a4bbcb53`; final accepted GitHub Actions [run 39527608979](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/39527608979): full CI GREEN. Unit 14 files / 215 tests PASS (T04-specific: 69 — ClassificationRule domain 20, AuthorizedSender domain 16, Rule/Sender application use cases 33); PostgreSQL integration 14 files / 199 tests PASS (T04-specific: 63 — Rule configuration 24, Sender configuration 11, Rule concurrency 17, Sender concurrency 11). Build, typecheck, lint and formatting PASS.

Accepted T04 behavior: ClassificationRule create/get/list/update configuration, manual source and active lifecycle, integer priority including negative values, raw + normalized pattern handling, at-least-one-target invariant, active/existence validation for Book/Account/Category/Merchant, Account/Category derived Book validation, full Book-context compatibility, stable priority ASC / created_at ASC / id ASC ordering, locked PATCH merge, deterministic total lock ordering, bounded whole-transaction rediscovery, canonical KyselyTransactionPort T04 wiring, AuthorizedSender create/get/list/update configuration, sender_reference stored unchanged, default Book/Account compatibility and active validation, inactive Sender retaining defaults/archive protection, explicit default clearing, SenderDefaultReferenceReader reuse, independent PostgreSQL backend barrier coverage, Rule configuration/archive races for Book/Account/Category/Merchant, Sender assignment/archive/removal races for Book/Account, preserved Rule references after target archive, no runtime matching/application. No migration or security impact. T04 acceptance is preserved.

M03-T05 is human accepted and DONE. Accepted implementation head `da0a6ced16e8ce5831e144d498e841dc2a6a0ead`; GitHub Actions [run 39640634314](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/39640634314) = SUCCESS. Final M03 suite: unit 17 files / 504 tests PASS; PostgreSQL integration 15 files / 236 tests PASS. T05 added 289 unit and 37 integration tests relative to accepted T04; transport configuration 217 PASS and API/PostgreSQL configuration 37 PASS. Frozen install, lint, format:check, build and typecheck passed. Remaining T05 issues: none. See [completed T05](docs/tasks/completed/M03-T05.md) and [completed M03 overview](docs/tasks/completed/M03-OVERVIEW.md).

M04-T01 is human accepted and DONE. Accepted implementation head `d80672507b6fd36df9a7035af90e3cccdab44239`; GitHub Actions [run 39691263503](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/39691263503), attempt 2 = SUCCESS. Final accepted suite: unit 23 files / 664 tests PASS; PostgreSQL integration 15 files / 236 tests PASS. Frozen install, lint, format:check, build and typecheck passed. Attempt 1 hit the unchanged timing-sensitive M03 Book-lock observation (`wait_event_type = null`); the exact same head passed the full suite on attempt 2. Documentation-only closure commit `ee73c0da9123317958a1856fdddf9148b6167047` was independently validated by GitHub Actions run `39692770704` = SUCCESS. No Database/API/migration/frozen/manifests/lockfile changes were part of T01. See [completed T01](docs/tasks/completed/M04-T01.md).

M04-T02 is DONE after human-delegated technical acceptance. Accepted implementation head `ac76821b69cb9364f93eb4ace0a751290204501c`; exact-head GitHub Actions [run 39704277163](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/39704277163) = SUCCESS. Unit: 25 files / 704 tests PASS; PostgreSQL integration: 16 files / 268 tests PASS; focused: 40 unit + 32 integration, including 14 deterministic two-backend PostgreSQL races PASS. Frozen install, lint, format:check, build and typecheck PASS. PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS). No migration, API, frozen docs, manifest/lockfile, provider artifact, VPS or Gate change. See [completed T02](docs/tasks/completed/M04-T02.md).

M04-T03 is DONE / integrated. Accepted implementation head `7fee927dfff7a28a8abd6ecd5e5fceab97fcb95b`; PR #10 MERGED as `51b3c97880d154c6543a3c753ef6e7419ea1ea0d` (post-merge CI `39777604808` SUCCESS); exact-head GitHub Actions run `39773475190` = SUCCESS. Unit 26 files / 741 tests PASS; PostgreSQL integration 17 files / 301 tests PASS; focused T03 37 unit / 33 integration, including 14 deterministic two-backend races. Existing T02 repository handles Income insert and T02 integration retains 32 tests. Frozen install, lint, format:check, build and typecheck PASS. M04-T04 is DONE / integrated via PR #11; exact-head CI `39788951807` = SUCCESS; squash `5c4ef3971d411b4706265c452180185e34c84bef`; post-merge CI `39790495902` = SUCCESS; M04-T05 is DONE / integrated via PR #12; squash `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED; Gates are NOT EXECUTED. See [completed T03](docs/tasks/completed/M04-T03.md).

M04-T04 is DONE / integrated. Accepted implementation head `693e817a3d500dac2a4bdf57bcd629f45d3d3ee7`; PR #11 MERGED as `5c4ef3971d411b4706265c452180185e34c84bef` (post-merge CI `39790495902` SUCCESS); exact-head GitHub Actions run `39788951807` = SUCCESS. Unit 27 files / 793 tests PASS; PostgreSQL integration 18 files / 334 tests PASS; focused T04 52 unit / 33 integration, including three structural CHECK probes, Transfer human-ref collision retry, independent-backend reverse Transfer overlap, and 16 configuration races. Both Transfer Accounts register FinancialUsage. No migration, API, frozen document, dependency manifest, lockfile, VPS, or Gate change. M04-T05 is DONE / integrated via PR #12; squash `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. See [completed T04](docs/tasks/completed/M04-T04.md).

M04-T05 is DONE / integrated. Accepted implementation head `f7aa2e3172b98525f1557c6ef689987530de52dc`; PR #12 MERGED as `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; exact-head GitHub Actions run `39799272165` = SUCCESS. Core owns the derived Transaction read model and input validation; Database provides read-only Get/List/Last queries. Unit 30 files / 827 tests PASS; PostgreSQL integration 19 files / 351 tests PASS; focused T05 34 unit / 17 integration PASS. No migration, API, frozen-document, dependency, lockfile, VPS, or Gate change. M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED; Gates remain NOT EXECUTED. See [completed T05](docs/tasks/completed/M04-T05.md).

M04-T06 is DONE / integrated. PR #13 MERGED as `6908ec30650ab9c8eca90a6909958d8adbb31f5d`; post-merge CI `39811484800` = SUCCESS. Accepted implementation head `805446a7d671d74ecb8cfaaa1a468f32dbe4334a`; exact-head GitHub Actions run `39806425868` = SUCCESS. PostgreSQL-canonical claim, completion and locked replay infrastructure is implemented. Unit 31 files / 856 tests PASS; PostgreSQL integration 20 files / 359 tests PASS; focused T06 48 unit / 8 integration PASS. No migration, API, frozen-document, manifest, lockfile, Redis, Audit implementation, VPS or Gate change. M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. See [completed T06](docs/tasks/completed/M04-T06.md).
M04-T07 is DONE / integrated. Accepted implementation head `125868a432678ad0e70944388254eddc9207bc1d`; PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); exact-head GitHub Actions run `39816403619` = SUCCESS. GenericCreateTransaction now composes idempotency claim, Expense/Income/Transfer execution, `TRANSACTION_CREATED` Audit and idempotency completion inside one outer PostgreSQL transaction. Unit 32 files / 866 tests PASS; PostgreSQL integration 21 files / 369 tests PASS; focused T07 10 unit / 10 integration PASS. No migration, API, frozen-document, dependency, lockfile, Redis, Outbox emission, VPS or Gate change. M04-T08 REVIEW REQUIRED. See [completed T07](docs/tasks/completed/M04-T07.md).

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
Review M04-T08 implementation; Gate A NOT EXECUTED.
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

M03 is DONE; M03-T01 DONE; M03-T02 DONE; M03-T03 DONE; M03-T04 DONE; M03-T05 DONE and integrated via PR #3.
M02 and M02-T01 through M02-T05 are DONE and accepted. Completed task records and milestone overview are in docs/tasks/completed/.
M03-T01 through M03-T05 are human accepted and recorded in docs/tasks/completed/ with the completed M03 overview. M04 planning was ACCEPTED and INTEGRATED at `d369261aceb8c91a2ee3449c64be7d7b24af11ab`; post-merge CI `39661571275` = SUCCESS. M04 Activation Review was ACCEPTED and INTEGRATED at `1c7e16d45fa03df8cd2b54c28100820af8d08142`; post-merge CI `39675385219` = SUCCESS. M04 is ACTIVE / execution-ready. M04-T01 is human accepted and DONE; M04-T02 is DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 is DONE / integrated via PR #10; exact-head CI `39773475190` = SUCCESS; squash `51b3c97880d154c6543a3c753ef6e7419ea1ea0d`; post-merge CI `39777604808` = SUCCESS; M04-T04 is DONE / integrated via PR #11; exact-head CI `39788951807` = SUCCESS; squash `5c4ef3971d411b4706265c452180185e34c84bef`; post-merge CI `39790495902` = SUCCESS; M04-T05 is DONE / integrated via PR #12; squash `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS; M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED.
Gate A, Gate 0, Gate B and Gate C remain NOT EXECUTED. V0.1 Forward Planning is ACCEPTED / INTEGRATED at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9` (CI `39672168104` SUCCESS). M05–M09 forward plans are accepted; implementation is NOT STARTED, NOT ACTIVE and NOT AUTHORIZED. M04-T02 is DONE / integrated; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS). M04-T03 is DONE / integrated via PR #10; exact-head CI `39773475190` = SUCCESS; squash `51b3c97880d154c6543a3c753ef6e7419ea1ea0d`; post-merge CI `39777604808` = SUCCESS; T08 REVIEW REQUIRED; do not execute any Gate.

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
✅ PRESENT

Implementation
M01, M02 and M03 DONE; M04 ACTIVE / execution-ready; M04-T01 DONE / human accepted; PR #7 integrated as `9dabedefd9b58ef8090a1e0e8d88e63d9fdbd323` (post-merge CI `39693573292` SUCCESS); M04-T02 DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 DONE / integrated; PR #10 MERGED as `51b3c97880d154c6543a3c753ef6e7419ea1ea0d` (post-merge CI `39777604808` SUCCESS); M04-T04 DONE / integrated; PR #11 MERGED as `5c4ef3971d411b4706265c452180185e34c84bef` (post-merge CI `39790495902` SUCCESS); M04-T05 DONE / integrated; PR #12 MERGED as `815309db057489e402db8061a9ec9fd7bab92db0` (post-merge CI `39801330979` SUCCESS); M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED; M05–M09 NOT STARTED / NOT ACTIVE / NOT AUTHORIZED

Gate 0
⬜ NOT EXECUTED

M01
✅ DONE

M02 Database Foundation
DONE

M04 Transaction Core
ACTIVE; M04-T01 DONE / human accepted; M04-T02 DONE / accepted; PR #9 MERGED as `ad041e8ed31846794c6263596b9cf1da173d4f52` (post-merge CI `39705765258` SUCCESS); M04-T03 DONE / integrated; M04-T04 DONE / integrated; PR #11 MERGED as `5c4ef3971d411b4706265c452180185e34c84bef` (post-merge CI `39790495902` SUCCESS); M04-T05 DONE / integrated; PR #12 MERGED as `815309db057489e402db8061a9ec9fd7bab92db0` (post-merge CI `39801330979` SUCCESS); M04-T06 DONE / integrated; PR #13 MERGED as 6908ec30650ab9c8eca90a6909958d8adbb31f5d (post-merge CI 39811484800 SUCCESS); M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED

V0.1 Forward Planning
ACCEPTED / INTEGRATED at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9`; post-merge CI `39672168104` = SUCCESS

Gate A / Gate B / Gate C
NOT EXECUTED

Real Data Ready
❌ NO

Known architecture blockers
NONE
```

---

# 63. Next action

M01, M02 and M03 are DONE. M04 is ACTIVE / execution-ready after Activation Review PASS, accepted/integrated at `1c7e16d45fa03df8cd2b54c28100820af8d08142` with CI `39675385219` SUCCESS. M04-T01 through M04-T06 are DONE / integrated. PR #12 merged as `815309db057489e402db8061a9ec9fd7bab92db0`; post-merge CI `39801330979` = SUCCESS. M04-T06 is DONE / integrated via PR #13 MERGED as `6908ec30650ab9c8eca90a6909958d8adbb31f5d`; post-merge CI `39811484800` = SUCCESS. T06 regression baseline: unit 31 files / 856 tests; PostgreSQL integration 20 files / 359 tests. M04-T07 DONE / integrated via PR #14 MERGED as d923eb4c11790c7e901d4faee67af05ffc27f165 (post-merge CI 39818569159 attempt 2 SUCCESS); M04-T08 REVIEW REQUIRED. V0.1 Forward Planning is ACCEPTED / INTEGRATED at `6cc94e14f4ad2b56e1bca65a8ba8f835902215e9` (CI `39672168104` SUCCESS). M05–M09 remain PLANNED, NOT ACTIVE and NOT AUTHORIZED. Gate 0, Gate A, Gate B and Gate C are NOT EXECUTED. Next: review M04-T08 implementation; do not execute any Gate.

---
