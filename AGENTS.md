# AGENTS.md

## Task execution workflow

For authorized implementation tasks, use the project skill:

`.agents/skills/finance-hub-task-runner/SKILL.md`

The skill defines the implementation, self-healing, PR/CI, review and closure procedure.
Repository authority and task contracts remain authoritative over the skill.

# Finance Intelligence Hub
## Vendor-Neutral Agent Contract

**Status:** ACTIVE  
**Scope:** Entire repository

## 1. Purpose

This file is the repository-wide operating contract for any coding agent, including Codex, Claude, Antigravity, or other agents.

Do not duplicate the full project architecture here. Detailed product and architecture rules live under `docs/frozen/`.

## 2. Mandatory preflight

Before any work:

1. Read `AGENTS.md`.
2. Read `PROJECT_STATE.md`.
3. Read the current task under `docs/tasks/active/`.
4. Read only the frozen documents routed by that task.
5. Inspect the current code/tests before changing files.

Do not infer the current milestone only from source-code presence.

## 3. Authority order

If instructions appear to conflict, follow this order:

1. Explicit current human-approved task.
2. `AGENTS.md`.
3. `docs/frozen/FINAL-FREEZE-DECISIONS.md`.
4. Relevant frozen canonical documents.
5. `PROJECT_STATE.md`.
6. Accepted ADRs relevant to the task.
7. Existing implementation.
8. Comments/examples/incidental code.

Existing code does not override frozen architecture.

## 4. Frozen documentation

Canonical frozen documents live in:

`docs/frozen/`

The architecture is frozen. Do not redesign it because another approach appears cleaner.

A frozen decision may only be challenged if implementation demonstrates a true blocker capable of causing:

- incorrect financial values;
- duplicate financial effects;
- financial-history loss;
- unauthorized access;
- data loss or impossible restore;
- logically impossible schema;
- technically impossible milestone.

If such a blocker is discovered, stop and report it. Do not silently change the architecture.

Non-blocking improvements go to backlog/future ADR and must not expand the current task.

## 5. Task discipline

Every implementation task should define:

- Task ID;
- milestone;
- goal;
- allowed paths;
- relevant documents;
- acceptance criteria;
- required tests;
- forbidden scope.

Work only inside the bounded task.

Do not perform unrelated:

- refactors;
- dependency upgrades;
- renames;
- formatting sweeps;
- architecture changes;
- shared VPS changes.

## 6. Documentation routing

Use the task file first. General routing:

- M01: `00-PROJECT-BLUEPRINT.md`, `03-ARCHITECTURE.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md`
- Gate 0: `03-ARCHITECTURE.md`, `07-SECURITY.md`, `08-BACKUP-RESTORE.md`, `09-ROADMAP-TESTS.md`
- M02: `02-DOMAIN-MODEL.md`, `04-DATABASE.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md`
- M03: `01-MVP-REQUIREMENTS.md`, `02-DOMAIN-MODEL.md`, `04-DATABASE.md`, `05-API-CONTRACTS.md`, `09-ROADMAP-TESTS.md`
- M04: `01-MVP-REQUIREMENTS.md`, `02-DOMAIN-MODEL.md`, `04-DATABASE.md`, `05-API-CONTRACTS.md`, `09-ROADMAP-TESTS.md`
- M05: `02-DOMAIN-MODEL.md`, `04-DATABASE.md`, `05-API-CONTRACTS.md`, `06-WHATSAPP-FLOWS.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md`
- M06: `03-ARCHITECTURE.md`, `05-API-CONTRACTS.md`, `06-WHATSAPP-FLOWS.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md`
- M07: `01-MVP-REQUIREMENTS.md`, `02-DOMAIN-MODEL.md`, `04-DATABASE.md`, `05-API-CONTRACTS.md`, `06-WHATSAPP-FLOWS.md`, `09-ROADMAP-TESTS.md`
- M08: `01-MVP-REQUIREMENTS.md`, `02-DOMAIN-MODEL.md`, `05-API-CONTRACTS.md`, `06-WHATSAPP-FLOWS.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md`
- M09: `07-SECURITY.md`, `08-BACKUP-RESTORE.md`, `09-ROADMAP-TESTS.md`

