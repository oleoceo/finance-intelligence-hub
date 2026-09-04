# CHANGELOG.md

# Finance Intelligence Hub
## Changelog

All notable changes to the Finance Intelligence Hub will be documented in this file.

This project uses a milestone-oriented changelog.

The changelog records:

```text
releases
user-visible behavior
important financial-model changes
database/schema changes
security changes
important infrastructure changes
backup/recovery changes
```

It does not record every commit or implementation task.

For current project progress, use:

```text
PROJECT_STATE.md
```

For architectural decisions, use:

```text
ADRs
```

---

## [Unreleased]

### Project status

Current phase:

```text
PRE-IMPLEMENTATION
```

Canonical architecture:

```text
FROZEN — Baseline for Implementation
```

Application implementation:

```text
NOT STARTED
```

Current next milestone:

```text
M01 — Local Bootstrap
```

---

### Added

#### Canonical architecture documentation

Created and frozen:

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

#### Operational project-control documentation

Created:

```text
AGENTS.md

PROJECT_STATE.md

README.md

CHANGELOG.md
```

---

### Architecture

Frozen initial architecture:

```text
MODULAR MONOLITH
```

Canonical high-level flow:

```text
WhatsApp
↓
Evolution API
↓
n8n
↓
Finance API
↓
Finance Core
↓
PostgreSQL
```

Finance Core remains independent of WhatsApp and third-party integrations.

---

### Financial model

Frozen V0.1 Transaction types:

```text
expense
income
transfer
```

Frozen V0.1 Transaction statuses:

```text
posted
voided
```

---

### Refund model

Frozen canonical representation:

```text
Refund
=
Transaction.type = income
+
refund_of_transaction_id = original Expense
```

Refund is semantically distinct from ordinary Income.

---

### Refund integrity

Frozen requirements include:

```text
partial Refund supported

multiple Refunds supported

refund-of-refund forbidden

Refund date >= original Expense date

Refund Book inherited from original Expense

Refund currency inherited from original Expense

sum(posted Refunds)
<=
original Expense amount

concurrent Refund creation protected transactionally
```

---

### Money model

Frozen financial persistence:

```text
NUMERIC(18,2)
```

Floating-point values are not permitted for canonical money.

API monetary values use decimal strings.

---

### Currency model

Frozen V0.1 invariant:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

FX is outside V0.1.

---

### Financial date model

Frozen V0.1 financial date:

```text
transaction_date
```

No separate financial time-of-day field exists in V0.1.

---

### Inbox model

Frozen Inbox identity:

```text
source
+
source_instance
+
source_message_id
```

Authorization must occur before Finance Inbox raw-content persistence.

---

### Confirmation model

Frozen statuses:

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

### API security

Frozen service scopes:

```text
finance:ingest

finance:admin
```

Normal n8n integration uses:

```text
finance:ingest
```

---

### API idempotency

Frozen requirement for:

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

### Master data

Frozen V0.1 master-data model includes:

```text
Books
Accounts
Categories
Merchants
ClassificationRules
AuthorizedSenders
```

Merchant aliases do not require a dedicated V0.1 entity/table.

Alias recognition initially uses:

```text
ClassificationRule
+
deterministic mapping
```

---

### Infrastructure

Defined intended VPS PostgreSQL target:

```text
/opt/apps/apps/databases/postgres-products
```

Expected Finance databases:

```text
finance_hub_lab
finance_hub_prod
```

Actual service existence remains subject to Gate 0 verification.

---

### Redis

Defined expected shared Redis service:

```text
redis-main
```

with namespace:

```text
finance-hub:
```

Redis is not a canonical financial Source of Truth.

---

### Backup and recovery

Frozen Production baseline:

```text
daily backup

RPO <= 24h

14 daily
8 weekly
12 monthly
```

Canonical off-site flow:

```text
pg_dump + Finance storage
↓
local staging
↓
Restic encrypted repository
↓
rclone
↓
Google Drive
```

A successful isolated restore is mandatory before:

```text
REAL DATA READY
```

---

### Documentation validation

Final documentation consistency validation:

```text
PASS: 34
FAIL: 0

DOCUMENTATION FREEZE: PASS
```

All 10 canonical documents were promoted to:

```text
FROZEN — Baseline for Implementation
```

The decision ledger remains:

```text
LOCKED
```

---

## Release conventions

Future releases should use entries such as:

```text
## [0.1.0] - YYYY-MM-DD

### Added
### Changed
### Fixed
### Security
### Database
### Infrastructure
### Backup / Recovery
```

Only use sections that are relevant.

---

## Change categories

### Added

Use for new externally meaningful capabilities.

Examples:

```text
Expense creation

WhatsApp ingestion

Summary endpoint
```

---

### Changed

Use when existing behavior intentionally changes.

Examples:

```text
classification behavior

API contract

financial calculation
```

A frozen architectural change may additionally require an ADR.

---

### Fixed

Use for bug fixes that do not intentionally redefine the domain.

Examples:

```text
duplicate Inbox processing fixed

incorrect pagination behavior fixed
```

---

### Security

Use for relevant security changes.

Examples:

```text
credential scope restriction

secret redaction

authorization fix
```

---

### Database

Use for meaningful schema or migration changes.

Examples:

```text
new table

new constraint

new index

data migration
```

---

### Infrastructure

Use for meaningful operational changes.

Examples:

```text
postgres-products provisioned

Lab deployment created

network topology changed
```

---

### Backup / Recovery

Use for:

```text
backup automation

retention change

restore procedure

successful recovery validation
```

---

## What should NOT be added here

Do not add routine entries for:

```text
formatting

comment changes

minor internal refactors

individual unit tests

every development task

PROJECT_STATE updates

temporary experiments
```

Git history and task tracking provide that level of detail.

---

## Pre-release policy

Until the first functional release:

```text
0.1.0
```

changes may remain under:

```text
[Unreleased]
```

When V0.1 is approved:

```text
[Unreleased]
↓
[0.1.0] - release date
```

and a new empty:

```text
[Unreleased]
```

section is created above it.

---

## First planned release

```text
0.1.0
```

Target scope:

```text
Books

Accounts

Categories

Merchants

ClassificationRules

AuthorizedSenders

Inbox

Interpretation

ConfirmationSession

Expense

Income

Transfer

Correction

Void

Refund

Audit

Idempotency

WhatsApp

Last

Summary

CSV Export

Security

Backup

Restore
```

Release requires:

```text
Gate A PASS
Gate B PASS
Gate C PASS
successful isolated restore
```

---

## Versioning principle

The project will initially use:

```text
MAJOR.MINOR.PATCH
```

with practical interpretation:

```text
PATCH
=
backward-compatible fixes

MINOR
=
new compatible capabilities / milestone releases

MAJOR
=
intentional incompatible product or contract evolution
```

Pre-1.0 versions may still contain planned evolution, but breaking changes must not be introduced silently.

---

## Architectural change rule

After Documentation Freeze, a new architectural decision is not recorded only in this changelog.

The proper sequence is:

```text
blocker / approved architectural need
↓
ADR
↓
affected canonical documentation
↓
implementation
↓
CHANGELOG entry when relevant
```

---

## Current summary

```text
Canonical documentation
✅ FROZEN

Operational control documents
✅ CREATED

Application code
⬜ NOT STARTED

Gate 0
⬜ NOT EXECUTED

M01
⬜ NOT STARTED

First functional release
⬜ 0.1.0
```