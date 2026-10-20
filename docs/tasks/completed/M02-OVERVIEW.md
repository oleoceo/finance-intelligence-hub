# M02 — Database Foundation: completed milestone record

**Status:** DONE  
**Milestone state:** DONE  
**Implementation:** COMPLETED AND ACCEPTED  
**Approval:** Human accepted M02 and T01-T05 on 2026-10-20. Documentation/state closure only; no M03 implementation, Gate 0, VPS/Lab/Production activity, commit or push.

## Authority and baseline

Read AGENTS.md, PROJECT_STATE.md, this overview, and the selected task before future work. The current human instruction accepts the implementation and authorizes documentation/state closure only. Planning rationale and original implementation boundaries below are retained as historical context.

Planning sources: docs/frozen/FINAL-FREEZE-DECISIONS.md; frozen 00-PROJECT-BLUEPRINT.md, 01-MVP-REQUIREMENTS.md, 02-DOMAIN-MODEL.md, 03-ARCHITECTURE.md, 04-DATABASE.md, 05-API-CONTRACTS.md, 07-SECURITY.md, and 09-ROADMAP-TESTS.md; accepted ADR-001 (stack) and ADR-002 (UUID). ADR-003 remains OPEN and supplies no VPS authorization.

M01 is DONE by current human instruction. M02 and T01-T05 are DONE, completed and accepted. M03 is the NEXT ALLOWED MILESTONE; implementation remains NOT STARTED. At the original planning preflight, the active-task directory was absent; completed M01-T07/T08/T09 and existing source/tests supply migration/testing conventions, not a new milestone decision.

## Milestone boundary established before decomposition

09-ROADMAP-TESTS.md §§59–82 explicitly assigns all thirteen V0.1 tables to M02. This is stronger evidence than merely observing that a future feature needs persistence. 04-DATABASE.md §11 lists the same physical set. Therefore Inbox, Interpretation, Confirmation, linked Refund fields, Audit, Idempotency, and Outbox structure belong in the foundation even though their behavior comes later. An empty Outbox is expressly permitted by database §94 and ledger §19; its creation does not authorize event emission or a worker.

Conversely, database §12 and domain §§241–242 exclude future tables. No merchant aliases, products, brands, variants, packages, items, prices, promotions, receipts, attachments, vehicles, fuel, installments, recurrence, reconciliation, external mappings, budgets, tags, or other future-domain tables are planned. Reports are queries over canonical records, not new reporting tables/views/materializations in M02. Refund/Correction/Void are not additional tables.

| Schema object | M02 structural owner | Later behavioral owner |
| --- | --- | --- |
| books | T01: columns, keys, currency and archive constraints | M03 configuration/archive/immutability; M04 validation; M08 report context |
| accounts | T01: Book/currency FKs, names, archive/type checks | M03 configuration/defaults; M04 financial use; M07 refund destination validation |
| categories | T01: Book hierarchy, self-parent check, scoped name uniqueness | M03 normalization and longer-cycle prevention; M04 classification validity |
| merchants | T01: global counterparties and name lookup | M03 configuration/archive; M05 rule-based recognition |
| classification_rules | T01: targets, active, checks and lookup indexes | M03 configuration/compatibility; M05 precedence and matching |
| authorized_senders | T01: identity and default relationships | M03 configuration/active-default protection; M05 pre-persistence authorization; M06 transport security |
| inbox_messages | T02: source identity, sender FK, lifecycle metadata | M05 authorize-before-raw, retries/reclaim and processing; M06 webhook retry integration |
| interpretations | T02: attempts and parser metadata | M05 parser; M07 correction/void/refund intents; M08 summary intent execution |
| confirmation_sessions | T02: durable sessions, origin/resolution FKs, pending uniqueness | M05 TTL/resolution/supersede; M07 destructive-action/version safety |
| transactions | T03: full V0.1 shape, linked refund/void/version fields, financial indexes | M04 create/read/list/Last; M07 Correction/Void/Refund and concurrency; M08 Summary/CSV |
| audit_events | T04: history storage/indexes; T05 runtime permissions | M04 atomic create audit; M07 lifecycle audit; M08 operational inspection |
| idempotency_keys | T04: PostgreSQL identity, response and completion storage | M04 create replay/conflict coordination; M07 Void/Refund replay |
| outbox_events | T04: empty durable integration structure | Only a real consumer/integration authorizes emission; future M10 Firefly is documented, not M02 or automatic M06 work |
| Three database roles and Finance grants | T05: reproducible preparation and isolated verification | Explicit infrastructure task for shared VPS installation; M09 recovery; future read-only analytics |
| Kysely history/lock metadata | Existing M01 tooling, verified by each task | No new business ownership or duplicate migration mechanism |

