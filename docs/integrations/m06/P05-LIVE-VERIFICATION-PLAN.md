# M06-P05 conditional live verification plan

**Execution update (2026-10-29):** Lab operations have now been executed with owner guidance. Five-command real WhatsApp acceptance plus selected security/replay tests passed; see [M06 live evidence](LIVE-ACCEPTANCE-2026-10-29.md). Failure injection and ambiguous send/reply outcomes remain simulated, not live-tested. M06 was technically accepted for Lab by the project owner on 2026-10-29; Gate 0 formal PASS and Production signoff remain pending. The entry gates below describe the original conditional authorization contract and this document does not retroactively authorize past access.

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

**Execution status is now mixed, not universally NOT EXECUTED:** Five official commands (including existing Last), missing/wrong authentication, conflicting instance/UUID/sender identity, group, `from_me`, conflicting LID, unknown metadata, duplicate replay through actual Lab webhook and direct Finance ingest, and unauthorized sender Finance 403 were observed PASS in Lab. Book/Account clarification and empty Last remain **local simulated acceptance only**. Lost Finance response, outbound failure and ambiguous timeout remain **simulated only**. A redelivery from the real provider was not performed. See the dated evidence report for precise scope and limits. Assert real PostgreSQL state before calling a financial scenario PASS. A send timeout may have delivered a reply, so record ambiguity without claiming exactly-once delivery.

## Stop conditions

Stop on unverified origin/sender binding, unexpected event or send contract, credential crossover, public database exposure, unauthorized Inbox persistence, duplicate financial effect, unsupported rollback, provider rate-limit uncertainty, or any required change outside the approved Lab plan. Reopen human review before adapting the plan.
