# M03 — Master Data / Configuration: Planning Overview

**Status:** IN PROGRESS
**Implementation:** T01 DONE; T02 DONE; T03/T04/T05 PLANNED
**T01–T05:** T01 DONE; T02 DONE; T03/T04/T05 PLANNED
**Authorization:** T01 and T02 accepted by human review; T02 closure prepared. T03 is not started; no commit or push.

## Authority and baseline

Read AGENTS.md, PROJECT_STATE.md, this overview and the selected task. M01/M02 are DONE and accepted; migrations 001–005 are unchanged. Historical baseline: 4 unit files / 35 tests; 8 integration files / 74 tests. This planning pass does not rerun or claim new application test results.

Frozen routing: FINAL-FREEZE-DECISIONS §§5–6, 78–97; 01-MVP-REQUIREMENTS §§5–22, 63–65; 02-DOMAIN-MODEL §§9–65, 138–146, 250; 03-ARCHITECTURE §§9–14; 04-DATABASE §§14–38 and Transaction reference columns; 05-API-CONTRACTS §§2–10, 14–27; 07-SECURITY §§14–32, 62–64; 09-ROADMAP-TESTS §§83–93. Accepted ADR-001/002 establish the stack/UUID baseline; neither changes.

## Five slices and dependencies

| Task | Ownership | Dependencies after authorization |
| --- | --- | --- |
| [T01](../completed/M03-T01.md) | Primitives, errors and Core ports | Accepted M02 |
| [T02](../completed/M03-T02.md) | Books/Accounts; usage/default readers | T01 |
| [T03](M03-T03.md) | Categories/Merchants; hierarchy updates | T01 |
| [T04](M03-T04.md) | Rules/Senders configuration | T02 and T03 |
| [T05](M03-T05.md) | API and milestone integration | T01–T04 |

Preferred execution: human authorization -> T01 -> T02 -> T03 -> T04 -> T05.
Formal graph: T01 -> {T02, T03}; {T02, T03} -> T04; {T01, T02, T03, T04} -> T05.
T02 must pass before T04 exists. T03 may use T01 Book lookup/lock contracts without depending on T02 use cases.

## Dependency direction

- `packages/core`: domain/application behavior, errors and repository/read/transaction ports under `src/application/ports/`.
- `packages/database`: Kysely/PostgreSQL adapters satisfying Core contracts; may import Core types/contracts.
- `apps/api`: TypeBox schemas, authentication/scopes, HTTP mapping and composition/injection.

API -> Core; API composition -> Database; Database -> Core contracts. Core must never import Database, Kysely, pg or Fastify. Transaction ports must not expose Kysely objects to Core. Prefer explicit small use cases; no required abstract base-use-case class. Extract abstractions only for demonstrated duplication.

Core currently has no application convention beyond a stub; the proposed ports directory is a placement decision. Colocate unit tests under `packages/core/src/**/*.test.ts` to match current Vitest discovery; integration tests belong under `tests/integration/`.

## Lifecycle and authority decisions

| Entity | Lifecycle and guard |
| --- | --- |
| Book | active + archived_at; currency immutable after Accounts/Transactions; sender defaults block archive |
| Account | active + archived_at; Book immutable after creation; currency/type immutable after financial use; sender defaults block archive |
| Category | active + archived_at; mutable same-Book parent via PATCH; self/longer cycles prohibited |
| Merchant | active + archived_at; global; normalized name is nonunique lookup data |
| Classification Rule | active only, no archived_at; admin source is server-set manual |
| Authorized Sender | active only, no archived_at; compatible active defaults |

Ledger §§82–90, domain §§19–20, 30, 46, 54, 146 and requirements §65 preserve archived history. Do not block Category/Merchant archive due to historical Transactions or Book archive merely because Accounts exist. Existing children/rules/history are retained without cascade. Sender defaults block archive even for inactive senders until removed/changed. For the four archive entities, active=false sets a server timestamp, active=true clears it; repeated archive preserves its timestamp.

Category parent: ledger §§91–93, domain §§36–42 and database §§25–26 require same-Book hierarchy and longer-cycle prevention; API §18 supplies PATCH. None makes parent_category_id immutable. Bounded interpretation: UpdateCategory supports reparenting, including null for root, through PATCH; no MoveCategory endpoint. Book reassignment is outside the chosen Category PATCH shape, not a claimed frozen parent-immutability rule.