M06 owns WhatsApp transport for Expense/Income/Transfer/Last, not Summary. M08 owns Summary/CSV/operations and WhatsApp Summary. None of these structures implies M03–M08 functionality has started.

## Task boundaries and dependency order

| Task | Boundary rationale | Accepted migration |
| --- | --- | --- |
| [M02-T01](M02-T01.md): Master data and sender structure | Establish configuration identities and composite keys together | 002_master_data.ts |
| [M02-T02](M02-T02.md): Inbox, interpretation and confirmation structure | Complete ingestion relationships before Transactions reference Inbox | 003_ingestion_structure.ts |
| [M02-T03](M02-T03.md): Transaction structure and financial constraints | One coherent financial row shape with all FK targets available | 004_transaction_structure.ts |
| [M02-T04](M02-T04.md): Audit, idempotency and outbox structure | Supporting persistence separated from financial orchestration; joint rollback evidence | 005_audit_idempotency_outbox.ts |
| [M02-T05](M02-T05.md): Database roles and foundation verification | Least privilege and assembled-foundation verification without feature implementation | None; versioned role bootstrap is separate |

Execution graph: **human approval → T01 → T02 → T03 → T04 → T05**.

T03 structurally depends on T01 and T02. T04 tables have no polymorphic FKs to T03, but its atomicity verification depends on T03. T05 verifies every slice. Role bootstrap can establish the migration identity before applying the full chain during its tests, then apply/verify grants against the assembled schema.

## Shared migration contract

