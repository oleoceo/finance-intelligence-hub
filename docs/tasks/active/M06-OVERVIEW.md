# M06 — WhatsApp Integration (Evolution + n8n Transport)

**Status:** ACTIVE — P01 DONE via PR #28; P02 DONE via PR #29; P03 DONE via PR #30; P04 DONE via PR #31; P05 DONE / local acceptance integrated; live integration NOT EXECUTED
**Dependencies:** Gate A PASS; Gate 0 PASS required for live/VPS acceptance
**Blocks:** M07 activation

> **This document does NOT authorize implementation.**
> The accepted Activation Review defines five ACTIVE task contracts.
> Each still requires separate implementation authorization.

---

## 1. Objective

Connect Evolution API + n8n to Finance API as a thin transport layer:

```text
Evolution webhook
→ n8n technical filter + minimal normalization
→ Finance API ingest endpoint
→ structured result
→ reply.should_send → send Finance-authored text through Evolution
```

Without moving financial business logic into n8n.

M06 is transport only. Financial interpretation, confirmation, classification and defaults belong to M05. Correction/Void/Refund belong to M07.

---

## 2. Stable Rules

### Credential Boundary
- n8n credential uses ONLY `finance:ingest` scope
- n8n CANNOT:
  - Use admin routes
  - POST direct transactions via generic create
  - PATCH transactions
  - Void transactions
  - Create refunds
- All financial decisions happen inside Finance API/Core

### Workflow Shape
```text
Evolution webhook
↓
technical event filter (ignore non-message events)
↓
minimal envelope normalization
↓
POST /api/v1/inbox/messages (finance:ingest)
↓
structured result with Finance-authored `reply.text` for sendable outcomes
↓
if should_send: Evolution send message API
```

### No Financial Logic in n8n
- No financial SQL
- No classification rules
- No default resolution
- No refund/void/correction business rules
- No amount parsing or validation beyond envelope normalization
- No Book/Account/Category/Merchant lookups

### Retry Behavior
- 500/503: controlled retry with backoff
- 429: honor Retry-After header
- 4xx domain/validation: NO blind retry; 401/403 never trigger an automated WhatsApp response
- Network timeout: bounded retry
- Always preserve: `source`, `source_instance`, `source_message_id`

### Duplicate and Reply Resilience
- Duplicate webhook = one logical financial effect (Inbox uniqueness handles this)
- Reply failure CANNOT duplicate financial effect
- Reply exactly-once delivery NOT promised (at-least-once / best controlled)
- Financial effect is canonical; reply is best-effort notification

---

## 3. Acceptance Commands

The following commands must work end-to-end through the Evolution/n8n/Finance pipeline:

| Command | Expected Effect |
|---------|----------------|
| `35 almoço nubank` | Expense; trailing `nubank` remains description; Account needs rule/default or clarification |
| `empresa 327,40 google ads inter` | Expense in Empresa book; Account needs rule/default or clarification |
| `recebi 2500 cliente empresa inter` | Income; Book and Account need rule/default or clarification |
| `transferi 500 nubank para inter` | Transfer between accounts |
| `último` | Last transaction returned |

**Explicitly NOT M06 acceptance:**
- `resumo` — belongs to M08

---

## 4. Exclusions

- Financial business logic in n8n
- Summary or reporting (M08)
- Correction/Void/Refund operations (M07)
- Backup/restore (M09)
- Dashboard/Metabase (post-V0.1)
- AI provider integration (optional fallback in M05, not M06 transport concern)

---

## 5. Operational Conditionality

### Local/Static Planning
- Workflow JSON/template design may proceed before Gate 0
- Envelope contract definition may proceed before Gate 0
- Unit tests for normalization logic may proceed before Gate 0

### Live VPS Integration
- REQUIRES Gate 0 PASS
- REQUIRES separate explicit authorization for VPS/Lab access
- Actual Evolution/n8n instance URLs, credentials, network membership and secrets require Gate 0 evidence and separate authorization
- Do NOT hardcode or assume these values in forward planning

---

## 6. M05 Contracts Consumed

M06 expects to consume from accepted M05:

- Frozen `POST /api/v1/inbox/messages` endpoint with `finance:ingest`, accepting normalized envelope
- Inbox persistence triggered by ingest call
- Interpretation and confirmation orchestration triggered by ingest
- Structured response with `reply.should_send`; P03 adds Finance-authored bounded Portuguese `reply.text`
- Sender normalization compatible with Evolution phone format

**Activation Review ACCEPTED:** M05 interfaces and approved policies are recorded in [the review](M06-ACTIVATION-REVIEW.md). Live provider details remain conditional on Gate 0.

---

## 7. ACTIVE task contracts

| Task | Status |
|---|---|
| [M06-P01](../completed/M06-P01.md) | DONE / integrated via PR #28 |
| [M06-P02](../completed/M06-P02.md) | DONE / integrated via PR #29 |
| [M06-P03](../completed/M06-P03.md) | DONE / integrated via PR #30 |
| [M06-P04](../completed/M06-P04.md) | DONE / integrated via PR #31 |
| [M06-P05](../completed/M06-P05.md) | DONE / local acceptance only, PR #32 |

## 8. Required Test Categories

### Unit Tests
- Envelope normalization edge cases
- Event filter correctness (ignore non-message, ignore status updates)
- Retry policy logic (backoff, Retry-After, no blind 4xx retry)
- Finance-owned reply presenter and transport pass-through

### Integration Tests
- Ingest endpoint called correctly with normalized envelope
- Duplicate webhook produces single InboxMessage
- Finance API error responses handled correctly
- Reply dispatch succeeds/fails gracefully without duplicating finance

### E2E / Acceptance Tests
- All five acceptance commands succeed through full pipeline
- Unauthorized sender rejected at ingest boundary
- Group messages filtered before ingest
- Reply delivered when should_send is true
- Reply failure does not cause financial duplication

---

## 9. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Must PASS before M06 activation |
| Gate 0 | YES for live acceptance | Local/static planning may proceed without it; live VPS integration requires it |
| Gate B | NO | After M07 |
| Gate C | NO | After M09 |

---

## 10. Known Risks Deferred to Activation Review

- Actual Evolution webhook payload structure and version
- n8n credential provisioning mechanism for `finance:ingest` scope
- Whether n8n is on `apps-backend` network (Gate 0 finding)
- Evolution send-message API format and authentication
- Concrete M05 ingest handler and request/response types for the frozen `POST /api/v1/inbox/messages` route
- Whether existing n8n instance supports the required workflow patterns

---

## 11. Frozen Document Routing

Per AGENTS.md §6:
- `03-ARCHITECTURE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `07-SECURITY.md`
- `09-ROADMAP-TESTS.md`

**Milestone state:** LOCAL IMPLEMENTATION ACCEPTED - LIVE INTEGRATION NOT EXECUTED. P05 PR #32 reviewed HEAD `3072b50f000cf4c48fc0d3acc1d13c2670b59d9a`, exact-head CI `40699057147` SUCCESS, squash `dffec7923d786fb5900f1768155b6efe750da220`, post-merge CI `40700898781` SUCCESS. Gate 0/B/C NOT EXECUTED.
