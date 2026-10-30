# M07 Activation Review — ACCEPTED

**Status:** ACCEPTED — project owner approved activation and local-only M07-P01 continuation on 2026-10-29; this review contains no feature implementation.
**Date:** 2026-10-29.
**Authoritative main:** `645ea0193188be54ec5c9e0d988ec6348b0038ef`.
**Forward plan:** [M07 overview](M07-OVERVIEW.md).
**Template:** [Activation Review](../planned/ACTIVATION-REVIEW.md).
**Reviewer/approver:** project owner, explicit approval 2026-10-29 after independent REVIEW PASS of PR #42 head `3bbdc4705f72fb0255f80778639f20b620ff2b02`, CI 40963187248 SUCCESS; squash `18dd52a619c0b93ebb14d8b2a4c5335205284c10`.
**Implementation authorized:** M07-P01 only, local/WSL/CI after documentary promotion; P02–P06 require separate authorization; no VPS/Lab/Production actions.

## 1. Upstream completion and Sync Gate

`git fetch origin --prune` confirmed the requested baseline. Windows main was
fast-forwarded from `760612b`; branch `m07-activation-review` starts at that
baseline. Untracked `GATE0_M06_PORACODE.md` and `INFRA-T01-REVIEW-LOCAL.md`
were preserved and excluded. Existing WSL main-sync, runtime and live-validation
copies contain prior work and were not reset. A separate native WSL checkout
`/home/leoceo/src/m07-activation-review` was aligned to the same SHA.
Obsolete linked-worktree metadata was not pruned or repaired as part of this task.

| Prerequisite | Result | Evidence |
| --- | --- | --- |
| M04 / Gate A | DONE / PASS | [M04 overview](../completed/M04-OVERVIEW.md); final squash `fed42a75a4f41eadec9e1e8ede0f41a5354b18ef`, post-merge CI 39836071361 SUCCESS |
| M05 | DONE | [M05 overview](../completed/M05-OVERVIEW.md); P06 PR #24 squash `ca3527514df52d302746de2c779934099a98b473`, CI 40596736837 SUCCESS |
| M06 | DONE, owner accepted isolated Lab | [M06 overview](../completed/M06-OVERVIEW.md), [sanitized live evidence](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md) |
| M06 closure integration | PR #41 MERGED | Squash equals authoritative main above; [post-merge CI 40943150391](https://github.com/oleoceo/finance-intelligence-hub/actions/runs/40943150391) independently checked: completed / SUCCESS on that exact SHA |
| Gate 0 / Production | No formal PASS / no acceptance | Not a prerequisite for this local/CI-only review or local implementation; no live authorization inferred |

Regression baseline from that run: 39 unit files / 1,023 tests; 26 PostgreSQL
integration files / 453 tests; native M06 transport 124 tests; M06 simulated
five-command acceptance 1 file / 25 tests. These are upstream results, not new
M07 tests. The same existing CI workflow must validate the eventual PR head.

## 2. Original assumptions and concrete deltas

| Forward-plan assumption | Classification and evidence | Bounded action |
| --- | --- | --- |
| Transaction ports might already support mutation | Replaced by concrete create/read-only ports | P01 adds versioned update and locking capabilities; P02 adds Void; P03 dedicated Refund insertion |
| Version might need a migration | Replaced: record, mapper, API serializer and migration 004 already carry version, default 1 | Reuse column; compare expected version and increment on actual Correction/Void |
| Refund/Void schema might be missing | Replaced: migration 004 has relation, void fields, composite Book/currency FKs and refund/status index | No new migration |
| Audit can be reused unchanged | Stale: writer persists JSON, but Core action union is only TRANSACTION_CREATED and oldData is typed null | Extend bounded action union and before/after snapshot type in P01–P03 |
| Idempotency can be reused unchanged | Stale: PostgreSQL claim/replay exists, but scope and fingerprint are create-specific | Add operation scopes and target/version-aware fingerprints; preserve create scope and replay behavior |
| Confirmation target tracking exists | Still valid: session ports/schema/adapter persist targetEntityId/targetVersion | Reuse fields; add actual freshness validation and mutation dispatch in P05 |
| Confirmation already executes mutations | Stale: Interpretation/ResolutionResult and process-message currently dispatch create/last only | Extend deterministic interpretation/resolution and caller-owned execution, not a parallel pipeline |
| Finalization already proves every financial effect | Stale: finalizeConfirmed checks existence only for create_transaction | P05 must prove each mutation effect and audit before terminal session/original/resolver Inbox completion |
| Concurrent Refund locking remains undecided | Resolved by existing PostgreSQL context and frozen original-Expense lock requirement | Row locks on original Expense; common ordering below, no new lock service |

