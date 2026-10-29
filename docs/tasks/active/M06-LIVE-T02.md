# M06-LIVE-T02 — Evolution 2.3.7 logging security

**Status:** REVIEW REQUIRED
**Authorization:** Owner request 2026-10-29: local patch, synthetic tests, CI, branch and Draft PR. No VPS access, service restart, webhook/workflow activation, real credentials, WhatsApp connection, merge or Production change.

Scope: `integrations/evolution/`, `.github/workflows/ci.yml`, `docs/integrations/m06/`, this contract, M06 overview and `PROJECT_STATE.md`. Bounded follow-up to LIVE-T01; existing n8n integration remains unchanged. Relevant frozen documents: decision ledger, 03, 05, 06, 07 and 09.

Acceptance: prove official tag source, explain limits of deployed `latest` image ID, patch identified logging sites without changing event/auth/session/message behavior, synthetic leak tests and reproducible build, exact Evolution Compose operational plan including backup/health/rollback, exact-head CI GREEN, Draft PR and independent review. M06 live acceptance remains blocked pending deployed-image/proxy proof and separate operational release.
