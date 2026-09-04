# README.md

# Finance Intelligence Hub

Self-hosted financial intelligence platform designed to provide a reliable, auditable and extensible financial core.

The V0.1 focuses on:

```text
financial correctness
auditability
controlled WhatsApp ingestion
idempotency
security
backup
restore
```

before advanced analytics, dashboards or AI-driven features.

---

# 1. Project Status

Current phase:

```text
PRE-IMPLEMENTATION
```

Canonical architecture:

```text
FROZEN — Baseline for Implementation
```

Implementation status:

```text
NOT STARTED
```

Current next milestone:

```text
M01 — Local Bootstrap
```

Operational VPS inspection:

```text
Gate 0 — NOT EXECUTED
```

For the current project state, always read:

```text
PROJECT_STATE.md
```

---

# 2. What is the Finance Intelligence Hub?

The Finance Intelligence Hub is intended to become a personal financial data platform capable of receiving, normalizing, storing and analyzing financial information from multiple sources.

The first version focuses on a small but trustworthy financial core.

High-level flow:

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

The financial system itself must remain usable without WhatsApp.

Core independence requirement:

```text
Finance API
+
Finance Core
+
PostgreSQL
```

must be sufficient for the basic financial system.

---

# 3. Source of Truth

The canonical Source of Truth is:

```text
PostgreSQL
```

owned by the Finance Intelligence Hub.

The following are not canonical financial storage:

```text
WhatsApp
Evolution
n8n
Redis
Firefly
Metabase
AI provider
Google Drive
```

---

# 4. V0.1 Scope

V0.1 includes:

```text
Books
Accounts
Categories
Merchants
ClassificationRules
AuthorizedSenders

InboxMessage
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

WhatsApp ingestion
Last Transaction
Summary
CSV Export

Security
Backup
Restore
```

---

# 5. Explicitly Outside V0.1

Do not prematurely implement:

```text
Firefly integration
Metabase

custom dashboard

installments
recurring transactions
planned transactions

FX
multi-currency operations

Products
Price Intelligence

Receipts
OCR

Vehicles
Fuel analytics

bank imports
reconciliation

multi-user SaaS
```

These concepts may already be documented as future extensions, but they are not part of the current implementation scope.

---

# 6. Canonical Transaction Model

V0.1 Transaction types:

```text
expense
income
transfer
```

V0.1 Transaction statuses:

```text
posted
voided
```

Do not introduce additional Transaction types or statuses without an approved post-Freeze architectural change.

---

# 7. Refund Model

Refund is not a Transaction type.

Canonical representation:

```text
Transaction.type = income
+
refund_of_transaction_id = original Expense
```

Therefore:

```text
ordinary Income
=
income without refund relation
```

while:

```text
Refund
=
income with refund relation
```

---

# 8. Refund Integrity

Important rules:

```text
Refund target must be a posted Expense

partial Refunds are allowed

multiple Refunds are allowed

refund-of-refund is forbidden

Refund date >= original Expense date

Refund Book = original Expense Book

Refund currency = original Expense currency

sum(posted Refunds)
<=
original Expense amount
```

Concurrent Refund creation must be protected transactionally.

---

# 9. Money

Canonical monetary storage:

```text
NUMERIC(18,2)
```

Never use floating point for financial values.

API monetary values use decimal strings.

Example:

```json
{
  "amount": "35.90"
}
```

---

# 10. Currency

V0.1 uses one currency per Book.

Invariant:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

FX is outside V0.1.

---

# 11. Financial Date

The canonical financial date is:

```text
transaction_date
```

V0.1 does not store a separate financial time-of-day.

Technical timestamps such as:

```text
created_at
updated_at
received_at
```

remain valid.

---

# 12. Books

A Book represents a financial context.

Examples:

```text
Pessoal
Empresa
```

These names are configurable data.

They are not hardcoded domain enums.

---

# 13. Accounts

Accounts belong to a Book.

Examples may include:

```text
checking
savings
cash
credit_card
other
```

New financial operations may only use active Accounts.

---

# 14. Credit Card Semantics

A credit-card purchase is:

```text
Expense
against credit_card Account
```

A future credit-card bill payment is:

```text
Transfer
```

It must not generate a second Expense for the same spending.

---

