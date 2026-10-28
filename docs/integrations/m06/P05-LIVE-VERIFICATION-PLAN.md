# M06-P05 conditional live verification plan

**Status: NOT EXECUTED.** This plan grants no access to Lab, VPS, Production, Evolution, n8n, or credentials.

## Entry gates

1. Gate 0 PASS with actual infrastructure inventory and network, backup, and isolation evidence.
2. Discover and record deployed Evolution and n8n versions from the isolated Lab environment.
3. Demonstrate the actual version-supported webhook authenticity mechanism and binding of trusted origin, instance, sender metadata, and provider message ID before Finance forwarding. An opaque URL or payload assertion alone fails this gate.
4. Obtain a human-reviewed isolation and rollback plan and separate explicit VPS/Lab authorization.

If any gate fails or evidence is inconclusive, stop and keep every live scenario **NOT EXECUTED**.

## Version-dependent contract discovery

Record the deployed versions, supported webhook event names and payload fields, sender identity corroboration, timestamp and message ID semantics, signature or effective access-restriction mechanism, retries, and actual send endpoint/request/response. Confirm n8n workflow node behavior, credentials, outbound authentication, network routes, transport TLS, timeout, rate limit, and provider error codes using the deployed versions. Do not substitute documentation for observed version evidence. Keep ingress, Finance `finance:ingest`, and outbound credentials isolated; no admin token in n8n.

## Isolated execution and rollback

Use a dedicated Lab instance, test sender, test Book/Accounts and disposable test messages. Inventory pre-test row counts and take an approved restorable Lab snapshot. Never use production data or a production sender. Verify rollback restores only the isolated fixtures and does not remove unrelated data. Capture redacted workflow execution IDs, correlation IDs, canonical Inbox identities, Finance status/result, transaction/audit/idempotency IDs and send attempt status. Exclude tokens, raw unauthorized text, phone numbers and payload secrets from shared evidence.

## Scenario checklist

All entries are **NOT EXECUTED**: five official commands; Book and Account clarification and valid choices; existing and empty Last; forged origin; spoofed/conflicting sender; cross-instance event; unauthorized sender; group and `from_me`; duplicate replay and lost Finance response; outbound failure and ambiguous timeout; 401/403 with zero automated replies. Assert real PostgreSQL state before calling a financial scenario PASS. A send timeout may have delivered a reply, so record ambiguity without claiming exactly-once delivery.

## Stop conditions

Stop on unverified origin/sender binding, unexpected event or send contract, credential crossover, public database exposure, unauthorized Inbox persistence, duplicate financial effect, unsupported rollback, provider rate-limit uncertainty, or any required change outside the approved Lab plan. Reopen human review before adapting the plan.