No frozen contradiction or schema blocker was found. Frozen documents remain
unchanged. Existing comments claiming adapters are stubs are not authoritative;
executable adapters and accepted tests were inspected.

## 3. Exact interfaces and surfaces available

All paths below are repository relative.

- `packages/core/src/application/ports/transaction-ports.ts`:
  `TransactionRecord` includes amount as decimal string, version, refund relation,
  void metadata and immutable identity/provenance. `TransactionRepository` has
  `create(input): Promise<TransactionRecord | null>`, `findById(id)`,
  `findByHumanRef(humanRef)`; no update, Void, Refund insertion or row-lock method.
  `TransactionReadPort` has findById/list/getLast; Last uses posted creation order.
- `packages/core/src/application/ports/financial-transaction-port.ts`:
  `FinancialTransactionPort.runInTransaction<T>(fn)` supplies repositories,
  configuration locks, idempotency and audit. `InboxProcessingPort.runInboxTransaction<T>(fn)`
  extends that context with sessions, Inbox, interpretation and reads.
- `packages/database/src/transaction/financial-transaction.ts`:
  `KyselyFinancialTransactionPort` implements both ports on one Kysely transaction;
  three bounded attempts handle changed configuration lock sets, idempotency
  in-progress, PostgreSQL deadlock and lock timeout. Do not nest independent commits.
- `packages/core/src/application/finance/create-transaction.ts`:
  `GenericCreateTransaction.executeInContext(input, key, requestContext, ctx, provenance?)`
  demonstrates atomic write/audit/idempotency and trusted WhatsApp provenance.
  `transactionSnapshot(record)` is the existing JSON-safe representation.
- `packages/core/src/application/finance/idempotency.ts` and
  `ports/idempotency-ports.ts`: validateIdempotencyKey, canonicalJson,
  decideExistingIdempotency; repository create/complete/findByKeyAndScopeForUpdate.
  Scope currently `transactions:create`; create fingerprint cannot be reused
  unchanged for mutations.
- `packages/core/src/application/ports/audit-ports.ts` and
  `packages/database/src/repositories/audit-writer.ts`: AuditWriter.write persists
  old/new JSON in the outer transaction. Add frozen TRANSACTION_UPDATED,
  TRANSACTION_VOIDED, TRANSACTION_REFUND_CREATED where each operation is implemented.
- `packages/core/src/application/ports/confirmation-ports.ts`:
  NewConfirmationSession accepts targetEntityType/targetEntityId/targetVersion;
  create, advanceChoice, resolveReply, expire, supersede, finalizeConfirmed share
  caller transaction. advanceChoice currently cannot update target fields:
  P05 must bind a selected target/version atomically when a choice identifies it.
- `packages/database/src/repositories/confirmation-session-repository.ts`:
  sender → pending session → original Inbox → resolver Inbox lock order, fenced
  resolver claim, terminal Inbox propagation. Preserve ownership and expiration.
- `packages/core/src/application/inbox/process-message.ts`: initial Inbox claim
  is committed separately; interpretation, execution, audit and completion share
  the financial transaction; errors use a separate fenced failure transition.
  Reuse source + source_instance + source_message_id identity.
