# M06 Activation Review — technical proposal

**Status:** ACTIVATION REVIEW REQUIRED; M06 remains PLANNED.
**Date:** 2026-10-27
**Forward plan:** [M06 overview](M06-OVERVIEW.md)
**Authoritative main:** `6ac27917df7e4c2007aec01cd30f067cd4cdd338`
**Reviewer/approver:** pending human review

## 1. Upstream and Sync Gate

M01–M05 are DONE; Gate A PASS. M05 P01–P06 are integrated, and M05 closure PR #25 is merged at the main SHA above; post-merge CI 40598640430 is reported SUCCESS in the handoff. Windows `main` and the clean WSL `~/src/finance-intelligence-hub-main-sync` checkout were fast-forwarded to this SHA after fetching `origin`; no uncommitted work was overwritten. Gate 0/B/C are NOT EXECUTED. No live infrastructure was inspected.

Authority reviewed: [freeze ledger](../../frozen/FINAL-FREEZE-DECISIONS.md), [architecture](../../frozen/03-ARCHITECTURE.md), [API](../../frozen/05-API-CONTRACTS.md), [WhatsApp](../../frozen/06-WHATSAPP-FLOWS.md), [security](../../frozen/07-SECURITY.md), [roadmap/tests](../../frozen/09-ROADMAP-TESTS.md), [M05 overview](../completed/M05-OVERVIEW.md), and [P01](../completed/M05-P01.md), [P02](../completed/M05-P02.md), [P03](../completed/M05-P03.md), [P04](../completed/M05-P04.md), [P05](../completed/M05-P05.md), [P06](../completed/M05-P06.md).

## 2. Assumption delta and exact M05 interface inventory

| Forward-plan assumption | Finding / classification | Evidence and action |
|---|---|---|
| Frozen `POST /api/v1/inbox/messages` consumes a normalized WhatsApp envelope | **Replaced by accepted implementation** | `apps/api/src/routes/inbox.ts`, `apps/api/src/schemas/inbox.ts`, `apps/api/src/inbox.test.ts`. Required fields: literal `source: whatsapp`, nonempty `source_instance`, `source_message_id`, `sender_reference`, RFC3339 `received_at`, `raw_text`, and booleans `message_context.is_group/from_me`; schema is strict. P01 must use these exact keys. |
| Bearer `finance:ingest` is limited to Inbox | **Replaced by accepted implementation** | `apps/api/src/middleware/auth.ts`, `apps/api/src/index.ts`; distinct admin/ingest tokens, constant-time comparison, 401 absent/bad, 403 wrong scope. P02 receives only ingest credential. |
| Sender authorization precedes raw persistence | **Replaced by accepted implementation** | `packages/core/src/application/inbox/claim-inbox-message.ts`; sender strips punctuation, requires 8–20 digits, locks and rechecks active AuthorizedSender before claim. `apps/api/src/middleware/errors.ts` maps unauthorized sender to 403. |
| Group/from_me messages are ignored | **Replaced by accepted implementation** | `claim-inbox-message.ts` returns before persistence; `apps/api/src/inbox.test.ts` covers both. P02 also filters known event metadata, but Finance remains the enforcement boundary. |
| Stable Inbox identity and retries avoid duplicate effects | **Replaced by accepted implementation** | `claim-inbox-message.ts`, `packages/database/src/repositories/inbox-message-repository.ts`, `packages/core/src/application/inbox/process-message.ts`; identity is source + instance + message ID. Processed/ignored/needs-confirmation duplicate returns `duplicate_message`; failed claims may resume same row; processing/stale_claim are no-reply states. P03/P04 must preserve all identity fields. |
| Structured result contains sendable reply text | **Stale; acceptance blocker** | `apps/api/src/routes/inbox.ts` returns `reply: {should_send}` only, including created/confirmation/Last; no text. P03 cannot dispatch a user message without a Finance-owned presenter. See section 3 and human decision. |
| Confirmation choices and contextual replies work | **Replaced by accepted implementation** | `packages/core/src/application/inbox/confirmation.ts`, `process-message.ts`, `apps/api/src/routes/inbox.ts`; pending session choices are `1`/`2` with number/name, `sim`/`não` resolve yes/no; response has action, expiry, options. P03 renders only Finance-authored text. |
| Duplicate suppression is equivalent to outbound reply exactly once | **Stale** | Duplicate API response has `should_send:false`; `process-message.ts` commits financial effect independently of outbound transport. Exactly-once financial effect is required; reply delivery is best effort and may be lost or repeated after ambiguous send timeout. |
| 4xx errors can be sent directly as user-facing prose | **Stale** | `apps/api/src/middleware/errors.ts` emits safe structured `error.code/reason`, not reply text. n8n may route a fixed safe transport failure message only under an approved contract; never expose raw errors or infer finance. |
| Evolution/n8n instance details are known at activation | **Stale** | Gate 0 is not executed. Versions, webhook event/payload schema, send operation, URLs, credential provisioning, network membership, timeout and rate limits remain unknown. Verify after Gate 0 and separate VPS authorization. |

