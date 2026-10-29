# M06-LIVE-T01 — operator procedure (not executed)

Status: prepared for review; workflow INACTIVE and Operational Release=false. This document does not authorize deployment. Require independent review, Gate 0 acceptance and explicit Lab operational release first. No Production WhatsApp number may be used. No live credentials belong in Git, terminal transcripts, screenshots, execution history or logs.

## Verified source contract and remaining proof

Inspected official Evolution **tag `2.3.7`, commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370`**, not latest documentation:

- [Webhook controller](https://github.com/EvolutionAPI/evolution-api/blob/cd800f2976e1e5b682fbf86a01ee4d85ae61f370/src/api/integrations/event/webhook/webhook.controller.ts): per-instance `/webhook/set/{instance}` stores `webhook.headers` and supplies them to Axios before POST. `events: ["MESSAGES_UPSERT"]` selects emitted `messages.upsert`; `byEvents: false` uses the exact configured URL. Global webhook does **not** apply these instance headers. Do not use global mode for this integration.
- [Baileys adapter](https://github.com/EvolutionAPI/evolution-api/blob/cd800f2976e1e5b682fbf86a01ee4d85ae61f370/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts), `prepareMessage`: `data.key.id`, `data.key.remoteJid`, boolean `fromMe`, seconds `messageTimestamp`, `instanceId`; extended text is converted to `message.conversation`. The transport accepts only this conversation shape; unknown root/data/key fields fail closed. Quoted context and messageContextInfo are content metadata, never sender/authentication evidence.
- [Channel emission](https://github.com/EvolutionAPI/evolution-api/blob/cd800f2976e1e5b682fbf86a01ee4d85ae61f370/src/api/services/channel.service.ts): outer `sender` is the connected instance account (`wuid`), **not** the incoming author. It must equal the configured Lab account JID. Incoming author is the authenticated private `data.key.remoteJid`; optional corroborating key fields must agree. The adapter supplies the P01 snapshot from that verified context, not a second independent proof of the phone owner.
- [Send router](https://github.com/EvolutionAPI/evolution-api/blob/cd800f2976e1e5b682fbf86a01ee4d85ae61f370/src/api/routes/sendMessage.router.ts) and [guard](https://github.com/EvolutionAPI/evolution-api/blob/cd800f2976e1e5b682fbf86a01ee4d85ae61f370/src/api/guards/auth.guard.ts): `POST /message/sendText/{instance}` with `apikey` header and `{number,text,linkPreview:false}`; use the dedicated Lab **instance token**, never the global administrative key. Evolution instance tokens are instance-scoped, not send-only scopes; restrict n8n access accordingly.

Origin mechanism: a random, unique, at least 32-character `x-finance-webhook` shared secret, configured only on this Lab instance and n8n Header Auth credential. Built-in Webhook authentication precedes execution; the local node verifies it again before reading the payload. A bearer header over authenticated HTTPS authenticates the holder, not the WhatsApp sender by itself. TLS must terminate at a trusted proxy without bypass or header injection. Do not accept `apikey`, `server_url`, `trusted`, outer `sender`, obscurity of path, or a successful Finance call as origin proof.

**Deployment evidence still missing:** deployed Evolution image digest/build correspondence to the inspected tag; private header storage/delivery and preservation through the actual HTTPS proxy; negative missing/wrong-header tests; exact isolated instance name/UUID/account JID and redacted private-text payload shape; stable provider message ID on redelivery; actual n8n credential bindings and restart persistence. Owner-reported version alone is insufficient. Keep inactive until these are supplied under operational authorization.

Known deliberate fail-closed limitation: `@lid`, `addressingMode: lid`, conflicting `remoteJidAlt`, participant fields, batches, media, edited/status events and unknown security metadata are rejected. Evolution can rewrite `remoteJid` from `remoteJidAlt`; the current strict policy rejects ambiguous LID provenance rather than guessing a phone. If Lab delivery uses this shape, stop promotion and provide a redacted fixture plus provider identity proof for a separately reviewed extension.

Logging blocker to inspect: upstream webhook payload contains `apikey`; `LOG_LEVEL` including `WEBHOOKS` logs it. Disable `WEBHOOKS` before configuring a secret. Upstream also contains unconditional raw `console.log(messageRaw)` in the incoming Baileys path; log-level changes alone cannot suppress it. Before any real WhatsApp test the operator must prove effective suppression/redaction at the deployed logging boundary (or reviewed patched image). No raw payload capture in tickets. This task does not modify the shared Evolution service. Proxy logs must not record auth headers or bodies. These are activation blockers, not claims that Lab logging has been verified.

## 1. Persist the existing networks

Reported inventory: n8n 2.23.3 on `n8n_internal`, `proxy` and manually connected `finance-hub-transport`; Evolution 2.3.7 on `apps-backend`, `proxy`; Finance API on `finance-products-db` and manually connected `finance-hub-transport`. Do not change Evolution, PostgreSQL, Redis, proxy networks or publish ports.

Finance Compose: retain the base file and opt into `infra/finance-lab/transport.compose.yml` in every subsequent `config`, `up` and recreation invocation:

```sh
cd /opt/apps/apps/lab/finance-hub
docker compose -f infra/finance-lab/compose.yml -f infra/finance-lab/transport.compose.yml config --quiet
docker network inspect finance-hub-transport --format '{{.Internal}}'
# Must be true. Do not recreate a mismatched network under this procedure.
# Only after release, using the existing project name/environment/secret-owner UID:
docker compose -f infra/finance-lab/compose.yml -f infra/finance-lab/transport.compose.yml up -d --no-deps api
```

Set the **existing** Compose project name (observed container prefix `finance-lab`) with the operator's current `-p finance-lab`/`COMPOSE_PROJECT_NAME` invocation; do not accidentally create a second deployment. Overlay adds a unique DNS alias `finance-lab-api` on transport. PostgreSQL remains reachable exclusively through `finance-products-db`; migrate remains database-only.

Owner confirmed Compose paths by metadata inspection: n8n `/opt/apps/apps/n8n/docker-compose.yml`, Evolution `/opt/apps/apps/platforms/evolution-main/docker-compose.yml`, Finance `/opt/apps/apps/lab/finance-hub/infra/finance-lab/compose.yml`. The Evolution Compose is not edited. The n8n project/service key still must be checked; a container name does not establish either. Operator obtains only Compose labels from the known n8n container (no full inspect/environment dump):

```sh
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$N8N_CONTAINER"
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$N8N_CONTAINER"
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$N8N_CONTAINER"
docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$N8N_CONTAINER"
```

Back up the original privately before applying the network-only patch:

```sh
cd /opt/apps/apps/n8n
umask 077
cp -p -- docker-compose.yml "docker-compose.yml.pre-m06-$(date -u +%Y%m%dT%H%M%SZ).bak"
```

The separate minimal patch is [n8n.transport.compose.yml](../../../infra/finance-lab/n8n.transport.compose.yml), a Compose merge overlay. It adds only the external network to service `n8n`, leaving all base networks, volumes, ports and other services intact. Confirm the service label equals `n8n`; if different, replace only that service key in the operator copy. Copy it to `/opt/apps/apps/n8n/finance-transport.compose.yml`. Always retain the original Compose project and any existing override files. Validate before applying, with the same project name/environment used by the current deployment:

```sh
# Render only to private local temporary files: config can contain secrets. Never print or upload them.
umask 077
docker compose -f docker-compose.yml config --format json > before-m06.private.json
docker compose -f docker-compose.yml -f finance-transport.compose.yml config --format json > after-m06.private.json
node /opt/apps/apps/lab/finance-hub/integrations/n8n/m06/live/check-n8n-network.mjs before-m06.private.json after-m06.private.json n8n
docker compose -f docker-compose.yml -f finance-transport.compose.yml config --quiet
# Only after operational release; use the confirmed existing project and actual service key:
docker compose -f docker-compose.yml -f finance-transport.compose.yml up -d --no-deps n8n
rm -- before-m06.private.json after-m06.private.json
```

If Node is unavailable on the host, run the checker with an approved local Node runtime against the private files; do not install packages or expose the rendered config as a workaround. The checker verifies that **every value except the two network additions is unchanged**, including volumes and unrelated services. The original file stays untouched. Persist the merged invocation in the operator's deployment/recreation configuration so later updates do not omit the overlay. Alternatively apply the equivalent two additions directly to the original file and validate the rendered before/after comparison; do not replace its network stanza. Minimal direct-edit fragment:

```yaml
networks:
  # Keep all existing entries unchanged.
  finance-hub-transport:
    external: true
    name: finance-hub-transport
