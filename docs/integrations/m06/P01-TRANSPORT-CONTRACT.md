# M06-P01 transport and trusted envelope contract

Status: DONE; accepted via PR #28. This is a provider-neutral local contract, not an executable n8n workflow or proof of a deployed Evolution installation. Gate 0 must establish the actual Evolution/n8n versions, supported origin verification or effective access restriction, event shape, and instance/sender binding before live configuration. Unknown authenticity or conflicting metadata fails closed.

## Boundary and order

`Evolution → verified ingress → n8n → POST /api/v1/inbox/messages`.

Before mapping or forwarding, the ingress must verify that the request originated from the configured Evolution instance using a real supported authentication mechanism or effective access restriction. It must bind that verified origin to the configured instance and to the event identity; derive sender metadata from verified incoming-message context; verify all corroborating sender/instance fields agree; and allow only an incoming private text message with sufficient, internally consistent metadata. An obscure URL, a payload `trusted: true` claim, or a claimed authorized phone number proves none of these. Unrecognized event fields that affect origin, sender, instance, identity, kind, direction, or content are not silently ignored: reject until their semantics are established. No financial parsing occurs here.

The verification mechanism, field locations and provider event names are deliberately unspecified until Gate 0. The isolated test verifier in `integrations/n8n/m06/contract/` is synthetic P01 acceptance proof only: it records an immutable snapshot of verified identity and metadata, rejects subsequent mutation, and never treats a payload claim as proof. It is not evidence of real Evolution authenticity. Gate 0 and separate live authorization must establish the deployed version's actual verification mechanism. If deployed verification cannot be established, live promotion stops. Finance independently enforces `AuthorizedSender` before storing raw Inbox content. Rejection at ingress means zero Finance forwarding, zero outbound reply and zero financial effects.

## Exact M05 envelope

The JSON request is strict at the root and in `message_context`. It has exactly the following fields. String bounds follow the accepted M05 schema: the three identities and sender reference are 1–255 characters; `raw_text` may be empty because M05 permits it. `received_at` must be a valid RFC3339 date-time with timezone. A syntactically valid but untrustworthy source value is rejected before mapping. Finance also validates its own strict schema.

| Field | Trusted source and mapping | Rejection and identity role |
|---|---|---|
| `source` | Constant literal `whatsapp` for this transport. | Any other value rejected. First canonical identity component. |
| `source_instance` | Stable configured identity bound to verified Evolution instance; never derived from a mutable display name or regenerated on restart. | Missing, different, cross-instance, or conflicting identity rejected. Second canonical identity component. |
| `source_message_id` | Original provider message ID, unchanged from verified event. | Missing, altered or conflicting ID rejected. Third canonical identity component. |
| `sender_reference` | Sender phone reference from verified incoming-message context; preserve original reference for Finance normalization and authorization. | Missing, malformed, or conflicting sender metadata rejected. An authorized-looking number does not authenticate origin. |
| `received_at` | Verified message timestamp mapped to timezone-qualified date-time without changing its instant. | Missing, invalid or timezone-free timestamp rejected. Not an identity component. |
| `raw_text` | Original incoming text, unchanged. | Missing, non-string or unsupported content rejected. Never parse amount, Book or Account here. |
| `message_context.is_group` | Boolean established from verified event context. | Missing/non-boolean or true rejected before Finance. |
| `message_context.from_me` | Boolean established from verified event context. | Missing/non-boolean or true rejected before Finance. |

Canonical Inbox identity is the ordered triple `source + source_instance + source_message_id`. A retry or duplicate webhook preserves all three exactly, including case and punctuation; it may not mint a new ID or instance. The accepted PostgreSQL Inbox uniqueness and M05 process state own financial deduplication. A replay still passes origin verification; a valid same-identity replay may be forwarded, with Finance returning its duplicate behavior. The transport does not assert exactly-once reply delivery.

## Acceptance and rejection matrix

| Event class | Decision | Finance calls | Outbound replies |
|---|---|---:|---:|
| Verified, configured-instance, incoming private text with consistent metadata | Accept exact envelope | 1 | P01 does not send |
| Same verified event replay with unchanged identity | Accept same envelope | 1 per delivery | P01 does not send |
| Unknown/unauthenticated origin, including `trusted: true` payload claim | Reject | 0 | 0 |
| Authorized-number spoof from unverified origin | Reject | 0 | 0 |
| Missing or conflicting sender fields | Reject | 0 | 0 |
| Wrong/cross-instance identity or conflicting message ID | Reject | 0 | 0 |
| Missing provider message ID or malformed sender reference | Reject | 0 | 0 |
| Missing, impossible calendar date, malformed offset or timezone-free `received_at` | Reject | 0 | 0 |
| Group or `from_me` message | Reject | 0 | 0 |
| Status update or non-message event | Reject | 0 | 0 |
| Unsupported non-text event or absent text | Reject | 0 | 0 |
| Unknown security-relevant metadata or extra forwarded envelope key | Reject | 0 | 0 |
| Malformed envelope, wrong type or missing required field | Reject | 0 | 0 |

Provider-specific payload examples, if added later, are illustrative and non-normative until Gate 0 confirms the deployed version. The test events use a synthetic, provider-neutral representation and a separate mock verifier; they do not claim real Evolution authenticity.

## Credentials, errors and diagnostics

Keep three separate secrets: (1) webhook-origin verification material at verified ingress, (2) Evolution outbound send credential for later P03, and (3) Finance `finance:ingest` credential for Inbox POST only. n8n must not hold `finance:admin`; the ingest credential cannot call direct transaction or administrative routes. Do not reuse verification material as a send or Finance token.

Ingress rejection is terminal and never retried or replied to. Finance 400/401/403/409/422 are not blindly retried; 401/403 never cause an automated WhatsApp reply. P01 defines no runtime retry or outbound dispatch. Later bounded retry handling must retain the identity triple exactly and keep Finance ingest retry separate from outbound send retry.

Diagnostics may record a bounded correlation ID, configured instance alias, a keyed or otherwise nonreversible identity reference, stage, reason code, HTTP status and retry classification. They must not include credentials, raw webhook bodies, raw personal messages, phone numbers, real webhook data, authentication evidence, or sensitive failure payloads. Synthetic fixtures use placeholders only.

## Synthetic E2E specification (not executed live)

Given a mock verifier that independently authenticates a configured synthetic ingress, a consistent incoming private text event maps to exactly the strict envelope and makes one mock Finance Inbox call. Replaying it retains the exact identity triple. Given an untrusted ingress, forged authorized-looking sender, conflicting metadata, wrong instance, unsupported event, or malformed envelope, the pipeline terminates before the mock Finance call and before any reply. P02 owns executable workflow integration; P05 owns separately gated live E2E. Neither is implemented here.

## P01 validation

Run the synthetic contract directly from the repository root:

```sh
node --test integrations/n8n/m06/contract/p01.test.mjs
```

Correction validation: 35 tests PASS, 0 FAIL, 0 skipped. The cases include post-verification sender, message ID, instance, event-kind and security-metadata tampering with zero Finance calls; impossible dates and malformed offsets with zero Finance calls; and preservation of valid timezone-qualified timestamps. This is local synthetic acceptance evidence. The existing Vitest unit and PostgreSQL integration globs do not include this native `node:test` file, so GitHub Actions CI does not automatically execute P01. Adding it to CI requires separate authorization to change paths outside P01. Real Evolution verification and live E2E evidence remain pending Gate 0 and separate VPS/Lab approval.