# 15. Categories

Categories belong to a Book and may be hierarchical.

Example:

```text
Marketing
└── Tráfego Pago
```

Cycles are forbidden.

---

# 16. Merchants

Merchants represent economic/commercial counterparties.

Examples:

```text
Amazon
Shell
Google Ads
Hostinger
```

V0.1 does not require a dedicated MerchantAlias entity/table.

Alias recognition initially uses:

```text
ClassificationRule
+
deterministic mapping
```

---

# 17. Classification Rules

ClassificationRules provide persistent deterministic classification.

Canonical precedence:

```text
explicit user instruction
↓
manual ClassificationRule
↓
known alias / deterministic mapping
↓
deterministic parser
↓
AI fallback
↓
ConfirmationSession
```

AI must not override explicit valid user information.

---

# 18. WhatsApp

WhatsApp is an input/output interface.

It is not the financial database.

Editing or deleting WhatsApp messages does not automatically change a persisted Transaction.

Financial changes use explicit Finance Hub operations.

---

# 19. WhatsApp Pipeline

```text
WhatsApp
↓
Evolution
↓
n8n
↓
Finance API
↓
Inbox
↓
Interpretation
↓
Finance Core
↓
PostgreSQL
```

n8n remains thin.

---

# 20. n8n Responsibilities

Allowed:

```text
receive webhook
technical filtering
minimal normalization
call Finance API
deliver reply
controlled retry
```

Do not place canonical financial business logic in n8n.

---

# 21. n8n Privileges

Normal n8n credential:

```text
finance:ingest
```

It must not normally have access to:

```text
/admin/*

POST /transactions

PATCH /transactions/*

POST /transactions/*/void

POST /transactions/*/refunds
```

---

# 22. Authorized Senders

WhatsApp financial commands are only accepted from configured AuthorizedSenders.

Authorization happens before financial raw content persistence.

Required order:

```text
service authentication
↓
group/fromMe validation
↓
sender normalization
↓
AuthorizedSender check
↓
Inbox persistence
```

Unauthorized conversation text must not be persisted in the Finance Inbox.

---

# 23. Inbox Identity

Canonical technical identity:

```text
source
+
source_instance
+
source_message_id
```

This protects financial processing against duplicate transport delivery.

---

# 24. Inbox Retry

If an InboxMessage is already:

```text
processed
```

it must not generate a second financial effect.

If it is:

```text
failed
```

the same InboxMessage may be retried.

If it becomes stale while:

```text
processing
```

the same InboxMessage may be reclaimed.

---

# 25. ConfirmationSession

Used before a financial action when confirmation or clarification is required.

Statuses:

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

Maximum:

```text
one pending ConfirmationSession
per channel + sender
```

---

# 26. WhatsApp Confirmation

The following always require explicit confirmation through WhatsApp:

```text
Void
Refund
```

A simple unambiguous ordinary correction may execute without a second confirmation if version and target remain valid.

---

# 27. Last Transaction

“Last” means:

```text
most recently created posted Transaction
```

Ordering:

```text
created_at DESC
id DESC
```

It does not mean the Transaction with the greatest `transaction_date`.

---

# 28. API

Base:

```text
/api/v1
```

Canonical contracts are documented in:

```text
05-API-CONTRACTS.md
```

---

# 29. API Authentication

Minimum service scopes:

```text
finance:ingest
finance:admin
```

---

# 30. Idempotency

The following financial POST operations require:

```text
Idempotency-Key
```

Routes:

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

Canonical idempotency storage:

```text
PostgreSQL
```

---

# 31. Idempotency States

V0.1:

```text
in_progress
completed
```

No automatic expiry in V0.1.

---

# 32. Optimistic Locking

Stale-sensitive Transaction mutations use:

```text
version
```

to prevent silent overwrite.

---

# 33. Database Architecture

On the VPS, the intended shared PostgreSQL service is:

```text
/opt/apps/apps/databases/postgres-products
```

But its actual operational existence must be verified during Gate 0.

Do not assume it already exists.

---

# 34. Finance Databases

Expected after infrastructure validation/provisioning:

```text
finance_hub_lab
finance_hub_prod
```

---

# 35. Do Not Use

Finance Hub business data must never use:

```text
n8n-postgres
evolution-postgres
```