The response inventory in `apps/api/src/routes/inbox.ts` is: `data.result.type`, optional `data.inbox_message`, optional transaction (`id`, `human_ref`, `book_id`, `type`, `amount`, `transaction_date`), optional confirmation (`id`, `action`, `expires_at`, `options`), `data.reply.should_send`, and `meta.duplicate`. Types include `ignored`, `duplicate_message`, `processing`, `stale_claim`, `confirmation_required`, `transaction_created`, `query_last`, `expired`, `cancelled`, and other processed outcomes. Error shape is `error.code/reason` plus metadata from `apps/api/src/middleware/errors.ts`. The current route does not expose full transaction account/description or confirmation prompt wording.

## 3. Reply content contract — human decision required

Propose a narrow **Finance API reply presenter extension owned by M06-P03**, with implementation explicitly contingent on separate M06 activation. Finance API/Core selects the message from committed result and context; n8n treats it as opaque text and sends it only when `should_send` is true. Preserve existing `result`, `reply.should_send`, and frozen endpoint semantics. Add `reply.text` for sendable outcomes, with a bounded length and safe Portuguese templates. Success text must be based on persisted post-commit values. Cover expense, income, transfer, confirmation prompt with numbered options and expiry, cancellation, expiration, Last result, empty Last, and safe unsupported/validation outcomes. For `ignored`, duplicate, processing and stale claim, `should_send:false` and no text. Authentication or sender authorization errors must never reveal financial details; whether any sender-facing error is allowed requires human security review. A 401/403 to n8n is operational failure, not a Finance success reply. Tests must assert exact text, `should_send` consistency, no secrets/raw errors, and no financial write from presentation. No extension is implemented in this review.

## 4. Acceptance-command compatibility

The parser is deterministic (`packages/core/src/application/inbox/interpret-message.ts`, tests beside it); P03 resolution is in `resolve-interpretation.ts` and its tests. Explicit fields use `livro:`/`contexto:`, `conta:`, `destino:`, `categoria:`, `estabelecimento:`/`lojista:`. Rules/defaults are configuration dependent; ambiguous or missing eligible account/book leads to clarification, not a silent selection.

| Command | Exact recognized fields | Dependency / gap |
|---|---|---|
| `35 almoço nubank` | Expense, amount 35, description `almoço nubank` | `nubank` is **not** an explicit Account. Book/Account require valid rule, sender defaults, unique eligible choice, or clarification. A rule may match description, but cannot make the trailing token an explicit account. |
| `empresa 327,40 google ads inter` | Expense, Book `empresa`, amount 327.40, description `google ads inter` | `inter` remains description. Empresa Account requires configuration/clarification. Expected Inter selection is unsupported as written unless an accepted rule/default resolves it. |
| `recebi 2500 cliente empresa inter` | Income, amount 2500, description `cliente empresa inter` | Neither trailing Empresa nor Inter is an explicit Book/Account. Both require configuration/clarification. Expected Empresa assignment is unsupported as written without it. |
| `transferi 500 nubank para inter` | Transfer, amount 500, source `nubank`, destination `inter` explicit | Both accounts must exist, be active, distinct, same Book/currency; Book still resolves from rule/default/unique choice or clarification. |
| `último` | Read-only Last intent | Book resolved by default/unique choice or clarification; empty result is valid. |

`interpret-message.test.ts` proves the parse shapes; `resolve-interpretation.test.ts` proves rule/default/clarification behavior. Accepted M05 API E2E evidence is in `docs/tasks/completed/M05-P06.md`. **Human acceptance decision:** either approve configuration prerequisites and clarification outcomes for these exact commands, or separately authorize a correction in the M05 parser/resolver owning component before claiming the original expected effects. n8n must not strip or interpret trailing names. This is an acceptance blocker, not a frozen-architecture contradiction.

## 5. Ownership, transport, security and reliability

Evolution owns webhook/send transport; n8n owns technical event filtering, exact envelope mapping, bounded retries and outbound delivery; Finance API owns service auth, sender auth, Inbox identity, parsing, resolution, confirmation, financial writes, idempotency and reply content. P01 must specify a source instance stable across restarts, provider message ID without regeneration, sender reference from verified sender metadata, event timestamp, supported incoming text events, and only `is_group`/`from_me` flags. Unknown payload keys are not forwarded. Any provider payload fixtures are illustrative pending version/payload verification after Gate 0; no invented live schema is normative.

