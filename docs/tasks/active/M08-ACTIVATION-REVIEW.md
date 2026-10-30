# M08 Activation Review — Reports / Export / Operations

**Date:** 2026-10-30 (Brasília)  
**Baseline:** `main@539a210342b8d9235eca176f5070e68ad5b5d786`; [post-merge CI #187](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/41096817778) = completed/SUCCESS on this exact SHA, 2026-10-30 17:20:17 UTC.  
**Authority:** [AGENTS](../../../AGENTS.md), [runner](../../../.agents/skills/finance-hub-task-runner/SKILL.md), [template](../planned/ACTIVATION-REVIEW.md), frozen M08 routing and owner authorization in the 2026-10-30 handoff.  
**Disposition:** no frozen contradiction found; P01–P06 execution contracts prepared for promotion. **Effective ACTIVE only after this documentation PR passes independent review, exact-head CI and merge.** Only P01 is selected next, locally/WSL/CI. No VPS/Lab/live/Production authorization or Gate 0 PASS.

## 1. Sync Gate, dependencies and scope

Authenticated remote `main` and CI #187 match the baseline; PR #56 is merged and the search returned no open PRs at inspection. This is **remote verification only**: local Windows/WSL dirty status and worktrees were not accessed. Poracode MUST separately run `git fetch origin --prune`, inspect/preserve all dirty worktrees and fast-forward safely before P01.

| Dependency | Status | Evidence |
| --- | --- | --- |
| M01–M05 / Gate A | DONE / PASS | [Gate A](../completed/GATE-A.md), accepted integrated baselines |
| M06 | DONE / isolated technical Lab acceptance | [M06 acceptance](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md), PR #41 |
| M07 P01–P06 | DONE / independently reviewed | PRs #44/#46/#48/#50/#52/#54, [M07 overview](M07-OVERVIEW.md) |
| Gate B | **DONE / PASS local + PostgreSQL CI** | [Gate B](../completed/GATE-B.md); PR #56, squash 539a210342b8d9235eca176f5070e68ad5b5d786, exact postmerge CI #187 SUCCESS |
| Gate 0, Gate C, Production | **NOT PASSED / NOT APPROVED** | [Gate 0](../planned/GATE-0.md), M09/Gate C planned |

Frozen route (read, not edited): `01-MVP-REQUIREMENTS.md`, `02-DOMAIN-MODEL.md`, `05-API-CONTRACTS.md`, `06-WHATSAPP-FLOWS.md`, `07-SECURITY.md`, `09-ROADMAP-TESTS.md` and `FINAL-FREEZE-DECISIONS.md`. Frozen API §§67–72 specifies both Summary and CSV routes. This review changes no feature code.

## 2. Assumption delta against real main

| Assumption from M08 PLANNED | Status | Direct code evidence and action |
| --- | --- | --- |
| Summary financial port may already exist | **STALE** | `TransactionReadPort` in `packages/core/src/application/ports/transaction-ports.ts` has `findById/listRefunds/list/getLast` but no aggregate. P01 adds a dedicated read-only Summary port/use case and DB adapter; do not sum paginated lists |
| Correct Refund/Void schema may require changes | **REPLACED** | `packages/database/src/db-types.ts` and `repositories/transaction-read-repository.ts` already expose `refund_of_transaction_id`, `status`, `type`, `transaction_date`, `book_id`, decimal-string `amount`. No new migration |
| Book timezone may need addition | **REPLACED** | `BookRecord.timezone/currency` in `master-data-ports.ts`, `KyselyBookRepository.findById`, and `books.timezone` already exist. Reuse them; do not use server timezone |
| Current list is adequate for reporting | **STALE** | `KyselyTransactionReadRepository.list` paginates default 50/max 100; a report must aggregate **all matching rows** without pagination |
| Summary HTTP route already exists | **STALE** | `apps/api/src/routes/transactions.ts` registers Transaction CRUD/Last/Refund/Audit, not Summary. `apps/api/src/index.ts` composes admin routes, strict schemas, auth and meta; P02 adds the frozen route in the admin tree |
| WhatsApp `resumo` already works | **STALE** | `interpret-message.ts` recognizes the token but returns `unknown/unsupported`; `interpretation-ports.ts` and `process-message.ts` support query_last but not query_summary. P03 adds deterministic read-only intent, Book resolution and presentation using existing Inbox |
| CSV utility or export route already exists | **STALE** | No CSV module/route exists in the inspected repository tree; frozen `GET /api/v1/exports/transactions.csv` is assigned P04. Use existing reads plus deterministic bounded streaming/encoding strategy with no new dependency unless proven necessary |
| Health/readiness need implementation | **REPLACED** | `apps/api/src/index.ts` already has `GET /health`, `GET /ready`, correlation_id, request_id and Pino redaction; `packages/database/src/readiness.ts` uses bounded SELECT 1; P05 is evidence-first verification |
| Ops tests already prove everything | **STALE** | `apps/api/src/health-readiness.test.ts` has mocked success/failure and a slow mock whose assertion does not prove deadline; `tests/integration/readiness-postgres.test.ts` exists. Add targeted missing regression proofs |
| M06 delivery may need new n8n logic | **STILL VALID** | `apps/api/src/routes/inbox.ts` returns `reply.should_send/text/contract`; `present-reply.ts` owns safe text; n8n stays transport-only |
| Gate B is prerequisite; Gate 0 for live | **STILL VALID** | Gate B PASS and exact CI verified; Gate 0 has no formal PASS. No live tests planned |

No `BLOCKER` found for isolated local/CI-only activation. Assumptions about any current VPS state remain unverified and are not needed for M08.

## 3. Executable shared interfaces and period contract

Proposed P01 Core boundary: `SummaryReadPort.getSummary({bookId:string,dateFrom?:string,dateTo?:string}): Promise<{ordinaryIncome:string;grossExpenses:string;refunds:string}>`, returning exact aggregate components, never paginated. `getFinancialSummary({bookId:string,dateFrom?:string,dateTo?:string}, {books:Pick<BookRepository,'findById'>, summaries:SummaryReadPort, now:()=>Date})` validates Book, dates and period; returns Book ID, currency, effective bounds and the five decimal-string values. It derives `netExpenses = grossExpenses - refunds` and `net = ordinaryIncome - netExpenses` by signed integer minor units (`bigint`) or precise PostgreSQL numeric, **never JS float**. Final exported interface names may be adjusted narrowly by P01 if aligned across public APIs and tests.

PostgreSQL summary must filter the **requested Book**, `status='posted'`, financial `transaction_date` not `created_at`, and classify exactly: income + null refund relation = ordinary income; expense = gross expenses; income + non-null refund relation = refunds. Transfer and voided excluded. `SUM(NUMERIC)` must be returned as exact decimal text, with `COALESCE` zero and no row-by-row page truncation. Empty Book/period totals = `0.00` in its own currency. Respect archived Book history (do not silently remove posted historical rows); unauthorized API access remains forbidden.

Dates: strict valid `YYYY-MM-DD` Book-local calendar dates; explicit `date_from` and `date_to` individually form inclusive lower/upper predicates, following existing Transaction list filters. If **both omitted**, effective window is first through last calendar day of the **current Book-local month**, using `now()` in `Book.timezone`. If only one supplied, the other predicate is open (no invented interval) as in existing list semantics. Reject `date_from > date_to` and impossible dates. `transaction_date` is PostgreSQL DATE; do not convert explicit Book-local DATE values through UTC midnight. Test DST zones, leap year, timezone boundary where UTC month differs, end-of-day and corrected/refunded dates. Do not introduce new schema/time columns.

Frozen API Summary: `GET /api/v1/reports/summary?book_id=UUID[&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD]`, scope `finance:admin`; strict TypeBox; `data: {book_id,currency,ordinary_income,gross_expenses,refunds,net_expenses,net}` plus existing `meta: {request_id,correlation_id}`, 200; 422 invalid request/range, 404 missing Book, 401/403 invalid scope, 503 DB unavailable. No pagination. No `Idempotency-Key` for GET and no financial writes.

Frozen CSV: `GET /api/v1/exports/transactions.csv`, required Book, optional period, admin-only. Export deterministic historical Transaction rows (including status and refund link for reconciliation) for matching Book/date interval; default same Book-local current month as Summary; align existing read semantics rather than inventing a new Transaction type. Include stable columns sufficient to identify posted/voided, ordinary income/refund, transfer and date; use exact decimal strings. Specify `text/csv; charset=utf-8`, safe `Content-Disposition: attachment`, correct UTF-8 RFC4180 quoting, quote escaping and CRLF; sanitize user-controlled cell values beginning with `=`, `+`, `-`, `@`, TAB or CR (including leading whitespace bypasses) by an apostrophe or tested safe equivalent before quoting. No unbounded in-memory request or ad-hoc pagination that changes export completeness; choose bounded scan/stream in P04 and test large exports. Do not execute CSV cells as formulas.

## 4. WhatsApp integration and financial/security guards

P03 extends `Interpretation` with `query_summary` and an optional explicit Book string; only standalone `resumo`, `resumo pessoal`, `resumo empresa` are supported initially, resolving names **against data** (`normalizedName`), not hardcoded Book IDs/enums. Reuse `resolveInterpretation` configuration snapshot, active AuthorizedSender/default Book and existing clarification when explicit Book is missing/ambiguous/invalid. Read-only Summary is computed in the established outer Inbox transaction, then Inbox marked `processed` atomically with interpretation/result; messages duplicated by identity never run a second query/effect. No ConfirmationSession required for clear read-only Summary; do not disturb pending financial confirmations or reorder their locks.

Extend `InboxProcessingResult`, `presentInboxReply`, API `replyFor`, and existing `data.result` with `query_summary`. Reply follows frozen five figures + context + period in pt-BR, amount formatting from exact decimals, safe 500-code-point bound, no leak of sensitive identifiers, no calculation in n8n or Evolution. Preserve M06 native 124 transport, simulated 25 acceptance and synthetic 2 leak regression suites, plus M07 Inbox/confirmation/lock tests. No extra user-facing messages on duplicate provider redelivery.

`finance:admin` is required for direct Summary/CSV; `finance:ingest` can only ingest and authorized sender validation precedes raw Inbox persistence. No client-supplied source, privilege, default Book override or financial operation outside existing trust boundary. Reports are read-only: no new audit event, idempotency financial key or write lock required. Do not change M07 locking order; should the P03 flow need configuration/session/Inbox locks, preserve accepted discovery → configuration locks → sender/session/Inbox ordering. Do not log raw WhatsApp messages, credentials, DB URL or CSV contents.

## 5. P01–P06 contracts, CI and acceptance

| Task | Execution contract | Dependency | Tests/gate |
| --- | --- | --- | --- |
| [P01](M08-P01.md) | Summary Core + precise PostgreSQL query, timezone and signed exact output | This reviewed activation | Unit money/formulas/calendar + real PG mixed rows, Book isolation |
| [P02](M08-P02.md) | Admin Summary HTTP, strict schema/meta/errors/auth | P01 DONE/merged | API 200/401/403/404/422/503, date/default, strict responses |
| [P03](M08-P03.md) | WhatsApp parse/resolution/Inbox read-only Summary/reply | P02 DONE/merged | unit parser/reply + real PG Inbox auth/retry/duplicate/Book/default |
| [P04](M08-P04.md) | CSV admin export hardened against spreadsheet formulas | P03 DONE/merged | CSV and real PG export, negative payloads, Summary reconciliation |
| [P05](M08-P05.md) | Evidence-based health/readiness/logs/redaction verification | P04 DONE/merged | DB fail/timeout/nonleak, IDs/error code, M06 regressions |
| [P06](M08-P06.md) | Frozen M08 E2E and regression acceptance | P05 DONE/merged | 5 values parity API/WhatsApp/CSV, timezones, auth, full CI |

Each linked task specifies allowlist, blocked paths, exact tests and closure. Frozen paths, schema migrations, external dependencies, package/lockfile, VPS and deployment are excluded from this document-only PR. P01–P06 are **sequential**, not permission to implement all simultaneously.

After every P-task: Poracode native WSL Sync Gate + frozen install, lint, format check, build, typecheck, unit, real PostgreSQL integration, applicable native M06 regressions and diff check; Draft PR; independent diff/CI review on exact head; conditional squash with `expected_head_sha`; verify postmerge SHA/CI and documentary closure before next task. Do not claim a new test total from baseline #187.

## 6. Approval, promotion, forbidden scope

Approval boundary: owner explicitly authorized M08 Activation Review, P01–P06 contracts, remote documentary PR and conditional merges in 2026-10-30 handoff, **not implementation from PLANNED**. This review accepts only those already frozen milestones and bounded technical deltas, not new business/security/architecture decisions. Activation becomes effective on reviewed documentary PR merge, and the selected next implementation task is **M08-P01 only**. Individual later tasks remain gated on accepted predecessors; executor PRs remain Draft until coordinator review.

No dashboards/Metabase, M09 backups, new Transaction types/statuses, floating-point money, new migrations/dependencies, wholesale code refactors, real WhatsApp tests, VPS, secrets, CI secret changes, production, Gate 0 PASS or Gate C PASS. A newly discovered material contradiction must halt that bounded implementation and be escalated without altering frozen decisions.

**Independent review checklist for this Draft PR:** correct source paths and frozen citations; no new financial business rules; no unsupported live claims; overview + state consistent; task-level allowlists/tests/sequence; diff documentation only; exact PR head CI SUCCESS; no unresolved threads. No claim of independent REVIEW PASS or CI on this PR until observed.