Merchant uniqueness: domain §§48–54 provides global scope/history; database §§28–29 specifies INDEX(normalized_name), not UNIQUE. Duplicate normalized names must succeed, including concurrently. Lookup must not assume a single match. No application-only uniqueness or new tax-identifier regime; optional tax uniqueness in database §29 is absent from accepted M02.

PostgreSQL already owns Book name uniqueness, Account name uniqueness within Book, Category root/sibling uniqueness, parent FK/self-parent CHECK, sender identity/default constraints and Rule target FKs/at-least-one-target CHECK. Core owns normalization, lifecycle/immutability, cycle prevention and active/compatible references.

## Financial-usage ownership

M03 enforces guards from its first implementation (ledger §§78–81; domain §§18, 27–29; roadmap §§85–86). T02 implements the T01 FinancialUsageReader port: Book usage by transactions.book_id; Account usage by account_id OR destination_account_id. All historical rows count, including voided rows. Book dependency checks include inactive Accounts. No always-allow scaffold or deferred M04 activation.

These are read-only existence queries against M02 tables, not Transaction behavior. Synthetic fixtures prove them. Future financial writers must take the same Book/Account locks before financial validation/insertion; that is a later integration obligation, not implementation here.

## Rule configuration and runtime

Database §34 explicitly assigns cross-row compatibility and active state to Core. CreateClassificationRule and UpdateClassificationRule validate every non-null target in the effective resulting configuration, including unchanged targets on PATCH and configurations with active=false. Referenced Book/Account/Category/Merchant rows must be active. Resolve owning Books for Account/Category and validate their active context; all Book contexts must agree. Explicit target_book_id remains optional: database §§33–34 permits Account-only, Category-only and Merchant-only targets.

A target archived later does not delete or rewrite the rule. Subsequent PATCH must remove/replace inactive targets while retaining at least one valid target. M03 does not apply rules. Ledger §97/domain §63 runtime avoidance and message matching/precedence belong to M05. Roadmap §§89/93 alias-like matching is represented here by configuration/normalization round trips; actual application remains outside this human-approved scope.

## Shared locking protocol

Use PostgreSQL READ COMMITTED with explicit SELECT ... FOR UPDATE locks on referenced rows, held until commit/rollback, through Core transaction ports and Database adapters. A plain BEGIN/read-check-write/COMMIT does not prevent the race.

1. Discover affected IDs, including old/new references on updates. Lock in total order: Books -> Accounts -> Categories -> Merchants -> Classification Rules -> Authorized Senders; UUID ascending within each kind.
2. Preliminary reads discover IDs only. After locking, re-read current state and merge PATCH. If references changed and the lock set is incomplete, roll back and retry the entire operation with the correct ordered set. Never acquire earlier-ranked locks after later-ranked locks. Bound retries; T05 defines exhaustion mapping.
3. Validate active state, compatibility, dependencies/usage/defaults and hierarchy after locking, using the same transaction connection, then write. READ COMMITTED provides fresh statement snapshots after lock waits.

Participation:

- CreateAccount locks Book before active/currency validation and insert. Book archive/currency update locks that Book before default/dependency checks. Account update/archive locks Book then Account. Archive-first prevents a new Account; create-first permits subsequent Book archive absent sender defaults, since Accounts alone are not an archive prohibition.
- Every Category write locks its Book first, a per-Book hierarchy mutex. Reparenting traverses current ancestors after that lock and rejects reaching the moving category. Lock affected Category rows in UUID order. This serializes even disjoint moves that could jointly form a cycle. New/changed parent references require active Book/parent.
- Rule configuration locks explicit/derived Book contexts and all target rows before checks. Category/Merchant archive takes the same target locks; Book/Account archive takes its referenced locks. Rule-first may later retain an archived target; archive-first rejects new Rule configuration.
- Sender assignment/removal locks old/new Books and Accounts, then the existing Sender. Book/Account archive takes the same referenced locks before reading defaults. Assignment-first makes archive fail DEFAULT_*_IN_USE; archive-first makes assignment fail *_INACTIVE; removal-first permits archive. Disabling a sender does not clear defaults.
- Configuration usage guards lock Book/Accounts before existence queries. Future Transaction writers must participate before business validation. Concurrent fixture inserts also exercise PostgreSQL FK key-share interaction with FOR UPDATE; do not claim an unimplemented financial writer already honors this protocol.

Simple uniqueness remains PostgreSQL's responsibility. No global Merchant creation lock, Redis authority, migration or isolation-level change. Get/list need no write locks.

## Acceptance and test strategy