- `apps/api/src/routes/transactions.ts`, `schemas/transactions.ts`,
  `middleware/auth.ts`, `middleware/errors.ts`, `index.ts`: reuse API composition,
  strict schemas, serialization, trusted provenance and admin authorization.
  Existing routes are create/read only.
- Migrations 003/004/005 and `packages/database/src/db-types.ts` already provide
  sessions/Inbox, Transaction mutation fields, append-only audit, persistent
  idempotency and required indexes. Audit action/scope are varchar, not DB enums.
- Existing `domain/finance/money.ts`, transaction validation, UUIDv7/human-ref
  generation and public package exports remain the baseline (ADR-001/002).
- Tests reuse `tests/integration/schema-helpers.ts`,
  `tests/integration/repositories/t02-fixtures.ts`, `t04-fixtures.ts` and the
  independent-backend/barrier pattern in `tests/integration/helpers/financial-create-race.ts`.
  Extend this infrastructure; do not build another harness.

## 4. Execution task decomposition and required proof

| Task | Deliverable | Dependency | Required proof |
| --- | --- | --- | --- |
| [M07-P01](../completed/M07-P01.md) | Correction API/Core/adapter, optimistic version, audit, refund-aware guards | Approved activation and P01 authorization | Mutable/immutable inputs, PostgreSQL competing PATCH, rollback and posted-refund floor/date |
| [M07-P02](../completed/M07-P02.md) | Void API/Core/adapter, idempotency, audit | P01 accepted/integrated | Replay/conflict, stale version, posted-refund block, Refund Void |
| [M07-P03](../completed/M07-P03.md) | Dedicated Refund create and invariant protection | P02 accepted/integrated | Partial/full/multiple, same Book/currency, original lock, duplicate replay |
| [M07-P04](../completed/M07-P04.md) | Cross-operation concurrency proof and bounded corrections | P03 accepted/integrated | Refund/Refund, Refund/PATCH, Refund/Void, Refund-Void races with real independent connections |
| [M07-P05](../completed/M07-P05.md) | WhatsApp mutation interpretation and ConfirmationSession integration | P04 accepted/integrated | Explicit confirmation, captured target/version, stale rejection, atomic Inbox/audit/effect and duplicate replies |
| [M07-P06](M07-P06.md) | Administrative Refund/audit GETs and end-to-end milestone acceptance | P05 accepted/integrated | Both frozen read routes, scope/schema/response tests, exact critical sequence, regression CI and review evidence |

Each linked contract defines its allowed paths, routing, invariants, acceptance and
tests. P04 consolidates adversarial proof; it does NOT defer safety from P01–P03.
Each financial mutation endpoint must be safe when introduced. P06 implements
the frozen `GET /api/v1/transactions/{id}/refunds` and
`GET /api/v1/transactions/{id}/audit` as `finance:admin` reads and verifies
mutation wiring already delivered by P01–P05.

## 5. Locking, financial and security contract

Proposed implementation protocol, bounded by existing M03/M05 order:

1. Preliminary reads discover IDs only. Acquire complete configuration locks:
   Books → Accounts → Categories → Merchants → Rules → AuthorizedSenders;
   ascending UUID within rank. Include unchanged references needed for effective
   PATCH/Transfer validation. Re-read authoritative state; changed reference sets
   restart the entire transaction via existing bounded retry.
2. For confirmed Inbox work preserve sender → pending session → original Inbox →
   resolver Inbox ordering, after configuration. Do not prelock Inbox rows or
   acquire earlier configuration locks after session/Inbox locks.
3. Claim/lock mutation idempotency before financial row locks; API must acquire
   configuration first too. Mutation scopes are separate from create, and trusted
   Inbox keys derive from original Inbox/action, not reply message or user text.
   PATCH API needs version, not an invented required Idempotency-Key header.
4. Lock original Expense before reading posted Refund aggregate or mutating it.
   Refund Void locks its original Expense before its own row; all paths use that
   order (including Corrections and Voids). Ordinary targets lock their own row.
   No path holding a financial row may later acquire configuration/session/Inbox
   locks. Finalization may reuse already-held locks.