Finance call retry: bounded backoff for 500/503/timeouts; 429 honors Retry-After within a maximum delay; 400/401/403/409/422 are not blindly retried. An ambiguous Finance response may be retried only with the *same* identity. Outbound send retry is a separate bounded queue/path and never calls Finance create again. A send timeout can have delivered the message; reply delivery is best effort, not exactly once. Log only identity/correlation/status/reply ID, not credentials or raw text. No finance:admin token in n8n, no raw unauthorized Inbox persistence, no financial parsing or SQL in workflow.

## 6. Proposed execution-ready task contracts

All contracts remain proposals under `docs/tasks/planned/` until human activation. Common frozen routing: architecture 03, API 05, WhatsApp 06, security 07, roadmap 09. Common exclusions: M07/M08/M09, schema changes, finance business logic in n8n, live VPS before Gate 0 and separate authorization. No migrations expected; dependency additions require task-level justification and minimal lockfile change.

| Task | Goal / permitted paths | Dependency, acceptance and tests | Human boundary |
|---|---|---|---|
| **P01** | Specify normalized transport and fixtures: `docs/tasks/active/M06-P01.md`, `docs/integrations/m06/**` (after activation). | M05 accepted. Document stable source/instance/message ID, sender/timestamp/text/flags, allowed metadata, Bearer ingest boundary, structured errors; static schema/fixture validation and malformed/group/from_me cases. | Real provider payload shape remains provisional until Gate 0/VPS authorization. |
| **P02** | Thin local workflow: `integrations/n8n/m06/**`, its local tests/fixtures, task record. | P01. Webhook technical filter, exact mapping, one Finance ingest call; tests for event variants, no unauthorized forwarding, no account/amount/book interpretation, no secret literals. | Live import/credential configuration separately authorized. |
| **P03** | Reply presenter and dispatch/retries: `apps/api/src/routes/inbox.ts`, `apps/api/src/inbox.test.ts`, narrowly needed `packages/core/src/application/inbox/**`, `integrations/n8n/m06/**`, tests and task record. | P01–P02 and approved reply contract. Finance-authored bounded text for all section 3 states, Evolution send adapter after verified API contract; separate Finance/outbound retry tests, 429 Retry-After, timeout, 4xx, no-reply outcomes. | Human approval of text/error exposure and API extension; live send requires Gate 0/VPS authorization. |
| **P04** | Duplicate/reply-failure resilience: `integrations/n8n/m06/**`, its tests/fixtures, narrowly necessary `apps/api/src/inbox.test.ts` and existing M05 integration tests, task record. | P03. Independent duplicate webhook, response loss, retry, reply failure and concurrent replay tests demonstrate one financial effect and no Finance call on reply-only retry. | No live failure injection without separate authorization. |
| **P05** | Acceptance evidence: `integrations/n8n/m06/**` test fixtures/harness, `docs/tasks/active/M06-P05.md`, `docs/integrations/m06/**`, `PROJECT_STATE.md` only after accepted closure. | P04 and resolved command blocker. Simulated local E2E for all five commands, confirmations, unauthorized/group, duplicates and reply failure; separately gated live E2E with real Evolution/n8n only after Gate 0 PASS and explicit VPS authorization. | Human review of acceptance interpretation and live test plan before live execution. |

The proposed `integrations/n8n/m06/**` and `docs/integrations/m06/**` directories are new bounded surfaces, not existing code. Each task must receive its own ACTIVE contract and explicit implementation authorization. P03 source paths are conditional on approved presenter design.

## 7. Test and gate matrix

| Evidence | P01 | P02 | P03 | P04 | P05 |
|---|---|---|---|---|---|
| Static envelope/auth/error fixtures | Required | Regression | Regression | Regression | Regression |
| Simulated event/filter/normalization | Specified | Required | Regression | Regression | E2E |
| Presenter and send/retry unit tests | Contract | — | Required | Regression | E2E |
| Real PostgreSQL duplicate/confirmation/financial idempotency | M05 baseline | — | Regression | Required | Required |
| Five commands and authorization/duplicate recovery | Matrix | — | — | Partial | Local required; live separately gated |

Gate A PASS. Gate 0 NOT EXECUTED and required for live integration; Gate B/C NOT EXECUTED and not M06 prerequisites. Before any live work, Gate 0 must establish actual Evolution/n8n versions, network membership, webhook and send payloads, authentication/credential storage, URLs, rate limits, timeout/retry behavior and safe test isolation. A separate explicit VPS/Lab authorization is still required. No Production access is implied.

## 8. Approval and promotion

- [ ] Reply presenter ownership, safe text and error policy approved.
- [ ] Five-command acceptance interpretation/configuration or owning-component correction approved.
- [ ] P01–P05 scope and tests approved.
- [ ] Gate 0/VPS boundaries acknowledged.
- [ ] M06 promotion to ACTIVE explicitly authorized.

**Current decision:** M06 Activation Review REQUIRED; implementation authorization **NO**. Do not move tasks to ACTIVE, implement transport, execute Gate 0, merge, or touch live infrastructure.