- [ ] Core unit: normalization/raw preservation; four-entity archive lifecycle versus active-only entities; immutable fields; hierarchy/cycles; rule context/active targets; sender defaults.
- [ ] PostgreSQL through Core ports/use cases: CRUD and accepted M02 constraints; actual historical usage guards including transfer destination and voided rows; preserved archive history; concurrent duplicate Merchant success.
- [ ] Two independent connections with barriers: both orders of archive/reference/default operations; Book currency/CreateAccount; Rule/archive; concurrent Category moves. Assert final invariants and bounded completion, not sleep-based luck.
- [ ] T02 uses synthetic sender rows/minimal reader and passes before T04 implementation.
- [ ] API: all 24 frozen routes; deterministic T05 statuses/codes; unknown/server-controlled field rejection; exact admin scope behavior; PATCH reparenting.
- [ ] Existing 35 unit/74 integration baseline remains green with new tests actually discovered. Never use finance_hub_prod.
- [ ] Synthetic bootstrap through use cases/API demonstrates configurable seed data (roadmap §§91–93); no hardcoded Production migration and no live Lab execution.

Future commands: pnpm test; pnpm test:integration:postgres; pnpm lint; pnpm format:check; pnpm build; pnpm typecheck, in the accepted native-WSL local/test environment after authorization.

## Original planning boundaries and remaining review (historical)

Only PROJECT_STATE.md and these six M03 documents may change now. No source/tests/migrations/SQL/packages/lockfiles/configs/ADRs/frozen changes, M04–M08 behavior, Gate 0, VPS/Lab/Production activity, commit or push. No Transaction creation/calculation/Money/human_ref/Last/idempotency/audit, Inbox/parser/confirmation/AI, WhatsApp, refunds/void, reports/export.

Future file ownership is listed in each task, not authorized now. Workspace manifests do not yet declare all prospective Core consumer dependencies. Necessary package wiring must be explicitly included in later implementation authorization, without upgrades; do not evade this using cross-package relative imports.

Frozen documents do not enumerate every PATCH field/status. T05 records deterministic bounded interpretations, also used for normalization details and reparenting. No demonstrated schema/frozen blocker was found; human review of these interpretations and future wiring scope remains pending.

## Original planning correction verification (historical)

Executed for this documentation correction on 2026-10-20:

- git status --short: modified PROJECT_STATE.md; untracked docs/tasks/active/ directory.
- git status --short --untracked-files=all: exactly PROJECT_STATE.md and M03-OVERVIEW.md/M03-T01.md through M03-T05.md; no outside-allowlist path.
- git diff --name-only: PROJECT_STATE.md only. The six planning documents remain untracked, so this command alone does not cover them.
- git diff --check: PASS, no whitespace errors.
- git diff --name-only -- docs/frozen: empty; frozen documentation unchanged.
- Additional explicit checks cover all seven allowed paths, the untracked documents' whitespace and PLANNING/PLANNED/NOT STARTED state markers.

Application tests were not run for this documentation-only pass. No source, tests, migrations, SQL, packages, lockfiles, configs or ADRs changed; no live infrastructure, commit or push. M03 remains PLANNING; implementation NOT STARTED; T01–T05 PLANNED; M04 NOT STARTED; Gate 0 NOT EXECUTED. Stop for human review.

## M03-T02 accepted closure ? 2026-10-20

M03 remains IN PROGRESS. M03-T01 and M03-T02 are DONE; M03-T03, M03-T04 and M03-T05 remain PLANNED. T02 record: [completed/M03-T02.md](../completed/M03-T02.md).

Human-accepted evidence: unit 9 files / 102 tests PASS; integration 9 files / 100 tests PASS; T02-specific integration 26 tests PASS; concurrency/race scenarios PASS; build, typecheck, lint and T02 formatting PASS. These suites were not rerun during closure hygiene.

Final hygiene verification: pnpm-lock.yaml has only three importer changes (11 insertions / 1 deletion), reusing existing package/snapshot entries. Native WSL Node 24.22.0 / pnpm 12.3.4: pnpm install --frozen-lockfile PASS; exact package dependency consistency PASS. Cleanup changes only the lockfile, PROJECT_STATE.md, this overview and the moved/completed T02 record. No source/test files were written during cleanup; their Git status entries match the initial status. Git diff --check PASS; frozen and migration diffs empty. No migration or security impact; no remaining T02 issues. M02 records and T03/T04/T05 contracts untouched. T03 not started; no commit, push or live infrastructure activity.