5. Re-read target/status/version and posted Refund amounts/dates under locks.
   Conditional update checks expected version; successful Correction/Void increments
   version once. Refund creation checks the expected original version and current
   refundable amount; it creates a new version-1 linked Income, without inventing
   an original Expense value correction. Aggregate validity is never inferred from
   version alone.
6. Commit effect, append-only audit, idempotency completion and applicable session/
   Inbox terminal changes together. Replay uses stored logical response before
   stale/status rejection, so successful retries do not fail on their own mutation.
   Rejected writes leave no partial financial/audit/idempotency state.

Money remains positive exact NUMERIC(18,2)/decimal strings. Book/account/transaction
currency agrees; no FX/cross-Book transfer. Preserve Transfer's unchanged destination,
different accounts and null category/merchant constraints. No Refund PATCH;
no Refund-of-Refund; no amount below posted-refund sum or original date after any
posted Refund; no Void of an Expense with posted Refunds. Financial date remains
transaction_date, never occurred_at, and no future posted date in Book timezone.

Mutation API requires finance:admin. finance:ingest only accesses ingestion;
sender authorization precedes raw persistence and is rechecked before effect.
Preserve creator provenance on Correction/Void; audit records the current trusted
actor/source. No secrets, real messages or live IDs in synthetic fixtures.
No Outbox event without a configured consumer.

## 6. Forbidden scope and impact

No implementation in this PR. No VPS, Lab, Production, Evolution, n8n deployment,
real data, merge, M08 reports/CSV, M09 recovery, AI provider, new transaction types,
architecture redesign, generic repository framework or unrelated refactoring.
The two frozen Transaction GET endpoints are explicitly assigned to P06;
M08 reports/CSV remain excluded. Their implementation and tests occur only
after activation and separate P06 authorization.

New migrations: NO. New dependencies: NO. Package manifests and lockfile: unchanged.
Existing public exports may be extended only during authorized implementation.
Security behavior is unchanged by these documents; P06 must test `finance:admin`
for both reads, reject `finance:ingest`, and preserve sender/provenance boundaries.

## 7. Gates and critical scenario

Gate A PASS is the upstream prerequisite. Gate 0 has no formal PASS and does not
authorize live activity. Gate B depends on accepted M07 output; it is not granted
by this review. Gate C remains later. M07 local/CI acceptance is separate from any
future live approval or Production homologation.

Mandatory in P06, per 09-ROADMAP-TESTS §186 (Gate B critical scenario)
and the approved forward plan:

```text
Expense 500
→ Refund 200
→ correction to 450: VALID (450 >= 200)
→ correction to 100: INVALID (100 < 200 posted refunds)
→ Void Expense: INVALID (has posted Refund)
→ Void Refund: VALID
→ Void Expense: VALID (Refund now voided)
```

Assert exact persisted amounts, statuses, version changes, relation and audit after
each step, not just HTTP success. Failed operations produce no financial side effect.

## 8. Review validation and approval

Applicable local checks: scope/whitespace, relative Markdown links, contract
completeness, forbidden-path diff and semantic state consistency. Markdown is
excluded by repository .prettierignore; inspect the new documents separately.
No local application suite is required solely for this documentation change.
Existing full GitHub CI remains required on the exact Draft PR head; report its
run/SHA/results in the PR and handoff. Do not reuse baseline CI as PR-head evidence.

- [x] Forward plan and concrete assumption delta accepted.
- [x] P01–P06 boundaries, dependencies, lock protocol and tests approved.
- [x] Forbidden scope and gate dependencies confirmed.
- [x] Promotion to ACTIVE approved.
- [x] M07-P01 implementation explicitly authorized.

Approver/date: project owner / 2026-10-29. M07 Activation Review accepted and PR #42 squash-merged. Approved promotion places the overview, this review and six contracts under active; only P01 is authorized for local implementation. Gate 0 remains without formal PASS.

## 9. Promotion and minimal P01 handoff

