# M06-LIVE-T03 — WhatsApp LID compatibility

**Status:** IMPLEMENTED / PR #40 MERGED / DEPLOYED IN LAB — LIVE ACCEPTANCE EVIDENCE REVIEW REQUIRED
**Authorization:** Owner request 2026-10-29. Branch, Draft PR and CI authorized; no VPS deployment, real message processing or merge.

Scope: `integrations/n8n/m06/live/`, this task record, `docs/integrations/m06/` and `PROJECT_STATE.md`. Preserve M06 processors, Finance API, database, Evolution and migrations. Accept only authenticated Evolution 2.3.7 `messages.upsert` private text with `addressingMode=lid` when `remoteJid` and `remoteJidAlt` are identical valid phone JIDs. All existing identity and authorization gates remain.

Upstream provenance: Evolution 2.3.7 `whatsapp.baileys.service.ts` `prepareMessage` assigns `key: message.key` from the received Baileys message (line 4657). Immediately before `sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw)`, lines 1478–1483 replace a LID `remoteJid` with `remoteJidAlt` when present. `addressingMode` is not changed. Source: https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts

Validation (2026-10-29): independent code review accepted PR #40 at head `cbd45f0596b63c11cad47fb4347862c214e4622a`; squash merge to `e43d63cfda4d6e0685dc0260c0ac419a3304909b` and post-merge CI #40931394789 SUCCESS. Private n8n Finance Lab Transport extension updated in VPS Lab (operator reported `M06 EXTENSAO LID ATUALIZADA`), and an actual LID-originating WhatsApp expense was processed and confirmed by PostgreSQL/WhatsApp. Formal M06 milestone acceptance remains pending; see [live evidence](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md). Original task authorization above is historical, not a claim of current unexecuted state.
