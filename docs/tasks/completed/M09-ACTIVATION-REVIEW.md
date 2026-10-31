# M09 Activation Review — Backup / Restore

**Status:** ACCEPTED — documentary review only; M09-P01 activation is a separate process
**Baseline:** `origin/main@a827d1170a0c2768bb831bb1d0956d890b9f2fad`
**Date:** 2026-10-31
**Independent reviewer:** ChatGPT — REVIEW PASS #5722893309 on `d9a1a25e65ecced3318e5af08f5282d512e5af0a`; CI #217 SUCCESS; PR #65 squash `9fb29569bb5acc8ecd73220d8dca844a51205ac2`.

## 1. Upstream and decision

M08 P01–P06 are DONE: PR #63 merged after review #5722309428 and CI #214 SUCCESS; documentary PR #64 merged after review #5722377012, CI #215 and post-merge #216 SUCCESS. Gate A and Gate B PASS. Gate 0 has no formal PASS; Gate C is PLANNED; Production is unapproved.

**Eligibility:** P01–P04 local/CI contracts may be promoted to ACTIVE only after independent acceptance of this review and explicit selection of a task. Repository authority has no established partial-milestone promotion convention, so M09 and all six contracts remain PLANNED in this PR. P05–P06 operational work requires Gate 0 PASS, separate operational authorization and evidence from the actual host. Gate C is a later independent acceptance gate; it neither grants operational permission nor substitutes for Gate 0.

## 2. Assumption delta

| Plan assumption | Finding on current main | Classification | Action |
|---|---|---|---|
| PostgreSQL is financial Source of Truth; custom `pg_dump` is required | Five migrations define the accepted application schema; no M09 backup runner exists | Valid | Preserve application-only dump and real PostgreSQL restore proof |
| Roles/bootstrap need creation | `packages/database/roles/bootstrap.sql` already creates and reconciles migration, app and readonly roles | Replaced | Reuse script; test recovery identity and grants; do not duplicate roles |
| `postgres-products` may be absent | Compose contract and Lab deployment records exist; current host inventory is unverified | Stale as implementation assumption; dependency unproven operationally | Inspect actual host through separately authorized Gate 0 |
| `finance_hub_prod` exists | Compose initializes `finance_hub_lab`; Production database existence is not established | Dependency unproven | Require live inventory and explicit authorization before targeting Production |
| Internal connectivity is to be designed | `finance-products-db` is in accepted compose; ADR-003 bounds connectivity | Replaced for repository contract | Validate actual membership at Gate 0; no topology changes here |
| Gate 0/INFRA-T01 records reflect present VPS | They are historical/planning evidence, not a current comprehensive closure | Stale | Require dated inventory, security and recovery evidence |
| Restic, rclone, timers and Drive are available live | No accepted deployment proof for M09 | Dependency unproven | Exercise local/test substitutes; defer real configuration |
| RPO <=24h and same-day RTO | Frozen targets, not measured operational results | Valid target, unproven result | Measure during P05/P06 |

No material frozen-architecture blocker was found. The missing evidence blocks operational execution, not local preparation.

## 3. Existing surfaces and missing operational evidence

- `infra/postgres-products/compose.yml` defines a PostgreSQL 18 image, persistent volume and internal `finance-products-db`; it is a repository contract, not proof of current host state.
- `infra/finance-lab/compose.yml` consumes that external network and externally supplied secrets. `infra/postgres-products/OPERATIONS.md` and `GATE0-REMAINING.md` are historical operational guidance.
- `packages/database/roles/bootstrap.sql` is the accepted role/grant reconciliation entry point. Migrations `001`–`005` and existing real PostgreSQL integration tests define schema and test patterns.
- Accepted M06/M07/M08 provide Inbox, Idempotency, Transaction/Refund, Audit, Summary and API behavior to verify after restore. Gate B proves local/CI financial integrity, not recovery.
- Gate 0 needs a dated, reviewed actual host inventory: container/image/health, database existence and names, volume/mount, network membership and ports, ownership/UID/GID, credential injection and authorized recovery identity, privileges, disk/staging capacity, host backup posture, security/recovery access, scheduler and outbound storage capability. INFRA-T01 and Lab records cannot replace this evidence.

## 4. Execution contracts and tests

The [overview](../active/M09-OVERVIEW.md) retains P01–P06. Each linked contract specifies paths, dependencies, acceptance, tests and exclusions.

| Task | Phase | Contract |
|---|---|---|
| P01 | local/CI | [Backup scripts/layout/bootstrap](../active/M09-P01.md) |
| P02 | local/CI | [Restic/rclone encryption](../planned/M09-P02.md) |
| P03 | local/CI | [Scheduler/retention/monitoring](../planned/M09-P03.md) |
| P04 | local/CI | [Restore runbook/isolated rehearsal](../planned/M09-P04.md) |
| P05 | operational, gated | [Executed operational restore](../planned/M09-P05.md) |
| P06 | operational acceptance | [Milestone verification](../planned/M09-P06.md) |

Local tests must use disposable real PostgreSQL where database semantics matter. They must demonstrate valid/restorable dumps, wrong-target rejection, interrupted/partial writes, remote failure, snapshot integrity/retention, grants, concurrency lock, safe cleanup and unchanged source. Compare Books, Accounts, Transactions, Refunds, Audit, Inbox, Idempotency and Summary before/after; use the accepted API against the restored database. No real Drive or VPS is needed for P01–P04.

## 5. Guardrails, impact and gates

Use only the Finance Hub application database, never routine `pg_dumpall` of shared PostgreSQL. Preserve `finance_hub_app` as non-superuser without bootstrap privilege. Inject secrets externally, keep Restic password and recovery material outside the VPS, and prevent plaintext off-site. Maintain 2–3 local dumps, 14 daily/8 weekly/12 monthly off-site snapshots, weekly check, daily timer target, RPO <=24h and same-day RTO target. Restore into an isolated database only. The accepted internal network is `finance-products-db`, subject to ADR-003 and live verification.

No schema migration or dependency change is authorized by this review. P01–P04 may later need implementation files and test fixtures only within their own contracts. No Production, shared host, credentials, real backup, timer install, external connection, topology change or restore execution occurs in this PR.

| Gate | Status | Meaning |
|---|---|---|
| Gate A/B | PASS | Upstream local/CI prerequisites satisfied |
| Gate 0 | No formal PASS | Required before any real VPS operation; does not itself authorize changes |
| Operational authorization | Absent | Specific permission required after Gate 0 and host evidence |
| Gate C | PLANNED | Requires accepted M09 with real backup/off-site/restore evidence; separate review |

## 6. Approval and promotion

- [x] Forward plan and assumption delta independently accepted (PR #65)
- [x] P01–P06 proposed contracts accepted as PLANNED (PR #65)
- [x] M09-P01 local/CI activation selected for a separate review/CI/merge; selection is not live authorization
- [ ] Gate 0 evidence accepted before operational tasks
- [ ] Specific operational action authorized before P05/real deployment

**Implementation authorized by this PR:** NO. After independent acceptance, promote only a selected P01–P04 contract under `docs/tasks/active/` through a separate state transition. Keep P05–P06 planned until their gates are met. Do not mark M09 DONE or Gate C PASS from documentary evidence.