Do not load every frozen document for every task.

## 7. Critical financial guardrails

These are summaries only; frozen documents remain authoritative.

- Transaction types: `expense | income | transfer`
- Transaction statuses: `posted | voided`
- Refund: `income + refund_of_transaction_id`
- Financial date: `transaction_date`
- Do not introduce `occurred_at`.
- Canonical money must not use floating point.
- PostgreSQL is the canonical financial Source of Truth.
- `Book.currency = Account.currency = Transaction.currency` in V0.1.
- No FX or cross-Book Transfer in V0.1.
- Refund-of-refund is forbidden.
- `sum(posted refunds) <= original expense amount`.
- An Expense with posted Refunds cannot be voided.
- “Last” means most recently created posted Transaction: `created_at DESC, id DESC`.

## 8. Ingestion, authorization and idempotency guardrails

- Authorize sender before persisting Finance Inbox raw content.
- Inbox identity is `source + source_instance + source_message_id`.
- n8n uses least-privilege `finance:ingest`; administrative/direct financial operations use `finance:admin`.
- `Idempotency-Key` is required for transaction create, void and refund POST operations.
- Canonical idempotency persistence is PostgreSQL.
- Stale-sensitive Transaction mutations use optimistic `version`.

## 9. Infrastructure safety

Normal implementation targets local/test/Lab.

Do not modify Production or shared VPS infrastructure unless the current task explicitly authorizes it.

Do not assume `postgres-products` exists before Gate 0.

Never store Finance Hub product data in `n8n-postgres` or `evolution-postgres`.

Never expose PostgreSQL or Redis publicly.

Never execute broad recursive ownership/permission changes against `/opt/apps` or `/opt/apps/apps`.

Never use `chmod -R 777` as generic troubleshooting.

Destructive operations, shared-network changes, firewall/SSH changes, Production restores, shared database provisioning, and Docker-volume deletion require explicit approval.

## 10. Secrets

Never commit or print:

- `.env` secrets;
- database passwords;
- Bearer/API tokens;
- SSH private keys;
- Evolution credentials;
- Redis credentials;
- Restic passwords.

Do not place secrets in prompts, logs, tests, fixtures, or Git.

## 11. Testing

A task is not complete because code compiles.

Run the tests required by the task.

Where database behavior matters, use real PostgreSQL semantics for constraints, transactions, row locking, idempotency and concurrency.

Do not use `finance_hub_prod` for automated tests.

Do not claim a test passed unless it was actually executed.

## 12. Git and change control

Prefer focused diffs.

Do not commit or push unless the current task explicitly allows it.

Do not rewrite or move frozen documentation as part of implementation work.

Do not modify the `docs-freeze-v0.1` tag.

## 13. Project state

After a completed implementation task, update `PROJECT_STATE.md` when appropriate with:

- current milestone;
- completed task;
- tests executed;
- environment status;
- blockers/known issues;
- next task.

`PROJECT_STATE.md` is current state, not an unlimited history log.

## 14. Completion report

Every completed task must report:

- files changed;
- behavior implemented;
- commands/tests executed;
- test results;
- migration impact;
- security impact;
- documentation/state updates;
- remaining issues.

If acceptance criteria are incomplete, mark the task `PARTIAL`.

## 15. Stop conditions

Do not guess when uncertainty affects:

- money;
- authorization;
- financial history;
- database schema;
- Production;
- shared infrastructure;
- restore/recovery.

Stop and surface the uncertainty.

## 16. Final principle

The agent's job is not to redesign the Finance Intelligence Hub.

The operating loop is:

read frozen decisions
→ execute the bounded task
→ prove the result with tests/evidence
→ update project state
→ stop.
