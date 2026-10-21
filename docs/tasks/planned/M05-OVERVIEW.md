# M05 — Inbox / Parser / Confirmation

**Status:** PLANNED
**Dependencies:** Gate A PASS
**Blocks:** M06 activation

> **This document does NOT authorize implementation.**
> Provisional task decomposition and scope are defined here. Execution-ready
> contracts are finalized during Activation Review.

---

## 1. Objective

Transform an authorized message into a safe financial command:

```text
authorized message
→ safe Inbox persistence
→ deterministic interpretation
→ optional Confirmation
→ no unsafe financial effect
```

M05 is local/domain work. It does NOT include Evolution/n8n transport (that is M06).

---

## 2. Stable Features

### Ingestion Authorization Boundary
- Service authentication (Bearer/scope validation)
- Group message filtering (ignored before financial persistence)
- `from_me` filtering (ignored before financial persistence)
- Sender normalization (phone number canonicalization)
- AuthorizedSender check BEFORE raw Inbox persistence
- Unauthorized sender: reject + minimal security log; NO raw_text persistence

### Inbox Persistence
- Persist authorized messages as InboxMessage records
- Identity: `source + source_instance + source_message_id` (UNIQUE constraint)
- Lifecycle states: `received → processing → needs_confirmation → processed | failed | ignored`
- Processing metadata: `attempt_count`, `processing_started_at`, `last_attempt_at`, `processed_at`

### Retry Lifecycle
- Processed duplicate: does NOT reexecute financial effect
- Failed retry: reuses same InboxMessage row (no new row created)
- Stale processing recovery: reclaim after operational timeout, retry same row
- Exactly-once logical financial effect under technical retries

### Interpretation
- Deterministic parser (works without AI)
- Explicit input priority over inferred values
- ClassificationRules integration for category/merchant/account resolution
- Default Book/Account from AuthorizedSender when not specified
- Deterministic aliases/mapping if supported by frozen scope
- AI optional fallback only — never required for acceptance
- One financial command per message
- Unknown intent: generates `needs_confirmation` or appropriate error state

### ConfirmationSession
- Statuses: `pending | confirmed | cancelled | expired`
- Default TTL: 15 minutes (configurable)
- One pending ConfirmationSession per channel + sender
- Supersede: new complete command cancels pending session with `resolution_reason = superseded_by_new_command`
- Resolution tracking: `resolved_by_inbox_message_id`
- Target tracking: `target_entity_id`, `target_version` for destructive operations
- Original Inbox finalization: after confirmed/cancelled/expired, move original Inbox to appropriate terminal state
- Short replies (`sim`, `não`, `1`, `2`) interpreted as contextual confirmation responses

---

## 3. Exclusions

- Evolution/n8n webhook transport (M06)
- Summary or reporting (M08)
- Correction/Void/Refund business logic (M07)
- Backup/restore (M09)
- Dashboard/Metabase (post-V0.1)

---

## 4. M04 Contracts Consumed

M05 expects to consume the following from accepted M04 planning:

- Transaction create use cases (Expense, Income, Transfer)
- Transaction query interfaces
- Idempotency-Key handling on create operations
- Audit event creation within DB transactions
- Money value object / decimal string handling
- Book/Account/Category/Merchant read ports for validation

**ACTIVATION REVIEW REQUIRED**: Exact interface signatures, port names, and import paths must be verified against actual M04 implementation during Activation Review. Do not assume specific function names or module structures at this stage.

---

## 5. Provisional Task Decomposition

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| **M05-P01** | Ingestion authorization boundary and Inbox persistence/retry | Auth middleware, sender normalization, AuthorizedSender pre-check, InboxMessage CRUD, uniqueness enforcement, retry lifecycle, stale recovery |
| **M05-P02** | Interpretation model and deterministic parser | Parser domain logic, explicit input extraction, one-command-per-message enforcement, unknown intent handling |
| **M05-P03** | ClassificationRules/default resolution integration | Rule matching against parsed input, default Book/Account application, deterministic alias support |
| **M05-P04** | ConfirmationSession lifecycle and supersede | Session CRUD, TTL/expiry, one-pending-per-sender invariant, supersede logic, short-reply interpretation, original Inbox finalization |
| **M05-P05** | Inbox API/orchestration integration | Frozen `POST /api/v1/inbox/messages` (`finance:ingest`) boundary; orchestration connecting auth → inbox → interpretation → confirmation → transaction create, reply result contract |
| **M05-P06** | M05 milestone verification | End-to-end acceptance tests, all unit/integration suites green, frozen scenario coverage |

Task boundaries may be refined during Activation Review if the actual M04 implementation suggests a better separation.

---

## 6. Required Test Categories

### Unit Tests
- Sender normalization edge cases
- Authorization ordering (auth → filter → normalize → check → persist)
- Parser determinism across input variations
- ClassificationRule matching priority
- ConfirmationSession state machine transitions
- Supersede behavior
- TTL/expiry logic
- Retry idempotency (processed vs failed vs stale)

### Integration Tests (PostgreSQL)
- Inbox uniqueness constraint enforcement
- One-pending-Confirmation partial unique index
- Failed retry reusing same row
- Stale processing reclaim
- Confirmation resolution updating original Inbox
- Concurrent sender authorization races
- Transaction creation through full orchestration path

### Acceptance Scenarios
- Unauthorized sender produces zero Inbox rows and zero Transactions
- Group message ignored before persistence
- `from_me` message ignored before persistence
- Duplicate webhook/message produces exactly one financial effect
- Failed processing allows retry on same row
- Stale processing recovered after timeout
- Pending Confirmation blocks new Transaction until resolved
- New command supersedes pending Confirmation without executing old action
- Expired Confirmation produces no action
- Deterministic parser works without AI provider

---

## 7. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Must PASS before M05 activation |
| Gate 0 | NO | M05 is local/domain work |
| Gate B | NO | After M07 |
| Gate C | NO | After M09 |

---

## 8. Known Risks Deferred to Activation Review

- Exact M04 transaction create port signatures and error types
- Whether M04 exposes an orchestration-friendly API or requires direct use case composition
- Inbox table column naming conventions (must match M02 migration)
- ConfirmationSession table structure alignment with M02 schema
- Whether existing test infrastructure supports the required concurrent sender tests

---

## 9. Frozen Document Routing

Per AGENTS.md §6:
- `02-DOMAIN-MODEL.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `07-SECURITY.md`
- `09-ROADMAP-TESTS.md`
