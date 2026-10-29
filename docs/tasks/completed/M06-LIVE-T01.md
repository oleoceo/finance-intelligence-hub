# M06-LIVE-T01 — Evolution 2.3.7 / n8n 2.23.3 Lab artifacts

**Status:** DONE — Lab technical acceptance by owner on 2026-10-29; Gate 0/Production formal approval remains pending.
**Authorization:** Owner request 2026-10-29: local implementation, tests, commit, push and Draft PR; no VPS access, real credentials, webhook activation, WhatsApp sends or merge.
**Activation:** Bounded operational follow-up to accepted P01–P05, against `origin/main` `cb109d4`. No new generic planning cycle.

Scope: `integrations/n8n/m06/live/`, `docs/integrations/m06/`, `infra/finance-lab/`, `.github/workflows/ci.yml`, this contract, M06 overview and `PROJECT_STATE.md`. Reuse P02/P03 processors unchanged; no financial logic, application/schema changes or dependency upgrades.

Deliver inactive importable workflow, credential-backed provider binding, minimal persistent transport network configuration and separate operator procedure for the external n8n Compose. Validate pinned upstream contracts; reject ambiguous identity and unproven origin. Gate live promotion on deployed-image evidence, Gate 0 acceptance and independent review.

Routing: frozen decision ledger; frozen 03, 05, 06, 07, 09; ADR-003 (OPEN); accepted P01–P05 and M06 overview. Current owner instructions authorize the dedicated transport network artifacts, not changes to existing shared services.

Validation: frozen install, lint, format, build, typecheck, unit, PostgreSQL integration, P01–P05 regression, provider/security/retry tests and isolated n8n 2.23.3 import/runtime checks. Wire M06 checks into CI. Required result: exact-head CI GREEN, Draft PR, REVIEW REQUIRED; live acceptance remains NOT EXECUTED.

Sync handoff: previous FINANCE-LAB-T01 runtime correction PR #37, squash and `origin/main` baseline `cb109d47a69207326527b07743967ee12eda3ea9`, post-merge CI `40803623526` SUCCESS (verified); prior P05 squash `dffec7923d786fb5900f1768155b6efe750da220`, post-merge CI `40700898781` SUCCESS, regression 1,023 unit / 453 PostgreSQL plus 84 native M06 / 25 P05 acceptance. Windows main fast-forwarded; existing dirty WSL workspaces preserved; isolated WSL validation checkout created from synchronized baseline. Final task records must use newly executed totals.

Owner supplement: confirmed external n8n Compose `/opt/apps/apps/n8n/docker-compose.yml`, Evolution `/opt/apps/apps/platforms/evolution-main/docker-compose.yml`, and Finance `/opt/apps/apps/lab/finance-hub/infra/finance-lab/compose.yml`. Deliver separate additive n8n overlay and before/after validator proving preservation of existing networks, volumes and unrelated services. No Evolution Compose change. This supplements the same task and does not authorize VPS execution.

## Implementation evidence

Inactive P03-derived workflow and private n8n transport node; unchanged accepted P02/P03 processors bundled at build time. Three separate credential records, header verification before provider mapping, strict fixed-instance/UUID/account and private-sender binding, fixed ingest-only URL, authenticated Evolution text send, bounded accepted retry and sanitized outcomes. Unknown/LID metadata fails closed. Both network overlays and a configuration comparison checker are included; operator deployment/rollback uses the owner-confirmed Compose paths.

Native WSL Node 24.22.0 / pnpm 12.3.4: frozen install, lint, format check, build, typecheck PASS; unit **39 files / 1,023 tests**, PostgreSQL **26 files / 453 tests**, P01–P04 plus live adapter **5 files / 121 tests** (84 preserved + 37 new), P05 real-PostgreSQL simulated-provider acceptance **1 file / 25 tests** PASS. No required suite skipped or discovered as zero tests. Existing financial duplicate/concurrency assertions are preserved.

Isolated n8n **2.23.3**, image digest `sha256:c0c39b1ca69d43f736bc65f8ddd70972a8989f736e8a4b6a075823f98cc48a23`: import/export remains inactive; custom node/three credentials load; disabled and unauthenticated execution reject; authenticated synthetic ingest via actual n8n HTTP helper retries 503 then returns accepted-no-reply. Container has no external network. Compose API/migration network isolation, n8n preservation and negative unrelated-volume check PASS. Finance image build/runtime smoke and non-root 0600 secret-mount check PASS. Forced-sudo variant is unavailable locally without a sudo credential; existing GitHub Actions executes it independently. Exact PR-head CI evidence belongs to the PR checks and implementation report; do not infer CI GREEN from this local record.

No migrations, application/Core/Database code, dependencies, lockfile, frozen documents or accepted P01–P05 artifacts changed. No VPS access or real secrets used. Live release remains blocked on deployed Evolution/header/identity proof, effective raw-log suppression, network recreation proof, Gate 0 acceptance and explicit operational authorization. Backup restore remains pending. This is artifact review, not M06 live acceptance.


## Closure (2026-10-29)

Technical Lab evidence: [accepted E2E report](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md). Original authorization and pre-deployment warnings in this task describe the historical task phase; they do not indicate the Lab work is unexecuted today. PR #38 (transport), #39 (logging) and #40 (LID) were merged. Five real WhatsApp commands, reconciliation with PostgreSQL and selected security/idempotency negatives passed; no Production release. M07 Activation Review is the next selected work.
