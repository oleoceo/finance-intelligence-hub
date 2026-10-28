# M06-P03 Finance reply and local dispatch contract

**State:** Owner-approved implementation baseline; exact templates remain subject to Draft PR review. `REPLY_TEXT_LIMIT` is 500 Unicode code points. The 15-minute confirmation TTL is unchanged.

Finance Core presents only post-commit `TransactionRecord` or persisted Last read fields. The amount is a canonical decimal string formatted for its actual `currency` with PT-BR grouping; no floating point conversion is used. Description and option names are normalized, bounded to 120 code points and rejected for control/format characters. Human references must match the canonical uppercase alphanumeric format. Missing or malformed essential fields suppress the reply. Neither n8n nor the presenter invents account, Book, category or transaction details.

| Result | Exact `reply.text` (`\n` is a line break) | Fields / fallback |
|---|---|---|
| Expense | `✅ Gasto registrado! {amount} — {description}.\nRef: {human_ref}` | Persisted type, amount, currency, description, human reference; invalid field: no send |
| Income | `✅ Receita registrada! {amount} — {description}.\nRef: {human_ref}` | Same |
| Transfer | `✅ Transferência registrada! {amount}.\nRef: {human_ref}` | Persisted type, amount, currency and reference; no account names |
| Last present | `Último lançamento: {Gasto|Receita|Transferência} de {amount} em {DD/MM/YYYY}.\nRef: {human_ref}` | Persisted Last type, amount, currency, transaction date and reference; invalid field: no send |
| Last empty | `Nenhum lançamento encontrado neste contexto.` | Null persisted read |
| Select Book, two safe options | `Escolha o contexto:\n1. {name1}\n2. {name2}\nResponda 1 ou 2.` | Session options numbered 1 and 2; unsafe/missing options: context clarification below |
| Select Account, two safe options | `Escolha a conta:\n1. {name1}\n2. {name2}\nResponda 1 ou 2.` | Same; unsafe/missing options: account clarification below |
| Select Book/Account fallback | `Preciso de mais detalhes. Reenvie o comando completo com o contexto ou a conta.` | No guessed name |
| Clarify/select amount | `Qual é o valor? Reenvie o comando completo com o valor.` | Action only |
| Clarify intent | `Não entendi o pedido. Reenvie o comando completo para continuar.` | Action only |
| Clarify/select category, merchant, description, date or destination account | `Preciso de mais detalhes. Reenvie o comando completo com a informação que falta.` | Action only |
| Cancelled | `✅ Solicitação pendente cancelada.` | Terminal result |
| Expired | `⏳ Esta confirmação expirou. Reenvie o comando completo para tentar novamente.` | Terminal result |
| Unknown action, standalone choice, malformed result | No text; `should_send:false` | Fail closed; report unsupported result for review |
| Ignored, duplicate, processing, stale claim | No text; `should_send:false` | No outbound send |
| HTTP 401/403, including unauthorized sender | No automated text/send | Transport stops; no financial detail |

`reply.text` exists only with `should_send:true`. The existing structured result and Inbox identity remain intact. The presenter performs no writes. A safe reply may still fail delivery; that does not change the financial commit.

The inactive `integrations/n8n/m06/p03/workflow.json` requires Gate 0 verified origin/sender binding, an independent `finance:ingest` credential and a separate Evolution send credential before any activation. It calls Finance at most three times with the same Inbox identity for 500/503/timeouts and capped 429 Retry-After, and never blindly retries terminal 4xx. After one successful Finance response, the outbound send loop retries independently at most three times. Outbound retry never calls Finance again. A send timeout is ambiguous and sets `possiblyDelivered`; even a later successful attempt is marked `possiblyDeliveredEarlier`. Delivery is best effort and never claimed exactly once. The workflow returns only redacted stage/status evidence.

Local verification: Core presenter unit tests cover exact templates, persisted fields, currency/date formatting, bounds and fail-closed cases; API tests cover suppressed/auth paths; P03 Node tests cover send/no-send, independent retries, 429, 5xx, terminal 4xx, ambiguous timeout and inactive generated workflow. P01/P02 Node tests and the full CI suites remain regression gates. Real provider send is P05 and requires Gate 0 plus separate authorization.
