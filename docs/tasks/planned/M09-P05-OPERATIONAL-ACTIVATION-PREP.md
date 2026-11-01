# M09-P05 — operational activation preparation (Finance Lab)

**State:** DOCUMENTARY PREPARATION ONLY; do not promote P05 to ACTIVE or run live backup/restore until the formal Gate 0 closure PR is reviewed, CI GREEN and integrated. This plan is not Gate 0 PASS, operational permission, Production release or Gate C approval.

**Prepared:** 2026-11-01. **Authoritative contracts:** [M09-P05](M09-P05.md), [M09 overview](../active/M09-OVERVIEW.md), [isolated restore runbook](../../runbooks/finance-hub-restore.md), `docs/frozen/07-SECURITY.md`, `08-BACKUP-RESTORE.md`, `09-ROADMAP-TESTS.md`. **Gate 0 evidence:** PR #78 and `docs/tasks/active/GATE-0-CLOSURE-REVIEW.md` after acceptance.

## 1. Scope, no further full-VPS inventory

**Human-only operational execution:** owner `leoceo` manually operates VPS; agents may inspect and review GitHub/CI, but are not authorized for SSH or VPS operations. No agent receives access to root, sudo, Docker or financial secrets.

The Gate 0 operator evidence already identifies:

- Host Ubuntu 24.04.4 LTS, Docker Engine 29.3.0, Compose 5.1.0; 4 logical CPU, 15 GiB RAM; host disk 193G/170G free at 31 Oct.
- Source PostgreSQL container `postgres-products` using PostgreSQL 18.6 and named volume `finance_postgres_products_data` (`/var/lib/postgresql`); internal network `finance-products-db`; Lab database `finance_hub_lab`. `finance-lab-api-1` healthy. **No Production database existence inferred.**
- Existing isolated instance `finance-hub-restore-test` with dedicated `finance_hub_restore_test_data` volume and internal `finance-hub-restore-test-net`; **existing instance and contents are not disposable by assumption**. Do not reuse or overwrite an existing database, volume or secret. The name, role and empty-target identity must be verified *only for the specific approved restore action*.
- Lab backup directory `/opt/apps/backups/databases/finance-hub/lab` exists; old dumps and M06 isolated restore accepted. Preserve preexisting dumps, sidecars and directory ownership. No global chown/chmod.
- Dedicated `finance-backup` and rclone Drive remote `finance-drive:` with `FinanceHub-Backups` demonstrated reading and writing a synthetic file; Restic local repository `dad15f1600` / snapshot `42a6da7e` and operator-reported `RECUPERACAO OFFSITE SINTETICA: PASS`. The **synthetic repository and password must not be reused** for financial data.

**No more general inventory:** NPM Proxy Hosts, 27 containers, Docker networks, UFW/Fail2Ban, SSH keys and Hostinger recovery option were already inspected. Any remaining checks must be specific to the actual P05 backup/restore identity and non-mutation.

## 2. Exact proposed first operational source and target

- **Source:** `finance_hub_lab` in `postgres-products`. Backup only this database, using PostgreSQL 18 compatible `pg_dump --format=custom`, not `pg_dumpall`. A **new** dated custom dump is preferable to the historical postmigration dump for P05 data-consistency checks.
- **Target:** an explicitly named, **new empty** `finance_restore_*` database in an independently isolated PostgreSQL 18 recovery instance; existing `finance-hub-restore-test` may be selected only if its authorized bootstrap identity and a distinct empty target can be established without destroying or modifying any preexisting database. No restore onto `finance_hub_lab` or `finance_hub_prod`.
- **Destination:** separately named encrypted Restic repository (not `restic-prova`), copied using rclone only under `finance-drive:FinanceHub-Backups/` in its own Finance Lab location. Never upload plaintext `.dump`, `.env` or passwords.
- **Recovery credentials:** independent Restic password and refresh-capable OAuth configuration, with recovery copy **outside the VPS** and outside Git. PostgreSQL operator/bootstrap uses protected password file/secret interface, not shell arguments, logs or prompts. Do not broaden `finance-backup` into sudo/docker membership to bypass file permissions.