```

Do not attach n8n to `finance-products-db`. Validate with the same original Compose files/project/environment using `config --quiet`; inspect only the rendered networks/ports locally without printing environment values. Recreate only the identified n8n service (`up -d --no-deps <actual-service>`) in an approved maintenance window: this restarts a shared application. Confirm its three expected networks, unchanged other-service membership, internal transport flag, no new ports, and n8n → `http://finance-lab-api:3000/health` and `/ready` = 200 after recreation. Record only status/membership, never headers. Failure: revert the two additions and recreate only affected services; do not remove shared networks or volumes.

## 2. Install the thin transport node and import

The accepted P03 JSON is a fail-closed template with unavailable transports. `live/build.mjs` derives this workflow from it and bundles the **unchanged** P02/P03 processors into a private n8n node. A Code node cannot safely be assumed to expose credential helpers. This package uses n8n's real node credential and HTTP APIs, without SQL, financial logic, extra npm dependencies or modifications to accepted P01–P05.

Build on the reviewed checkout using Node 24 and frozen dependencies:

```sh
pnpm install --frozen-lockfile
node integrations/n8n/m06/live/build.mjs
```

Copy the resulting `live/dist/` to a dedicated operator-managed directory. Install as a [private n8n extension](https://docs.n8n.io/integrations/creating-nodes/deploy/install-private-nodes/): mount this directory read-only at `/opt/finance-m06-custom` in the actual n8n service and append this path to `N8N_CUSTOM_EXTENSIONS`, preserving existing extension paths. This is a separate explicit operator change from the minimal network patch. Restart/recreate only n8n during the same authorized maintenance window. Keep existing n8n image/version, database, encryption key, data volume, environment and other workflows unchanged. Never mount Finance secrets into n8n.

Import `integrations/n8n/m06/live/workflow.json` through the n8n UI. It must show inactive, Operational Release=false, and recognized `Finance Lab Transport` node. If unknown, stop and correct extension installation before configuring anything. Built-in Header Auth must be selected on the webhook. Do not pin data or run real payloads in the editor.

Create three distinct encrypted n8n credential records through its credential UI:

| Credential | Binding |
|---|---|
| Header Auth: name `x-finance-webhook`, private random value | Same record on Webhook and Finance Lab Transport |
| Finance Lab Ingest Only | Existing dedicated Finance `finance:ingest` bearer; no admin token |
| Evolution Lab Instance Token | Dedicated Lab instance token for authenticated sends |

No credential IDs/secrets are embedded in the distributed workflow. Distinct secrets are also enforced at runtime. Set fixed Lab instance name, UUID, account JID and Evolution HTTPS origin in the transport node; these must come from the operator's isolated Lab instance. The send destination is fixed configuration, never payload `server_url` or `destination`. The Finance URL is fixed to the transport DNS alias.

Keep save successful/failed/manual execution data disabled, execution progress disabled, no error workflow forwarding payloads. Verify instance-level logging, telemetry/exporters and retention do not override these settings. Workflow returns only sanitized stage/status; caught HTTP failures never expose raw exceptions.

## 3. Dedicated Evolution instance (after separate release)

Create a fresh Lab-only `WHATSAPP-BAILEYS` instance using a separate test number and a unique non-secret instance name. Do not reuse a production instance/session. Record its stable UUID and connected owner JID privately. Do not recreate/rename this instance while retaining the same configured source identity. Use its instance token for outbound calls. Disable unrelated chatbot integrations for this instance; do not globally change other integrations.

Using Evolution Manager/private API tooling, prepare the instance webhook with `enabled: false`, production n8n webhook HTTPS URL, `byEvents: false`, `base64: false`, `events: ["MESSAGES_UPSERT"]`, and `headers` containing only the private `x-finance-webhook`. Do not paste the request body/secret into shell history or Git. Configure this instance's groups-ignore behavior as additional defense; the adapter still filters independently. Confirm settings survive authorized container recreation; do not assume persistence from an API response.

Only after all evidence and operational approval: configure Finance AuthorizedSender and P05 Lab fixtures through authorized administrative tools (never the n8n ingest credential), enable Operational Release, activate the n8n workflow, then enable only the Lab instance webhook. No activation has been executed in this task.

## 4. Retry, acceptance and rollback

Each HTTP call has a 10s timeout, rejects redirects, and returns full status/Retry-After to accepted P03. Maximum three attempts per phase; 500/503/timeouts back off 1s/2s; 429 follows accepted P02 Retry-After policy capped at 30s. Other statuses, including 401/403, do not retry or generate replies. Workflow timeout is 240s. Provider retries can overlap: every delivery reauthenticates and preserves the exact Inbox identity. PostgreSQL owns deduplication. A Finance response loss can result in committed finance without notification. Send retries never re-enter ingest; ambiguous timeout may cause duplicate notifications. Never retry a whole execution merely to recover a reply.

Webhook returns a sanitized stage with HTTP 200 after processing; invalid built-in authentication is rejected before execution. Exhausted Finance/send failures require operator observation/reconciliation, not guaranteed provider redelivery. A worker crash may still cause provider retry. Do not claim exactly-once notification, durable outbound delivery, or automatic recovery after the bounded budget.

Reuse [P05 live matrix](P05-LIVE-VERIFICATION-PLAN.md) and [local expected results](P05-LOCAL-ACCEPTANCE.md): all five commands (`35 almoço nubank`, `empresa 327,40 google ads inter`, `recebi 2500 cliente empresa inter`, `transferi 500 nubank para inter`, `último`), configured defaults/rules and clarification/confirmation paths; forged/missing origin, unauthorized sender, cross-instance mismatch, group/fromMe, duplicate replay, concurrent delivery, Finance response loss and send failure. Record expected versus observed Inbox/Transaction/reply results. Real WhatsApp outcomes remain NOT EXECUTED. A 200 transport response alone is not acceptance.

Rollback order: disable Lab Evolution webhook; deactivate workflow and Operational Release; preserve committed financial history; revoke/rotate only Lab integration credentials if necessary; remove only this extension mount/path and restore previous n8n Compose if reverting package/network; recreate only affected services after operator approval. Finance may return to base Compose to drop its transport attachment while retaining database access. Do not delete sessions, volumes, databases, Inbox rows or shared networks. Do not automatically resend an ambiguous notification. Verify existing services healthy after rollback.
