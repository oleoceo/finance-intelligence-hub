# M06-P03 exact reply policy — proposed for human review

**Decision state:** PENDING. None of these texts is approved or implemented. The presenter and outbound dispatch remain behind this decision boundary.

## Authoritative data and bounds

`processInboxMessage` returns after the Inbox processing transaction completes. For `transaction_created`, use only its returned `TransactionRecord.type`, canonical decimal-string `amount`, `transactionDate` and `humanRef`. For `query_last`, use only the returned persisted `TransactionReadRecord` when non-null. The API currently serializes these fields as `data.result.transaction.type`, `amount`, `transaction_date`, and `human_ref`. No account, Book, category, merchant or description **name** is returned. UUIDs, raw text, internal statuses and errors are forbidden in text. The presenter reads the result and performs no financial writes.

Proposed maximum: **320 Unicode code points** for every outbound `reply.text`, including numbered choices. Amount is formatted from the canonical decimal string as `R$ 1.234,56` without binary floating point. A dynamic value that is missing, malformed, overlong or unsafe causes a safe fixed fallback only where specified below; it never exposes a partial success or silently truncates a name. No text is produced unless `should_send:true`.

| Result / situation | Send? | Exact proposed PT-BR text (`\n` means line break) | Permitted fields and source | Absent/unsafe field; pending state | Exact test cases |
|---|---|---|---|---|---|
| `transaction_created`, `expense` | Yes | `✅ Gasto registrado: R$ {amount}.\nRef: {human_ref}` | `type`, `amount`, `humanRef` from post-commit `TransactionRecord` | Required fields invalid: fail closed, no send; no confirmation pending | `expense_exact_text`, `expense_decimal_format`, `expense_invalid_field_no_send` |
| `transaction_created`, `income` | Yes | `✅ Entrada registrada: R$ {amount}.\nRef: {human_ref}` | Same | Same | `income_exact_text`, `income_invalid_field_no_send` |
| `transaction_created`, `transfer` | Yes | `✅ Transferência registrada: R$ {amount}.\nRef: {human_ref}` | Same; no source/destination account names | Same | `transfer_exact_text`, `transfer_no_account_invention` |
| `query_last`, transaction present | Yes | `Última transação: {kind} de R$ {amount} em {date}.\nRef: {human_ref}` where `{kind}` is exactly `gasto`, `entrada` or `transferência`, and `{date}` is `DD/MM/YYYY` | `type`, `amount`, `transactionDate`, `humanRef` from persisted `TransactionReadRecord` | Invalid required field: fail closed, no send; no confirmation pending | `last_exact_each_type`, `last_date_format`, `last_invalid_field_no_send` |
| `query_last`, transaction null | Yes | `Nenhuma transação encontrada.` | Null read result | No dynamic fields; no confirmation pending | `last_empty_exact_text` |
| `confirmation_required`, `action=clarify_intent` | Yes | `Não entendi o pedido. Envie um comando completo para continuar.` | Accepted action only | Unknown action: fail closed; confirmation remains pending | `clarify_intent_exact_text`, `unknown_action_no_send` |
| `confirmation_required`, `action=select_amount` or `clarify_amount` | Yes | `Qual é o valor? Envie um novo comando completo com o valor.` | Accepted action only | No dynamic fields; confirmation remains pending | `clarify_amount_exact_text` |
| `confirmation_required`, `action=select_book/account/category/merchant/description/date/destinationAccount` or matching `clarify_*`, without exactly two safe options | Yes | `Preciso de mais detalhes para continuar. Envie um novo comando completo.` | Accepted action only; no names inferred | No dynamic fields; confirmation remains pending | `clarify_generic_exact_text`, `clarify_missing_options` |
| `confirmation_required`, `action=select_book` with exactly two valid options | Yes | `Escolha o contexto:\n1. {name1}\n2. {name2}\nResponda 1 ou 2.` | Option `number` and `name` from the persisted confirmation session result; numbers must be exactly 1 and 2 | Unsafe/oversize/missing option: generic clarification text above; confirmation remains pending | `book_choices_exact_text`, `choices_unsafe_name_fallback`, `choices_bound` |
| `confirmation_required`, `action=select_account` with exactly two valid options | Yes | `Escolha a conta:\n1. {name1}\n2. {name2}\nResponda 1 ou 2.` | Same | Same | `account_choices_exact_text`, `choices_no_ids` |
| `cancelled` | Yes | `Confirmação cancelada. Nenhuma transação foi criada por essa resposta.` | Result type only | No dynamic fields; pending confirmation ends | `cancelled_exact_text` |
| `expired` | Yes | `A confirmação expirou. Envie um novo comando completo.` | Result type only | No dynamic fields; pending confirmation ends | `expired_exact_text` |
| `choice` (if ever returned without another result) | Yes | `Escolha recebida. Aguarde a próxima orientação.` | Result type only | No dynamic fields; confirmation may remain pending; inspect actual processor reachability before implementation | `choice_exact_text_or_unreachable` |
| Safe unsupported/validation result routed to `confirmation_required` | Yes | Use the relevant clarification text above; never quote parser reason or raw input | Confirmation `action` only | Confirmation remains pending | `unsupported_clarifies`, `invalid_amount_clarifies`, `no_raw_error` |
| `ignored`, `duplicate_message`, `processing`, `stale_claim` | No | No `reply.text` property | Result type only | No outbound send | `suppressed_each_no_text_no_send` |
| HTTP 401/403, including missing/bad ingest token and unauthorized sender | No | No reply object or outbound text from the error response | HTTP status only for transport control | No automated WhatsApp reply, no financial detail | `auth_401_no_send`, `scope_403_no_send`, `sender_403_no_send` |

## Review decisions required

1. Approve or revise **each exact text** and the 320-code-point limit.
2. Approve use of `human_ref` in success/Last replies. It is a human-facing reference, but its release through WhatsApp still requires this explicit safe-field decision.
3. Approve option names from the persisted confirmation result, subject to length/control-character checks; no option UUIDs are exposed.
4. Decide whether the `choice` result should ever be sendable. The current processor appears to return a subsequent confirmation or final result instead; this row is defensive until reachability is verified.

After approval, tests must also prove exact text, amount/date formatting, bound enforcement, unchanged M05 result shape, zero presenter financial writes, no secret/raw error exposure, and no send for suppressed/error states. Outbound retries must use the same Finance-authored text and verified recipient without re-ingest.