---

# 36. Local Development Database

Local development and automated tests may use:

```text
Testcontainers
Docker Compose PostgreSQL
ephemeral PostgreSQL
```

This does not violate the shared PostgreSQL strategy used on the VPS.

---

# 37. Redis

Expected shared Redis service:

```text
redis-main
```

Namespace:

```text
finance-hub:
```

Redis is operational only.

It is not a financial Source of Truth.

---

# 38. Modular Monolith

Initial architecture:

```text
MODULAR MONOLITH
```

Do not split the application into distributed microservices without a future approved architectural reason.

---

# 39. Worker

A worker may exist as a scaffold.

A separate worker runtime should only be activated when real asynchronous work exists.

Examples:

```text
Firefly synchronization
OCR
receipt processing
large imports
background jobs
```

---

# 40. Outbox

`outbox_events` may exist in the V0.1 schema.

Do not generate routine Outbox events unless a real consumer/integration exists.

External delivery is not guaranteed exactly once.

Consumers must be idempotent.

---

# 41. Security

Important security principles:

```text
least privilege

strict input schemas

no mass assignment

separate ingest/admin credentials

PostgreSQL internal only

Redis internal only

no secrets in Git

Lab/Production separation

financial Audit
```

Canonical security requirements:

```text
07-SECURITY.md
```

---

# 42. Shared Infrastructure Safety

Shared VPS components must not be casually modified by application tasks.

Examples:

```text
postgres-products
redis-main
n8n
Evolution
NPM
Portainer
Docker shared networks
firewall
SSH
```

Changes require explicit bounded infrastructure work where applicable.

---

# 43. Filesystem Safety

Never run global recursive commands such as:

```bash
chown -R ...
chmod -R ...
```

against:

```text
/opt/apps
/opt/apps/apps
```

Never use:

```bash
chmod -R 777
```

as generic troubleshooting.

---

# 44. Production Safety

Normal implementation happens in:

```text
local
test
Lab
```

Production operations require explicit approval.

---

# 45. Gate 0

Gate 0 is the first VPS safety inspection.

It must establish the real state of:

```text
Docker
containers
volumes
networks

postgres-products
Redis

n8n
Evolution

NPM
Portainer

UFW
Fail2Ban
SSH

backup posture

filesystem ownership
agent privileges
```

M01 local work may begin before Gate 0.

VPS Finance Hub deployment may not.

---

# 46. Gate A

Gate A proves Finance Core independence.

The following must work without WhatsApp/n8n/AI:

```text
Expense
Income
Transfer
queries
```

---

# 47. Gate B

Gate B proves the complete financial lifecycle:

```text
Correction
Void
Refund
Idempotency
Audit
Inbox retry
```

---

# 48. Gate C

Gate C determines whether the system is ready for real financial data.

It requires:

```text
financial correctness
authorization
security
operations
backup
restore
```

A successful isolated restore is mandatory.

---

# 49. Backup

Production baseline:

```text
daily
RPO <= 24h
```

Retention:

```text
14 daily
8 weekly
12 monthly
```

---

# 50. Backup Architecture

```text
pg_dump custom format
+
Finance persistent storage
↓
local staging
↓
Restic encrypted repository
↓
rclone
↓
Google Drive
```

---

# 51. Restore

Production restore must never be the first restore test.

Validate backups using an isolated environment/database first.

Canonical recovery requirements:

```text
08-BACKUP-RESTORE.md
```

---

# 52. Project Documentation

Documentation hierarchy:

```text
FINAL-FREEZE-DECISIONS.md
        ↓
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

# 53. Authoritative Ledger

```text
FINAL-FREEZE-DECISIONS.md
```

is:

```text
LOCKED
```

and contains the final architecture decision ledger.

---

# 54. Agent Instructions

Before coding, read:

```text
AGENTS.md
PROJECT_STATE.md
```

Then use the documentation routing defined in `AGENTS.md`.

Do not load all canonical documentation indiscriminately for every task.

---

# 55. Current State

Always consult:

```text
PROJECT_STATE.md
```

before starting work.

Do not infer project progress solely from existing source files.

---

# 56. Roadmap

Canonical implementation roadmap:

```text
09-ROADMAP-TESTS.md
```

High-level:

```text
Documentation Freeze
✅

