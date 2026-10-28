# M06-P05 local acceptance evidence

**Scope:** synthetic trusted ingress, generated inactive n8n P03 workflow, Finance Inbox API, ephemeral PostgreSQL 18.6 Testcontainers database, simulated outbound transport. No provider or live environment was contacted. Live verification: **NOT EXECUTED**.

## Reproduction and fixture

Run `pnpm exec vitest run --config integrations/n8n/m06/p05/vitest.config.ts` from a native WSL checkout after `pnpm install --frozen-lockfile`. The harness executes the generated `workflow.json` Code node with an explicit synthetic `verify` binding, uses `buildApp` and `app.inject` for the actual Finance API, and queries migrated PostgreSQL through `t02Database()`. Verification is fixture evidence only; the inactive template still fails closed without a real provider binding. The send adapter records requests and never calls a provider.

Clock: `2026-10-28T12:00:00Z`; Book timezone `America/Sao_Paulo`. Books: active Empresa and Pessoal, both BRL. Accounts: active Empresa/Nubank, Empresa/Inter, Pessoal/Carteira, all BRL. Primary active AuthorizedSender has default Book Empresa and default Account Nubank. Secondary senders cover Empresa with no default Account, no default Book or Account, and empty Pessoal with default Carteira. No classification rules, categories, or merchant fixtures are needed. This configuration deliberately selects Nubank for the first three commands; `inter` in expense and income descriptions does not select Inter. A different configured default or an applicable approved rule changes the resolved Account. Without a default or unique eligible choice, Finance requests clarification.

All accepted messages use canonical identity `(source='whatsapp', source_instance='local', source_message_id=<stable synthetic messageId>)`; each new user message receives a new ID and replay retains the original ID. The sender is bound from the synthetic trusted metadata; the workflow forwards `received_at`, exact `raw_text`, and false group/from_me flags. No Book, Account, amount or financial operation is inferred in n8n.

## Five-command matrix

`<REF>` below is the Finance-generated uppercase human reference persisted on the corresponding Transaction. Replies are asserted as exact strings after substituting that persisted reference. All sends use the verified recipient and Finance-owned text verbatim.

| Exact command | Parser fields | Resolution / Inbox / financial result | Exact reply and send |
|---|---|---|---|
| `35 almoço nubank` | expense, `35.00`, description `almoço nubank`; no explicit Book or Account | Sender defaults resolve Empresa/Nubank; processed Inbox; posted expense BRL 35.00; one Transaction, Audit, completed idempotency key | `✅ Gasto registrado! R$ 35,00 — almoço nubank.\nRef: <REF>`; one simulated send |
| `empresa 327,40 google ads inter` | expense, explicit Book `empresa`, `327.40`, description `google ads inter`; no explicit Account | Empresa/Nubank by sender default; processed Inbox; posted expense BRL 327.40; one Transaction, Audit, completed idempotency key | `✅ Gasto registrado! R$ 327,40 — google ads inter.\nRef: <REF>`; one simulated send |
| `recebi 2500 cliente empresa inter` | income, `2500.00`, description `cliente empresa inter`; no explicit Book or Account | Empresa/Nubank by sender defaults; processed Inbox; posted income BRL 2500.00; one Transaction, Audit, completed idempotency key | `✅ Receita registrada! R$ 2.500,00 — cliente empresa inter.\nRef: <REF>`; one simulated send |
| `transferi 500 nubank para inter` | transfer, `500.00`, explicit source `nubank`, explicit destination `inter`; no explicit Book | Default Empresa; distinct active Empresa/Nubank → Empresa/Inter, BRL; processed Inbox; posted transfer and one Transaction, Audit, completed idempotency key | `✅ Transferência registrada! R$ 500,00.\nRef: <REF>`; one simulated send |
| `último` | `query_last`, no amount/Book/Account | Default Empresa; processed Inbox; latest posted transfer by `created_at DESC, id DESC`; no Transaction, Audit or idempotency write | `Último lançamento: Transferência de R$ 500,00 em 28/10/2026.\nRef: <REF>`; one simulated send |

For a sender whose default Book is an empty Pessoal Book, `último` returns `query_last` with `transaction:null`, exact text `Nenhum lançamento encontrado neste contexto.`, one send, and no financial write. Last remains read only.

## Clarification and negative outcomes

An Empresa sender without a default Account receives `select_account` with two numbered options and the Finance-owned `Escolha a conta` prompt. A valid `1` confirms the session and creates one posted expense. A sender without a Book default receives `select_book`; a valid `1` selects the first offered Book. Empresa then requires a numbered Account choice; Pessoal has one eligible Account and creates the expense immediately. The prompt preserves the P03 UTC expiry wording: `Confirmação expira em 28/10/2026 às 12:15:00 UTC.` No financial write occurs before the completed choice.

Forged origin, conflicting sender, cross-instance event, group and `from_me` are rejected by the generated workflow before Finance and send. An unknown but internally consistent sender reaches Finance, receives 403, stores no raw Inbox, and triggers no send. Synthetic 401/403 Finance responses produce no automated reply. Same-identity replay returns `duplicate_message` and no reply with one total financial effect. A lost post-commit Finance response retries the exact identity; the duplicate result suppresses send and preserves one Transaction. Terminal outbound failure leaves the committed Transaction intact. Outbound delivery is best effort; ambiguous send timeouts may have delivered a reply and must never restart Finance processing.

## Local validation status

The dedicated P05 suite uses real PostgreSQL and passed 25/25 tests locally. Native P01–P04 regression suites passed 84/84. The repository baseline passed 1,023 unit tests and 453 real PostgreSQL integration tests, after frozen install, lint, format check, build, and typecheck passed. GitHub Actions evidence is reported separately at the Draft PR exact head. P01–P04 native regression suites and full Vitest PostgreSQL integration remain separate from this suite. Gate 0/B/C remain NOT EXECUTED, and a local PASS does not establish live M06 acceptance.
