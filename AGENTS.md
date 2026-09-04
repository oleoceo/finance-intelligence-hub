# AGENTS.md

# Finance Intelligence Hub
## Agent Operating Instructions

**Documento:** `AGENTS.md`  
**Versão:** 1.0  
**Status:** ACTIVE — Implementation Control  
**Projeto:** Finance Intelligence Hub

---

# 1. Purpose

This file defines the operating rules for any coding agent working on the Finance Intelligence Hub.

It applies to:

```text
Codex
ChatGPT Work
CLI coding agents
automated coding workflows
human-assisted agents
```

The purpose is to ensure that implementation follows the frozen architecture without:

```text
inventing domain rules
reopening architecture casually
changing shared infrastructure accidentally
duplicating financial effects
weakening security
breaking recoverability
```

---

# 2. Architecture status

The project architecture is:

```text
FROZEN — Baseline for Implementation
```

The following documents are canonical:

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

# 3. Authoritative order

When instructions appear to conflict, use this order:

```text
1. explicit current human-approved task
2. AGENTS.md operational safety rules
3. FINAL-FREEZE-DECISIONS.md
4. relevant frozen canonical document
5. PROJECT_STATE.md
6. existing implementation
7. comments / examples / incidental code
```

---

# 4. Critical rule

Existing code does not override frozen documentation.

If implementation conflicts with the canonical model:

```text
do not normalize the documentation to match the code
```

Instead:

```text
identify the conflict
↓
determine whether implementation is wrong
↓
correct implementation
```

unless a legitimate post-Freeze blocker has been discovered.

---

# 5. Architecture must not be reopened casually

Do not propose or implement architecture changes because:

```text
another framework looks cleaner

another endpoint name looks nicer

a different table structure feels preferable

a library encourages another pattern

future functionality could benefit
```

These are not blockers.

---

# 6. Valid architecture blockers

A frozen decision may only be challenged if implementation proves that it can cause:

```text
incorrect financial amount

duplicate financial effect

financial history loss

unauthorized access

data loss / impossible restore

logically impossible schema

technically impossible milestone
```

---

# 7. If a blocker is discovered

Stop the current implementation task.

Do not silently change architecture.

Report:

```text
BLOCKER DISCOVERED

Affected decision:
Affected document:
Technical evidence:
Impact:
Possible options:
```

Then wait for explicit architectural approval.

---

# 8. Non-blocking improvements

If an improvement is useful but not blocking:

```text
do not implement outside task scope
```

Record it for:

```text
BACKLOG
```

or future:

```text
ADR
```

---

# 9. Do not load every document for every task

Documentation must be routed according to task.

The whole frozen documentation is available as project context, but an implementation task should read primarily the relevant subset.

---

# 10. Always read before implementation

Every task must read:

```text
AGENTS.md
PROJECT_STATE.md
```

plus the specific canonical documents listed for the milestone/task.

---

# 11. Documentation routing — M01

For:

```text
M01 — Local Bootstrap
```

read:

```text
00-PROJECT-BLUEPRINT.md
03-ARCHITECTURE.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

Consult when necessary:

```text
FINAL-FREEZE-DECISIONS.md
```

---

# 12. Documentation routing — Gate 0

For:

```text
Gate 0 — VPS Safety
```

read:

```text
03-ARCHITECTURE.md
07-SECURITY.md
08-BACKUP-RESTORE.md
09-ROADMAP-TESTS.md
```

and:

```text
FINAL-FREEZE-DECISIONS.md
```

---

# 13. Documentation routing — M02

For:

```text
M02 — Database Foundation
```

read:

```text
02-DOMAIN-MODEL.md
04-DATABASE.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

Consult API contracts only when a DB decision affects a public contract.

---

# 14. Documentation routing — M03

For:

```text
M03 — Master Data / Configuration
```

read:

```text
01-MVP-REQUIREMENTS.md
02-DOMAIN-MODEL.md
04-DATABASE.md
05-API-CONTRACTS.md
09-ROADMAP-TESTS.md
```

---

# 15. Documentation routing — M04

For:

```text
M04 — Transaction Core
```

read:

```text
01-MVP-REQUIREMENTS.md
02-DOMAIN-MODEL.md
04-DATABASE.md
05-API-CONTRACTS.md
09-ROADMAP-TESTS.md
```

This is a high-risk financial milestone.

Review:

```text
FINAL-FREEZE-DECISIONS.md
```

for transaction/refund/idempotency rules before implementation.

---

# 16. Documentation routing — M05