Operational Docs
← current preparation

M01 Local Bootstrap

Gate 0 VPS Safety

M02 Database Foundation

M03 Master Data

M04 Transaction Core

Gate A

M05 Inbox / Parser / Confirmation

M06 WhatsApp Integration

M07 Correction / Void / Refund

Gate B

M08 Reports / Export / Operations

M09 Backup / Restore

Gate C

v0.1.0
```

Gate 0 may run in parallel with permitted local M01 work.

---

# 57. Current Implementation Status

At the time this README was created:

```text
Application
NOT STARTED

Database migrations
NOT STARTED

Finance API
NOT STARTED

Finance Core
NOT STARTED

WhatsApp Finance integration
NOT STARTED

Finance backup automation
NOT STARTED
```

Use `PROJECT_STATE.md` for the current value after implementation begins.

---

# 58. Initial Operational Documents

```text
AGENTS.md
→ ACTIVE

PROJECT_STATE.md
→ ACTIVE

README.md
→ ACTIVE

CHANGELOG.md
→ pending at initial setup

ADRs
→ created only where appropriate
```

---

# 59. Initial ADRs

Expected early ADR topics:

```text
ADR-001
Implementation stack

ADR-002
UUID implementation choice

ADR-003
VPS internal connectivity
```

Do not invent ADR-003 before Gate 0 establishes actual VPS connectivity.

---

# 60. Implementation Stack

Not selected yet.

Selection happens during M01.

Evaluate:

```text
PostgreSQL support
transactions
migrations
strict validation
testing
logging
Docker deployment
maintainability
```

---

# 61. UUID

Preferred:

```text
UUIDv7
```

Validate maintained runtime/library support during M01.

If reliable support is unavailable:

```text
UUIDv4
```

may be selected through ADR.

---

# 62. Development Workflow

For each task:

```text
read task
↓
read AGENTS.md
↓
read PROJECT_STATE.md
↓
read routed canonical docs
↓
inspect current implementation
↓
implement bounded scope
↓
run tests
↓
update PROJECT_STATE.md
↓
report result
```

---

# 63. Task Shape

Implementation tasks should define:

```text
Task ID
Milestone
Goal
Allowed paths
Relevant docs
Acceptance criteria
Required tests
Forbidden scope
```

Avoid broad prompts such as:

```text
"implement the whole Finance Hub"
```

---

# 64. Testing

Testing is part of implementation.

Depending on task:

```text
unit tests
PostgreSQL integration tests
migration tests
API contract tests
security tests
concurrency tests
WhatsApp E2E tests
backup/restore tests
```

---

# 65. PostgreSQL Test Fidelity

Do not validate database behavior solely using SQLite or mocks.

Real PostgreSQL behavior must test:

```text
FKs
CHECKs
unique constraints
transactions
row locking
idempotency
Refund concurrency
```

---

# 66. Test Data

Use synthetic data.

Never use automated destructive testing against:

```text
finance_hub_prod
```

---

# 67. CHANGELOG

`CHANGELOG.md` records:

```text
releases
user-visible behavior
schema changes
important infrastructure changes
```

It is not a task diary.

---

# 68. PROJECT_STATE

`PROJECT_STATE.md` records the current operational state.

It must be updated after relevant implementation tasks.

Do not append unlimited historical records to it.

---

# 69. ADRs

ADRs document real architectural decisions discovered or finalized during implementation.

Do not create an ADR for every minor code choice.

---

# 70. Post-Freeze Change Rule

If implementation discovers a new idea:

```text
is it a true blocker?
```

If:

```text
NO
```

send to:

```text
BACKLOG
```

If:

```text
YES
```

stop the task and produce:

```text
ADR
+
specific canonical-document update
```

after approval.

Do not restart an open-ended architecture review.

---

# 71. Core Quality Principle

Prefer:

```text
small
correct
tested
auditable
recoverable
```

over:

```text
large
clever
fast
unverified
```

---

# 72. Current Next Step

Finish the remaining operational project-control files:

```text
CHANGELOG.md
initial ADRs
```

Then:

```text
initialize Git repository
↓
M01 — Local Bootstrap
```

with Gate 0 prepared/executed in parallel when VPS operational work begins.