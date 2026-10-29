# M06-LIVE-T03 — WhatsApp LID compatibility

**Status:** REVIEW REQUIRED
**Authorization:** Owner request 2026-10-29. Branch, Draft PR and CI authorized; no VPS deployment, real message processing or merge.

Scope: `integrations/n8n/m06/live/`, this task record, `docs/integrations/m06/` and `PROJECT_STATE.md`. Preserve M06 processors, Finance API, database, Evolution and migrations. Accept only authenticated Evolution 2.3.7 `messages.upsert` private text with `addressingMode=lid` when `remoteJid` and `remoteJidAlt` are identical valid phone JIDs. All existing identity and authorization gates remain.

Upstream provenance: Evolution 2.3.7 `whatsapp.baileys.service.ts` `prepareMessage` assigns `key: message.key` from the received Baileys message (line 4657). Immediately before `sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw)`, lines 1478–1483 replace a LID `remoteJid` with `remoteJidAlt` when present. `addressingMode` is not changed. Source: https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts

Validation: M06 tests and full CI. Result remains REVIEW REQUIRED until independent review; no live release.