For:

```text
M05 — Inbox / Parser / Confirmation
```

read:

```text
02-DOMAIN-MODEL.md
04-DATABASE.md
05-API-CONTRACTS.md
06-WHATSAPP-FLOWS.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

---

# 17. Documentation routing — M06

For:

```text
M06 — WhatsApp Integration
```

read:

```text
03-ARCHITECTURE.md
05-API-CONTRACTS.md
06-WHATSAPP-FLOWS.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

---

# 18. Documentation routing — M07

For:

```text
M07 — Correction / Void / Refund
```

read:

```text
01-MVP-REQUIREMENTS.md
02-DOMAIN-MODEL.md
04-DATABASE.md
05-API-CONTRACTS.md
06-WHATSAPP-FLOWS.md
09-ROADMAP-TESTS.md
```

Also inspect Refund decisions in:

```text
FINAL-FREEZE-DECISIONS.md
```

before implementation.

---

# 19. Documentation routing — M08

For:

```text
M08 — Reports / Export / Operations
```

read:

```text
01-MVP-REQUIREMENTS.md
02-DOMAIN-MODEL.md
05-API-CONTRACTS.md
06-WHATSAPP-FLOWS.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

---

# 20. Documentation routing — M09

For:

```text
M09 — Backup / Restore
```

read:

```text
07-SECURITY.md
08-BACKUP-RESTORE.md
09-ROADMAP-TESTS.md
```

and the VPS infrastructure documentation available to the project.

---

# 21. Finance Core rule

The financial system must remain usable with only:

```text
Finance API
+
Finance Core
+
PostgreSQL
```

Do not introduce mandatory dependencies on:

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

for normal synchronous financial CRUD unless a future frozen decision explicitly changes this.

---

# 22. Transaction model

The only V0.1 Transaction types are:

```text
expense
income
transfer
```

Never introduce:

```text
refund
adjustment
```

as Transaction types.

---

# 23. Transaction status

Only:

```text
posted
voided
```

Do not add:

```text
pending
active
draft
cancelled
```

to Transaction status.

Ambiguity exists before Transaction creation.

---

# 24. Financial date

The only financial occurrence date in V0.1 is:

```text
transaction_date
```

Do not introduce:

```text
occurred_at
transaction_time
financial_time
```

without a future approved ADR.

Technical timestamps such as:

```text
created_at
updated_at
received_at
```

remain valid.

---

# 25. Money

Canonical financial values must never use floating point.

Use:

```text
NUMERIC(18,2)
```

in PostgreSQL.

API money values are decimal strings.

---

# 26. Currency

V0.1 invariant:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

No FX.

No cross-currency Transfer.

---

# 27. Refund model

Refund is:

```text
Transaction.type = income
+
refund_of_transaction_id = original Expense
```

It is not ordinary Income semantically.

---

# 28. Refund target

A Refund can only target:

```text
posted Expense
```

---

# 29. Refund invariants

Always preserve:

```text
partial refunds allowed

multiple refunds allowed

refund-of-refund forbidden

refund date >= original date

Refund Book inherited from Expense

Refund currency inherited from Expense