- The sole canonical source directory is **packages/database/migrations/**. Preserve **001_technical_validation.ts** unchanged and continue at **002**. Do not create database/migrations/, restart at 001, edit applied migrations, or introduce another runner.
- Reuse Kysely Migrator and the existing provider. packages/database/dist/migrations/ is compiled output, not a competing source directory. Source/Vitest and compiled CLI must discover the same ordered migration names.
- Accepted sequence: 001 existing no-op; 002 T01; 003 T02; 004 T03; 005 T04. T05 consumes no sequence number. Reconcile any changed baseline with the reviewer before implementation; never overwrite existing migrations.
- Each migration has up/down. Test empty-database application, upgrade from the preceding migration with synthetic rows retained, repeat-up no-op, history/status, failure propagation, reverse rollback and reapply. Implementation and verification are complete and accepted; this contract records their scope.
- Roll back in reverse dependency order, dropping only slice-owned objects. No broad CASCADE to hide ordering mistakes. Down drops lose data and are tested only against explicitly disposable databases. Production rollback requires review, backup, Lab validation, recovery planning and separate approval.
- UUID identifiers use PostgreSQL UUID and application-layer uuid.v7() per ADR-002; no extension, database generator, or new ID strategy. Technical timestamps use TIMESTAMPTZ. Preserve physical column lengths/nullability/defaults from the sections cited in each task.
- Financial references preserve history through restrictive deletion, not destructive cascades. Do not add active to historical FKs, business triggers, undocumented enums, convenience columns, indexes or lifecycle states.

## Frozen invariants and enforcement split

PostgreSQL is canonical. Money is NUMERIC(18,2), preserved as decimal strings through pg/API boundaries; never convert canonical money to JavaScript Number. M04 owns the Money value object and API validation. Financial date is transaction_date DATE; no occurred_at or separate financial time field. Transaction types are exactly expense|income|transfer; statuses exactly posted|voided. Refund is income plus refund_of_transaction_id. Composite FKs reinforce Book = Account = Transaction currency, with no FX or cross-Book transfer. Last uses posted rows ordered by created_at DESC, id DESC.

ClassificationRule uses active. Confirmation statuses are pending|confirmed|cancelled|expired; superseded is cancellation with a reason. PostgreSQL owns idempotency, with in_progress|completed and no automatic expiry.

M02 proves row-local checks, FKs, uniqueness and persistence. M03 owns longer category cycles, active defaults, normalization, lifecycle immutability and rule compatibility. M04 owns active-entity/new-transaction validation, future-date validation, API idempotency and audit orchestration. M05 owns authorization before raw persistence and retry/confirmation behavior. M07 owns posted-Expense refund targeting, no refund-of-refund, refund dates/totals/concurrency, correction protections and blocking Void while posted refunds exist. These remain mandatory later tests; do not implement cross-row business CHECKs or claim schema tests prove them.

## Verification and evidence

Reuse Node 24, pnpm 12.3.4, Vitest, **Testcontainers 12.2.0**, **postgres:18.6-bookworm**, vitest.integration.config.ts, vitest.setup.ts, and existing CI. New integration tests belong under tests/integration/ and must be discovered by the existing command. No alternate runner or dependency upgrades. Preserve the production guard for DATABASE_URL and PGDATABASE; never connect to finance_hub_prod. Use synthetic data and controlled disposable containers only.

Required verification commands: pnpm lint; pnpm format:check; pnpm build; pnpm typecheck; pnpm test; pnpm test:integration:postgres. Exercise pnpm --filter @finance-hub/database migrate:status, migrate:up, and migrate:down with isolated test configuration; never print connection strings. The original planning pass claimed no runtime verification. Current correction evidence is recorded in [M02-CORRECTION-REPORT.md](../active/M02-CORRECTION-REPORT.md).

Each implementation report must identify files changed, acceptance cases executed, exact commands/results, migration names/status, rollback/reapply evidence, security impact, documentation/state updates, and remaining issues. Assert relevant PostgreSQL constraint/SQLSTATE failures, not merely any exception. Include positive/negative cases, NULL branches, UPDATE and INSERT paths.

The original migration tests assumed one migration. The correction verifies the exact prefixed 001?005 chain, isolated failure propagation and down/reapply while preserving M01 guarantees. Existing CI discovers integration/migration tests; no workflow edit is proposed. Hosted CI evidence requires separately authorized publication; no contract authorizes commit/push.

## Milestone acceptance criteria (completed and accepted)

- [x] All thirteen mandated tables have documented columns, relationships, constraints and indexes; future tables are absent.
- [x] The canonical migration sequence continues from unchanged 001, works from empty DB and M01, and is reversible/reapplicable in disposable tests.
- [x] UUIDv7 round trips, NUMERIC precision/string boundaries, DATE and TIMESTAMPTZ metadata are verified.
- [x] Same-Book/currency FKs, category hierarchy, transfer/refund shape, status/void consistency and uniqueness reject invalid data.
- [x] Inbox source-instance identity/metadata, Interpretation attempts, and complete Confirmation fields/pending uniqueness are verified.
- [x] Idempotency states/key uniqueness/completion, Audit structure, and synthetic atomic rollback with optional Outbox are verified; Outbox starts empty.
- [x] Three roles/grants are reproducible; app is non-superuser without DDL authority; runtime cannot mutate old Audit rows; readonly cannot write.
- [x] Production guard, isolation, compiled/source discovery and CI-compatible checks pass with evidence.
- [x] No M03+ use cases/endpoints, production seeds, unnecessary Outbox producer/worker, VPS changes, future tables or redesign.

M02 and T01-T05 are DONE, completed and accepted on 2026-10-20. Functional roadmap: M01 -> M02 -> M03. M03 is the NEXT ALLOWED MILESTONE, implementation NOT STARTED. Gate 0 remains NOT EXECUTED and is a separate infrastructure prerequisite before live VPS/Lab/Production activity; this closure does not authorize it.

## Preserved planning rationale and bounded interpretations

1. **Migration path:** database §98 and architecture §19 illustrate database/migrations/; current human instruction and M01-T07 require packages/database/migrations/. Preserve the established canonical path and continue at 002. No frozen edit.
2. **Outbox timestamp:** domain §198 conceptually lists processed_at; physical database §92 specifies published_at, locked_at and locked_by. Domain §2 delegates physical details to database design. The accepted implementation uses those physical columns without an additional processed_at.
3. **Interpretation vocabulary:** physical design supplies intent, parser_type and status text columns without an exhaustive parser/status CHECK vocabulary. Retain documented VARCHAR fields without inventing enums; M05 owns behavior. Listed intents do not activate M07/M08.
4. **Implicit FKs:** the physical column lists do not restate every FK: Category→Book, sender default Book→Book, Interpretation→Inbox, Confirmation→sender/origin/resolving Inbox. The domain defines these relationships; task contracts make them explicit while preserving nullability. Polymorphic entity/aggregate IDs receive no guessed FKs.
5. **Merchant tax uniqueness:** database §29 makes it conditional on a defined normalization rule. Omit this optional unique index; defer normalization and any conditional adoption to separately scoped work.
6. **Roles versus deployment:** roadmap §§79–82 requires role preparation/non-superuser runtime; ledger §§165–166 requires reproducible bootstrap with external secrets. T05 prepares/tests only in isolation. VPS installation needs separate approval and Gate 0; credentials and live grants are not guessed.
7. **Foundation versus full DoD:** database §§102–106 mentions Core refund/concurrency and Inbox behavior. Roadmap §§83–211 assigns these to later milestones. M02 proves structure, not completed M04/M05/M07 or real-data readiness.
8. **State history:** Planning identified stale current-state statements. Closure now records M01/M02 DONE and M03 next, while preserving unrelated historical M01 evidence.

No demonstrated frozen-architecture blocker was found. These bounded interpretations informed the accepted implementation; they do not authorize new semantics. If implementation exposes uncertainty affecting schema, money, authorization or recovery, stop and report under AGENTS.md.

## Accepted final evidence (2026-10-20)

Human review accepted all thirteen V0.1 tables, constraints/indexes, exact decimal precision and string preservation, DATE/TIMESTAMPTZ, same-Book/currency integrity, structural Transfer/Refund rules, Last ordering, concurrent Confirmation/Idempotency uniqueness, Audit/Idempotency/optional-Outbox atomicity, and empty Outbox after migrations.

- Integration: 8 files, 74 PASS, zero failures/skips/zero-test suites.
- Suites: postgres 2; readiness-postgres 2; migration 11; master-data-schema 23; ingestion-schema 10; transaction-schema 9; system-schema 10; roles-verification 7.
- Unit: 4 files / 35 PASS.
- Static: pnpm install --frozen-lockfile, lint, format:check, build and typecheck PASS.
- Chain: 001_technical_validation -> 002_master_data -> 003_ingestion_structure -> 004_transaction_structure -> 005_audit_idempotency_outbox. Migration 001 is unchanged.
- Empty bootstrap, exact history, no-pending rerun, down/reapply and isolated intentional failure propagation accepted.
- Three least-privilege roles accepted: app Audit SELECT/INSERT only, no Audit UPDATE/DELETE/TRUNCATE; readonly cannot write; migration role applies/down/reapplies the canonical chain; future migration-owner default privileges verified. Bootstrap contains no passwords; both production guards verified.
- No VPS, Lab or Production environment was accessed. This closure did not rerun implementation tests or modify implementation files.
