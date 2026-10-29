# M06-LIVE-T02 — Evolution logging remediation (REVIEW REQUIRED)

This is a local artifact and operator procedure. No VPS change, service restart, webhook activation, WhatsApp connection, real message, or merge is authorized by this document.

## Evidence and boundary

Official Evolution API annotated tag `2.3.7` resolves to commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370` (tag object `6a398a6a08e59eb87dcf98b0f389e8decaf08689`). At that commit, `whatsapp.baileys.service.ts` logs `messageRaw` through both `logger.verbose` and unconditional `console.log`, and `webhook.controller.ts` logs `webhookData` including `apikey` when `WEBHOOKS` is enabled. Webhook error logging also interpolates arbitrary error messages and stack traces. Changing `LOG_LEVEL` cannot suppress the direct console call.

The previously observed `sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252` is a local Docker **image ID**, not a registry manifest digest or proof of source provenance. `evoapicloud/evolution-api:latest` is mutable. The official upstream workflow publishes `latest` from `main`; the tag's Dockerfile has only a static `version=2.3.1` label. Neither that label nor the reported Evolution runtime version proves byte correspondence. This task has no access to the deployed image or VPS, so correspondence remains **UNVERIFIED**. Do not run real traffic against that image on the strength of this patch.

## Reviewed patch

`integrations/evolution/m06-logging.patch` applies only to the two upstream files. It removes raw Baileys ingress, history, packet, stanza and received-message logs, retains `sendDataWebhook` and chatbot emission, and changes local/global webhook and retry diagnostics to bounded metadata (`event`, `instance`, attempt, timeout, status). It leaves the outbound payload, `apikey` field, headers, authentication, session and message processing intact. Arbitrary error strings, stack traces, URLs and payloads are excluded from these diagnostics. This is a targeted repair of identified paths; independent review must still audit any other upstream logging and proxy/container log exporters before real message tests.

On a clean machine with Git, Node 24 and Docker, from this repository:

```sh
bash integrations/evolution/prepare.sh /tmp/evolution-m06-patched
docker build --tag evolution-m06-logging:review /tmp/evolution-m06-patched
docker image inspect evolution-m06-logging:review --format '{{.Id}}'
```

The script refuses an existing target, checks the exact upstream commit, checks and applies the versioned patch, runs synthetic leak tests, and checks the diff. The CI builds the same patched source. `verify.mjs` checks that the ingress does not call raw loggers, the webhook still receives its payload and credential, and each patched webhook log object excludes synthetic message content, token, header and URL. All test strings are synthetic. A successful source test does not prove the running container or a log pipeline is safe; the operational checks below close that gap.

## Proposed operator procedure for the exact Evolution Compose

Execute only after independent review, Gate 0 requirements and explicit operational authorization. Work solely on `/opt/apps/apps/platforms/evolution-main/docker-compose.yml` in the existing Compose project. Keep the Lab webhook disabled, n8n workflow inactive and Operational Release false throughout. Do not connect WhatsApp or use live credentials for this verification.

1. Record the existing Compose project/service from container labels and record the existing image ID, repo digest (if any), container ID, health status, networks and mounts **without printing environment or secrets**. Save the existing Compose file and any override files with owner/mode preserved in a private backup directory (`umask 077`; `cp -p`). Record checksums. Record existing image reference and retain the old image locally for rollback. Do not use a mutable `latest` reference in the proposed deployment.
2. Build the reviewed patched source on an isolated builder. Publish it to an approved private registry under a unique version tag. Capture the **platform manifest digest** and set the Evolution service image reference in the existing Compose to `registry.example/evolution-m06-logging@sha256:<verified-platform-or-index-digest>`. Do not copy the sample name/digest literally. Verify the pull resolves to the reviewed build by comparing source commit and patch checksum recorded as build provenance, plus an offline check of the built `dist` for the patched log sites. If provenance cannot be established, stop.
3. Preserve every current setting in the Compose: project name, service key, environment, secrets, labels, healthcheck, ports, volumes, networks, restart policy and dependencies. Change only the Evolution image reference. Render before/after Compose privately with the same project name, environment and override files, and compare parsed JSON after replacing only the image field. `docker compose config` may contain secrets; never print or upload it. Confirm no network/volume/service/port change. Confirm webhook and n8n remain disabled/inactive.
4. Before a later authorized restart, perform an offline synthetic logging test against the exact candidate image with no network, disposable storage and synthetic message/token/header only. Capture stdout/stderr privately; assert the three synthetic markers are absent. Confirm the service's logging driver and any proxy/exporter do not retain request headers or bodies. The offline test must exercise the actual built code; the repository source tests alone are insufficient.
5. In the approved maintenance window only, pull the digest, run `docker compose ... config --quiet`, recreate **only** the Evolution service with the original Compose project/overrides and `--no-deps`. Do not recreate n8n, Finance API, PostgreSQL, Redis or shared networks. Verify the new container uses the exact pinned digest/image ID, reaches its existing healthcheck/API health, retains its instance/session and existing networks/volumes, and that unrelated services remain healthy. Keep webhook disabled and n8n inactive. Use synthetic checks only until the logging boundary is independently accepted.
6. Rollback on failed health, provenance or logging verification: restore the private Compose backup, run the original Compose invocation with the old immutable image reference, recreate only Evolution with `--no-deps`, and verify health, instance/session and network membership. Do not delete volumes, sessions, databases or networks. Keep webhook disabled and workflow inactive. Preserve only sanitized evidence for review; securely dispose of private rendered configs and synthetic logs under the operator's retention policy.

The existing backup of Finance data does not substitute for a backup of the Evolution Compose/configuration and session volume before this change. The reported Finance backup still needs an isolated restore test under its separate gate. No image digest or deployed-image equivalence is asserted until an operator produces that evidence.