sum(posted Refunds)
<=
original Expense amount
```

---

# 30. Refund concurrency

Concurrent Refund creation must protect the original Expense row.

Use:

```text
SELECT ... FOR UPDATE
```

or a transactionally equivalent mechanism.

Do not rely only on application pre-checks.

---

# 31. Refund correction

Refund is immutable in V0.1 except Void.

Incorrect Refund:

```text
Void incorrect Refund
↓
create correct Refund
```

---

# 32. Original Expense with Refund

An Expense with posted Refunds cannot be voided.

Canonical error:

```text
TRANSACTION_HAS_POSTED_REFUNDS
```

---

# 33. Correction after Refund

Never allow:

```text
new Expense amount
<
total posted Refunds
```

Never move the original Expense date after a posted Refund date.

---

# 34. Transfer

Transfer requires:

```text
source Account
destination Account
same Book
same Currency
source != destination
```

Cross-Book Transfer is outside V0.1.

---

# 35. Credit card rule

Credit-card purchase:

```text
Expense
against credit_card Account
```

Future bill payment:

```text
Transfer
```

Do not double-count as Expense.

---

# 36. Last Transaction semantics

“Last” means:

```text
most recently created posted Transaction
```

Ordering:

```text
created_at DESC
id DESC
```

Do not order by `transaction_date`.

---

# 37. Master data archive

Inactive:

```text
Book
Account
Category
Merchant
```

remain readable historically.

They cannot be used in new Transactions.

---

# 38. ClassificationRule

Canonical active-state field:

```text
active
```

Do not introduce:

```text
is_active
```

without migration/contract changes.

---

# 39. Merchant aliases V0.1

Do not create a mandatory:

```text
MerchantAlias
merchant_aliases table
MerchantAlias API
```

V0.1 alias recognition is handled by:

```text
ClassificationRule
+
deterministic mapping
```

---

# 40. Classification precedence

Always preserve:

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

---

# 41. ClassificationRule source

For normal admin-created rules:

```text
source = manual
```

set by the server.

Clients do not control `source`.

```text
source = system
```

is reserved for internal controlled flows.

---

# 42. Inbox authorization

The required order is:

```text
service authentication
↓
group/fromMe validation
↓
sender normalization
↓
AuthorizedSender check
↓
persist InboxMessage
```

---

# 43. Unauthorized sender privacy

Unauthorized sender content must not be persisted as:

```text
Finance Inbox raw_text
Finance Inbox raw_payload
```

Minimal security metadata may be logged without conversation content.

---

# 44. Inbox identity

Canonical identity:

```text
source
+
source_instance
+
source_message_id
```

Do not simplify to `source_message_id` alone.

---

# 45. Inbox retry

Processed:

```text
never reexecute financial effect
```

Failed:

```text
retry same InboxMessage
```

Stale processing:

```text
reclaim same InboxMessage
```

---

# 46. ConfirmationSession

Statuses:

```text
pending
confirmed
cancelled
expired
```

Do not add `superseded`.

Use:

```text
cancelled
+
resolution_reason = superseded_by_new_command
```

---

# 47. Confirmation TTL

Default:

```text
15 minutes
```

configurable.

---

# 48. One pending confirmation

Maximum:

```text
one pending ConfirmationSession
per channel + sender
```

---

# 49. Destructive WhatsApp actions

WhatsApp:

```text
Void
Refund
```

always require explicit confirmation.

---

# 50. Optimistic locking

Stale-sensitive Transaction operations use:

```text
version
```

Do not silently overwrite newer state.

---

# 51. API idempotency

`Idempotency-Key` is mandatory for:

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

---

# 52. Idempotency storage

Canonical storage:

```text
PostgreSQL
```

Not Redis.

---

# 53. Idempotency semantics

```text
same scoped key
+
same fingerprint
→ same logical result
```

```text
same scoped key
+
different fingerprint
→ 409 IDEMPOTENCY_CONFLICT
```

---

# 54. Idempotency states

Only:

```text
in_progress
completed
```

No automatic expiry V0.1.

---

# 55. API scopes

Use separate privileges:

```text
finance:ingest
finance:admin
```

---

# 56. n8n scope

Normal n8n credential:

```text
finance:ingest
```

It must not possess normal access to:

```text
/admin/*
POST /transactions
PATCH /transactions/*
POST /transactions/*/void
POST /transactions/*/refunds
```

---

# 57. n8n architecture

n8n remains thin.

Allowed responsibilities:

```text
receive webhook
technical filtering
normalize envelope
call Finance API
deliver reply
controlled technical retry
```

---

# 58. n8n forbidden logic

Do not implement in n8n:

```text
financial classification truth
Book business rules
Account defaults
Refund rules
Void rules
financial SQL
```

---

# 59. AI authority

AI may return:

```text
structured interpretation candidate
```

It never has authority to:

```text
write database directly
execute SQL
authorize sender
bypass Finance Core
confirm success before COMMIT
```

---

# 60. AI secrets

Never provide AI with:

```text
.env
database passwords
API keys
service credentials
production secrets
```

unless a future explicit security decision authorizes a narrowly scoped mechanism.

---

# 61. PostgreSQL VPS target

Expected shared service path:

```text
/opt/apps/apps/databases/postgres-products
```

But:

```text
DO NOT ASSUME IT EXISTS
```

Gate 0 must verify.

---

# 62. If postgres-products does not exist

Do not create another random Finance PostgreSQL container.

Stop normal task.

Required action:

```text
explicit infrastructure provisioning task
```

with human approval.

---

# 63. Finance databases

Expected:

```text
finance_hub_lab
finance_hub_prod
```

---

# 64. Forbidden databases

Never store Finance Hub product data in:

```text
n8n-postgres
evolution-postgres
```

---

# 65. Local PostgreSQL

Development/test may use:

```text
Testcontainers
Docker Compose dev PostgreSQL
ephemeral local PostgreSQL
```

This does not violate VPS architecture.

---

# 66. Redis

Use shared:

```text
redis-main
```

when needed.

Namespace:

```text
finance-hub:
```

Redis is not canonical financial storage.

---

# 67. Database and Redis exposure

Never expose PostgreSQL or Redis publicly.

They do not belong on public `proxy` network.

---

# 68. Shared infrastructure protection

Do not modify without explicit approved infrastructure task:

```text
postgres-products service
redis-main
Evolution stack
n8n stack
NPM global configuration
Portainer
Docker shared networks
firewall
SSH daemon configuration
```

---

# 69. Filesystem protection

Never run broadly:

```bash
chown -R
chmod -R
```

against:

```text
/opt/apps
/opt/apps/apps
```

---

# 70. Forbidden permission shortcut

Never use:

```bash
chmod -R 777
```

as generic troubleshooting.

---

# 71. EACCES procedure

If permission error occurs:

```text
identify process/container user
↓
identify exact mounted path
↓
inspect UID/GID
↓
change only required project path
↓
validate affected service
```

---

# 72. Docker privilege

Docker access is effectively high privilege.

Do not assume agent may:

```text
access Docker socket
restart unrelated containers
delete volumes
change shared networks
```

---

# 73. Destructive operations requiring approval

Never execute autonomously:

```text
DROP DATABASE
DROP TABLE
TRUNCATE
bulk DELETE
Production restore
destructive migration
Docker volume deletion
docker system prune -a
firewall changes
SSH configuration changes
global NPM changes
shared network changes
shared database provisioning
recursive global ownership changes
```

---

# 74. Production

Normal implementation tasks target:

```text
local
test
Lab
```

Production changes require explicit task/approval.

---

# 75. Gate 0

Before first operational Finance Hub VPS modification, Gate 0 must PASS.

M01 local work can happen before Gate 0.

---

# 76. Gate 0 blocks

Before Gate 0 PASS do not:

```text
deploy Finance Hub to VPS Lab
create Finance VPS database
provision postgres-products
change shared Docker networks
grant operational remote agent privileges
```

---

# 77. Production real-data gate

Real financial data requires:

```text
Gate C PASS
```

including:

```text
successful isolated restore
```

---

# 78. Backup architecture

Canonical:

```text
pg_dump custom format
+
Finance storage
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

# 79. Backup paths

Use:

```text
/opt/apps/backups/databases/finance-hub/
/opt/apps/backups/files/finance-hub/
```

with Lab/Production separation.

---

# 80. Application backup scope

Finance Hub backup must not indiscriminately dump every database in:

```text
postgres-products
```

---

# 81. Backup baseline

Production:

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

# 82. Restore

Restore test must use isolated target first.

Never blindly restore directly over Production.

---

# 83. Source code workflow

Before editing:

```text
read task
↓
read AGENTS.md
↓
read PROJECT_STATE.md
↓
read routed canonical docs
↓
inspect current code/tests
↓
form implementation plan
```

---

# 84. Task scope

Change only files required by the task.

Do not perform unrelated:

```text
refactors
renames
dependency upgrades
formatting sweeps
architecture cleanup
```

unless required to complete acceptance criteria.

---

# 85. Small tasks preferred

A milestone should be split into bounded tasks.

Example M04:

```text
M04-T01 Money Value Object
M04-T02 Expense Use Case
M04-T03 Income Use Case
M04-T04 Transfer Use Case
M04-T05 Transaction Queries
M04-T06 Idempotency
M04-T07 Audit
```

---

# 86. Every implementation task should specify

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

---

# 87. Tests are part of implementation

A task is not complete because code compiles.

Where applicable include:

```text
unit tests
integration tests
contract tests
migration tests
security tests
E2E tests
```

---

# 88. PostgreSQL integration tests

Do not validate DB behavior solely through mocks.

Use real/ephemeral PostgreSQL for:

```text
FK constraints
CHECK constraints
unique constraints
transactions
locking
idempotency
Refund concurrency
```

---

# 89. Financial correctness tests

Critical tests include:

```text
decimal precision

cross-Book rejection

currency mismatch rejection

inactive entity rejection

Refund overflow

concurrent Refund

Void with posted Refund

Correction after Refund

idempotent retry

duplicate Inbox retry
```

---

# 90. Test data

Use synthetic test data.

Never point automated destructive tests at:

```text
finance_hub_prod
```

---

# 91. Production DB guard

Test tooling should fail closed if database configuration identifies:

```text
finance_hub_prod
```

---

# 92. Migration rule

Migrations must be versioned.

Every migration should work against the expected previous schema.

Fresh-schema migration tests are required.

---

# 93. Production migration

Before relevant Production migration:

```text
review
↓
backup
↓
backup validation
↓
Lab migration test
↓
recovery plan
↓
explicit approval
```

---

# 94. Logging

Structured logs should include useful metadata such as:

```text
request_id
correlation_id
route
status
duration
resource IDs when safe
error code
```

---

# 95. Logging secrets

Never log:

```text
Authorization header
Bearer token
DB password
DATABASE_URL with credentials
Evolution API key
Redis password
.env contents
```

---

# 96. Raw financial text in logs

Avoid by default.

Authorized raw financial text belongs to the controlled Inbox persistence, not generic application logs.

---

# 97. Error responses

Production errors must not expose:

```text
stack traces
SQL statements
database credentials
internal secrets
```

---

# 98. API contract changes

Do not change a frozen public API contract merely to simplify implementation.

If technically impossible:

```text
report blocker
```

---

# 99. Schema changes

Do not create future tables simply because future modules are documented.

V0.1 must not prematurely create:

```text
Products
PriceObservations
Receipts
Vehicles
Installments
RecurringTransactionRules
Reconciliation
```

---

# 100. Outbox

`outbox_events` may exist in V0.1.

Do not emit routine events without:

```text
real consumer
or
configured integration
```

---

# 101. Firefly

Outside V0.1.

When implemented later:

```text
Finance Hub
↓
Outbox
↓
Worker
↓
Firefly Adapter
```

Finance Hub remains Source of Truth.

---

# 102. Metabase

Future only.

Database access must be:

```text
read-only
```

---

# 103. Dashboard

Future dashboard accesses:

```text
Finance API
```

not PostgreSQL directly.

---

# 104. PROJECT_STATE.md

After each completed implementation task, update:

```text
PROJECT_STATE.md
```

with:

```text
current milestone
completed task
tests run
known issues
next task
environment status
```

---

# 105. CHANGELOG.md

Update for:

```text
user-visible changes
important infrastructure changes
schema changes
releases
```

Do not use CHANGELOG as task scratchpad.

---

# 106. ADR usage

Create ADR only for real architectural decisions.

Do not create an ADR for:

```text
ordinary code implementation
minor refactor
obvious bug fix
formatting
```

---

# 107. Git discipline

Each task should produce a focused diff.

Avoid mixing multiple milestones in one change.

---

# 108. Dependency changes

Do not casually add dependencies.

Before adding one, verify:

```text
why needed
maintenance status
license compatibility
security implications
whether standard library/current stack is sufficient
```

---

# 109. Dependency upgrades

Do not upgrade unrelated dependencies as part of ordinary feature work.

---

# 110. `latest`

Avoid unpinned runtime/container dependency on:

```text
latest
```

where stable version control is practical.

---

# 111. Blind installer commands

Do not execute:

```bash
curl ... | bash
```

without explicit review of source and need.

---

# 112. Task completion report

Every completed task should report:

```text
Files changed
Behavior implemented
Tests executed
Test result
Migration status
Security impact
Documentation/state updated
Remaining issues
```

---

# 113. No false success

Never claim:

```text
implemented
working
tested
safe
```

unless corresponding evidence exists.

---

# 114. No silent partial implementation

If acceptance criteria are only partially met:

```text
mark task PARTIAL
```

and clearly identify the missing criteria.

---

# 115. Milestone Gate A

Gate A proves Finance Core works without:

```text
Evolution
n8n
AI
Firefly
```

for:

```text
Expense
Income
Transfer
queries
```

---

# 116. Milestone Gate B

Gate B proves integrity of:

```text
Correction
Void
Refund
Idempotency
Audit
Inbox retry
```

---

# 117. Milestone Gate C

Gate C proves readiness for real data:

```text
financial integrity
authorization
security
operations
backup
restore
```

A real isolated restore is mandatory.

---

# 118. Final agent principle

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

# 119. Stop condition

When uncertainty affects:

```text
money
authorization
history
database schema
shared infrastructure
Production
restore
```

do not guess.

Stop and surface the uncertainty.

---

# 120. Implementation objective

The job of the coding agent is not to redesign the Finance Intelligence Hub.

The job is:

```text
read the frozen decisions
↓
implement the current bounded task
↓
prove it with tests
↓
update project state
↓
move to the next task
```

without creating architectural drift.