## 3. Required execution sequence after reviewed Gate 0 and exact-scope authorization

1. Identify fresh timestamp and immutable source inventory: source DB name, PostgreSQL major version, migration chain, permitted DB access identity, source transaction counts and reconciliation queries. Record operator/time/artifact paths in private evidence.
2. Create one **new**, restricted Lab `pg_dump -Fc` artifact and manifest containing environment/database/date/size/SHA-256. Validate `PGDMP` magic, `pg_restore --list`, checksum and stable source metadata. The `scripts/backup/finance-hub-dump.sh` local/CI runner may be adapted **only through a focused reviewed operational change**; never bypass its environment/credential guardrails.
3. Store snapshot in a **distinct** Restic repository with a new password, validate `restic snapshots` and `restic check`, copy **encrypted repository objects only** to the dedicated Google Drive folder with rclone, and independently compare/verify. No prune, sync deletion, or retention operation in P05.
4. Independently retrieve the encrypted repo from Drive into an empty restricted staging directory, run `restic check`, restore exact snapshot, re-verify dump manifest SHA, size and archive listing. Do not substitute local snapshot for this off-site source.
5. On the **approved isolated PostgreSQL instance**, ensure exact `finance_restore_*` target **does not yet exist**, create a fresh empty DB, run the reviewed bootstrap/role grant process under approved recovery privilege, and execute single-transaction `pg_restore` using migration-owner semantics with fail-fast. Never use `--clean`, `--create`, `DROP` against existing databases, or bootstrap with runtime `finance_hub_app` role. Existing `docs/runbooks/finance-hub-restore.md` synthetic runner requires separately reviewed operational adaptation before real use.
6. Verify PostgreSQL 18 compatibility, versioned migrations and grants/ownership, compare Books/Accounts/Transactions/Refund associations/status/currency/monetary decimal strings/Audit/Inbox/Idempotency and Summary against source/manifest. Configure a **separate** Finance API against the restored DB only, using synthetic test tokens and no operational WhatsApp/NPM route; validate API reads/idempotent replay.
7. Measure local backup/off-site/restore timings, source non-mutation and unrelated DB invariance, record exact SHA/snapshot/check/exit status and safe rollback/cleanup rule. A nonzero command is FAIL. **Do not claim actual Production RPO <=24h or same-day RTO from Lab timing**.

## 4. Operational implementation blockers (not VPS infrastructure blockers)

The accepted M09-P01–P04 tools are **disposable fixture/CI only**:
- `finance-hub-protect.sh` explicitly requires a local destination directory; it does not accept `finance-drive:` as operational remote.
- `finance-hub-scheduled.sh` requires a fixture marker and `FINANCE_BACKUP_FIXTURE_ONLY=yes`; no live timer or retention activation.
- The approved `finance-hub-dump.sh` supports `lab` but requires a guarded `PGPASSFILE`, filesystem layout and connection; `finance-backup` has no implicit access to the source's database secrets, Docker socket or container network.

**Before any real Lab dump or restore**, provide a focused operator-reviewed, least-privilege operational adapter, exact credentials and source/target binding; do not disable the CI safety checks just to make a live run work. Existing synthetic Restic proof does not waive this. Changes to shared services, Production, SSH/firewall, `docker compose down`, databases other than the named disposable target, or data-volume deletion are excluded.

## 5. Acceptance/next state

**Activation eligibility only after:** reviewed/formally integrated Gate 0 PASS with exact SHA and CI, P01–P04 accepted, specific human operator/source/target/secret scope documented. Only then move `docs/tasks/planned/M09-P05.md` to ACTIVE in a separate reviewed promotion. P05 DONE requires **real** off-site Finance Lab backup restore and full source/target application comparisons. P06 daily timer, 14/8/12 retention, alerts and weekly checks are a separate phase; Gate C/Production are not implied.