After approval, move overview and six finalized contracts to active, record the
accepted Activation Review SHA/date, and update PROJECT_STATE. Retain relative
links or repair them together. Keep this review linked as acceptance evidence.
No repeated planning or generic audit is required.

Handoff: previous milestone M06 DONE; closure PR #41; squash/main
`645ea0193188be54ec5c9e0d988ec6348b0038ef`; post-merge CI 40943150391 SUCCESS;
regression totals in §1; next task M07-P01 only after approval/promotion and explicit
authorization. Before P01: fetch, preserve dirty work, synchronize to origin/main,
re-read state/contract, then branch. Acceptance of this review does not preapprove future task implementation merges.


**Implementation closure addendum (2026-10-29):** M07-P01 Correction was human accepted and squash-merged via PR #44 at `be5beae71c405b900a39a75c1ee6b134ebc71dd3` following independent REVIEW PASS on head `2cbae6bc51bb0c677baf575b8f8208841242da68` and CI #40980277676 SUCCESS. Post-merge CI run #40981819546. The original activation decision above remains historical; P02 is the next candidate, requiring separate implementation authorization. Gate 0 formal PASS and Production approval remain pending.

**M07-P02 closure addendum (2026-10-29):** Owner accepted independently reviewed Void/idempotency implementation PR #46, head `d4ccf22ebeeb5619feaaa0565a47cb9d2bf3106b`, CI #40985437379 SUCCESS; squash-merged as `3442ea946c72d31bcdffcaf009af19ace0eb40b8`, post-merge CI #40986852299. M07-P03 is next, separate implementation authorization required; no Gate 0 or Production approval. The initial activation wording above remains historical.

**M07-P03 closure addendum (2026-10-30):** Following prior local/CI authorization, independent REVIEW PASS #5711478441 on PR #48 head `85a93461dbd23778b56d4e047f0c5431c9270dc7` and CI #41045663563 SUCCESS, owner-authorized conditional squash merge integrated linked Refund creation at `3466d5bedf4f6d49b7b609764f98af9cf1e2f2c1` (post-merge CI #41047169878). Next task M07-P04 needs distinct implementation authorization. Historical activation wording above is preserved; Gate 0 and Production are not approved.

**M07-P04 authorization addendum (2026-10-30):** The owner authorized P04 implementation and validation exclusively in local/WSL/CI from `origin/main` `27911a4f1f515e5e0d6859418f15d886eaf041d9`. P04 requires Draft PR, exact-head CI GREEN and independent review before acceptance. No merge, P05, Lab, VPS or Production work is authorized by this addendum.

**M07-P04 closure addendum (2026-10-30):** After owner authorization for local/WSL/CI, independent REVIEW PASS #5712722020 on final PR #50 head `a6339606ba60dfb7cd3cb25b4ce1b700dc291dca` and CI #41058232833 SUCCESS (1,059 unit / 506 PostgreSQL / M06 regressions), conditional owner authorization supported squash `e7392e3ff863ff226c0a6303cfa1111a42859001`, post-merge CI #41061198756. Five original Expense row-lock wait proofs closed the P04 review gap. P05 implementation separately authorized for local/WSL/CI only after P04 documentary closure CI SUCCESS; no VPS/real WhatsApp/Production approval. Original activation review remains historical.

**M07-P05 closure addendum (2026-10-30):** P05 independent REVIEW PASS #5714149479, reviewed head `bfd4ec5713a0aec9c5c948d65fb6551c5e10e41a`, exact-head CI #41074567587 SUCCESS (1,060 unit/516 PostgreSQL/M06 124 native/25 simulated/2 synthetic leak), PR #52 squash `fc169713a1089db0f20585eb25535e0e0abcd6f5`, post-merge CI #41076299512. Confirmation Inbox/financial mutation, stale rejection and ordering verified; no frozen, migration, dependency, VPS/Lab/Production change. P06 remains NOT AUTHORIZED pending explicit task approval. Historic review text above unchanged.
