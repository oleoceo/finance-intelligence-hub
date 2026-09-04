# 06-WHATSAPP-FLOWS.md

# Finance Intelligence Hub
## WhatsApp Interaction Flows — V0.1

**Documento:** `06-WHATSAPP-FLOWS.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- documentos canônicos `00` a `05`

---

# 1. Objetivo

Definir o comportamento V0.1 do Finance Hub através do WhatsApp.

---

# 2. Architecture

```text
User
↓
WhatsApp
↓
Evolution API
↓
n8n
↓
POST /api/v1/inbox/messages
↓
Finance API
↓
Finance Core
↓
PostgreSQL
↓
structured result
↓
n8n
↓
Evolution
↓
WhatsApp
```

---

# 3. WhatsApp is interface only

WhatsApp não é Source of Truth.

Editar mensagem não corrige Transaction.

Excluir mensagem não executa Void.

---

# 4. Evolution responsibilities

```text
connection
webhook
send
message metadata
```

Não decide regras financeiras.

---

# 5. n8n responsibilities

```text
receive webhook
technical filtering
normalize minimal envelope
call Finance API
deliver reply
controlled retry
```

---

# 6. n8n forbidden responsibilities

Não manter:

```text
financial defaults
financial classification rules
Refund business logic
Void business logic
direct Finance SQL
```

---

# 7. n8n credential

```text
finance:ingest
```

Não possui Admin normal.

---

# 8. Normalized envelope

```json
{
  "source": "whatsapp",
  "source_instance": "evolution-main/principal",
  "source_message_id": "3EB0ABC123",
  "sender_reference": "5511999999999",
  "received_at": "2026-09-04T18:15:00-03:00",
  "raw_text": "35 almoço nubank",
  "message_context": {
    "is_group": false,
    "from_me": false
  }
}
```

---

# 9. Inbox technical identity

```text
source
+
source_instance
+
source_message_id
```

---

# 10. Authorization order

Antes de persistir conteúdo:

```text
service auth
↓
technical validation
↓
group/fromMe
↓
sender normalization
↓
AuthorizedSender
↓
Inbox persistence
```

---

# 11. Unauthorized sender

```text
0 Finance Inbox raw_text
0 Transaction
0 Confirmation
```

Política inicial:

```text
no WhatsApp reply
```

---

# 12. Group

Ignored.

---

# 13. from_me

Ignored.

---

# 14. Technical events

Ignorar:

```text
read receipts
delivery receipts
typing
presence
connection events
```

---

# 15. V0.1 input

Obrigatório:

```text
text
```

Audio/image/PDF não fazem parte do núcleo V0.1.

---

# 16. Inbox lifecycle

```text
received
processing
needs_confirmation
processed
failed
ignored
```

---

# 17. Duplicate processed message

Mesmo ID técnico:

```text
no new financial effect
reply.should_send = false
```

por padrão.

---

# 18. Failed retry

Mesma InboxMessage poderá ser reprocessada.

---

# 19. Stale processing

Inbox presa em `processing` após timeout poderá ser retomada na mesma linha.

---

# 20. Exactly-once objective

```text
exactly-once logical financial effect
```

Não prometer exatamente uma entrega externa do reply.

---

# 21. Manual repeated message

Mesma frase com IDs de mensagem diferentes pode representar duas operações reais.

---

# 22. One financial command per message

Exemplo não suportado silenciosamente:

```text
35 almoço e 20 estacionamento
```

Responder pedindo uma Transaction por mensagem.

---

# 23. Intents

```text
create_transaction
update_transaction
void_transaction
refund_transaction
query_last
query_summary
unknown
```

---

# 24. Transaction types

Somente:

```text
expense
income
transfer
```

Refund é intent conversacional, não `Transaction.type`.

---

# 25. Ambiguity

Não criar Transaction intermediária.

```text
Inbox
↓
Confirmation
↓
posted Transaction
```

---

# 26. Parsing precedence

```text
explicit user instruction
↓
manual ClassificationRule
↓
known deterministic alias/mapping
↓
deterministic parser
↓
AI fallback
↓
Confirmation
```

---

# 27. Amount parsing

Exemplos:

```text
35
35,90
R$ 35,90
1.250,90
```

Canonical:

```text
35.00
35.90
1250.90
```

---

# 28. Amount invariant

```text
amount > 0
```

---

# 29. Financial date

Se nenhuma data for informada:

```text
transaction_date
=
received local date
in Book timezone
```

---

# 30. Relative dates

Suportar:

```text
hoje
ontem
anteontem
```

---

# 31. Explicit dates

Pt-BR:

```text
03/09
03/09/2026
```

---

# 32. Future date

Se:

```text
transaction_date > today in Book timezone
```

não criar Transaction `posted`.

---

# 33. Book resolution

```text
explicit Book
↓
safe ClassificationRule
↓
AuthorizedSender.default_book_id
↓
single eligible active Book
↓
Confirmation
```

---

# 34. Account resolution

```text
explicit Account
↓
rule/deterministic mapping
↓
AuthorizedSender.default_account_id
↓
single eligible active Account
↓
Confirmation
```

---

# 35. Category

Optional.

Pode ser inferida, mas ausência não bloqueia lançamento válido.

---

# 36. Merchant

Optional.

---

# 37. Inactive entities

Nunca utilizar em nova Transaction:

```text
inactive Book
inactive Account
inactive Category
inactive Merchant
```

---

# 38. AI

Fallback opcional.

Casos básicos devem funcionar sem AI.

---

# 39. AI output

Structured candidate only.

Sempre passa por Finance Core.

---

# 40. Create Expense

Mensagem:

```text
35 almoço nubank
```

Resultado:

```text
type = expense
status = posted
amount = 35.00
Account = Nubank
transaction_date = Book-local date
```

---

# 41. Expense reply

```text
✅ Gasto registrado

R$ 35,00
Almoço

Conta: Nubank
Categoria: Alimentação
Contexto: Pessoal
Data: 04/09/2026

Ref: A83K2P
```

---

# 42. Business Expense

```text
empresa 327,40 google ads inter
```

pode resolver:

```text
Book = Empresa
Account = Inter
Merchant = Google Ads
Category = Marketing > Tráfego Pago
```

quando regras/configuração tornarem isso seguro.

---

# 43. Create Income

```text
recebi 2500 cliente empresa inter
```

Resulta em ordinary Income:

```text
type = income
status = posted
refund_of_transaction_id = null
```

---

# 44. Create Transfer

```text
transferi 500 nubank para inter
```

Resulta em:

```text
type = transfer
status = posted
source = Nubank
destination = Inter
```

---

# 45. Transfer invariants

```text
source != destination
same Book
same currency
```

Cross-Book rejeitada.

---

# 46. Query Last

```text
último
último empresa
```

---

# 47. Last semantics

```text
most recently created posted Transaction
```

Ordering:

```text
created_at DESC
id DESC
```

---

# 48. WhatsApp Last context

Se Book não for explícito, usar default Book quando válido.

---

# 49. Query Summary

```text
resumo
resumo pessoal
resumo empresa
```

---

# 50. Summary default

Período default:

```text
current month
```

Book default pode vir de AuthorizedSender.

---

# 51. Summary reply

```text
📊 Resumo — Setembro/2026

Receitas: R$ 5.000,00
Despesas brutas: R$ 3.400,00
Estornos: R$ 200,00
Despesas líquidas: R$ 3.200,00
Resultado: R$ 1.800,00

Contexto: Pessoal
```

---

# 52. Summary semantics

Refund não aumenta receita ordinária.

Transfer não entra.

Voided não entra.

---

# 53. Correction

```text
corrige último para 38,90
```

---

# 54. Correction target

Ao interpretar “último”, capturar imediatamente:

```text
target transaction ID
target version
```

---

# 55. Clear correction

Pode executar sem segunda confirmação quando:

```text
target unambiguous
change unambiguous
version valid
```

---

# 56. Correctable fields

Conforme invariantes:

```text
amount
account
category
merchant
description
notes
transaction_date
```

---

# 57. Refund correction

Refund não aceita correction normal.

Fluxo:

```text
Void Refund
↓
Create correct Refund
```

---

# 58. Wrong Book correction

```text
Void wrong Transaction
↓
Create correct Transaction
```

---

# 59. Void intent

```text
apaga último
cancela último
remove A83K2P
```

Mapear para:

```text
void_transaction
```

---

# 60. Void always confirmed

WhatsApp nunca executa Void diretamente.

---

# 61. Void Confirmation

```text
O lançamento é:

R$ 38,90
Almoço
Nubank
04/09/2026
Ref: A83K2P

Deseja cancelar?

1. Sim
2. Não
```

---

# 62. Void target safety

Confirmation armazena:

```text
target_entity_id
target_version
```

---

# 63. Stale Void

Se versão mudou:

```text
0 Void
revalidate
```

---

# 64. Original Expense with posted Refund

Não pode ser voided.

Reply:

```text
Esse lançamento possui estornos ativos.

Cancele primeiro os estornos vinculados.
```

Internamente a regra se refere especificamente a Refunds `posted`.

---

# 65. Refund intent

```text
amazon estornou 200
estorna 200 da compra A83K2P
```

---

# 66. Refund resulting Transaction

Após confirmação:

```text
type = income
status = posted
refund_of_transaction_id = original Expense
```

---

# 67. Refund target resolution

Prioridade:

```text
human_ref
↓
Merchant + amount/date/context
↓
recent candidates
↓
Confirmation
```

---

# 68. Refund target requirements

```text
original type = expense
original status = posted
```

---

# 69. Refund amount

```text
> 0
<= refundable_remaining
```

---

# 70. Partial/Multiple Refunds

Permitidos enquanto:

```text
sum(posted Refunds)
<=
original Expense amount
```

---

# 71. Refund date

```text
refund transaction_date
>=
original transaction_date
```

---

# 72. Refund Book/Currency

Herdados da original.

---

# 73. Refund Account

Se não explicitada:

```text
use original Account only if safe
otherwise Confirmation
```

---

# 74. Refund always confirmed

Mesmo target/amount claros:

```text
Confirmation required
```

---

# 75. Refund Confirmation

```text
Registrar estorno?

Compra original:
Amazon
R$ 500,00
02/09/2026

Estorno:
R$ 200,00

1. Sim
2. Não
```

---

# 76. Refund target version

Confirmation guarda:

```text
target_entity_id
target_version
```

---

# 77. Refund result

```text
Income Transaction
+
refund relation
+
Audit
```

---

# 78. Refund overflow

Rejeitar.

---

# 79. Void Refund

Permitido pelo mesmo fluxo de Void, também com confirmação WhatsApp.

---

# 80. ConfirmationSession lifecycle

```text
pending
confirmed
cancelled
expired
```

---

# 81. Confirmation TTL

```text
15 minutes
```

default configurável.

---

# 82. One pending per sender

Máximo:

```text
1 pending
per channel + sender
```

---

# 83. Short replies

Com Confirmation pendente:

```text
sim
não
1
2
```

têm precedência contextual.

---

# 84. New full command

Novo comando completo:

```text
old Confirmation
→ cancelled

resolution_reason
=
superseded_by_new_command
```

Novo comando é processado.

---

# 85. Confirmation origin/resolution

Guardar:

```text
inbox_message_id
resolved_by_inbox_message_id
```

---

# 86. Expired Confirmation

Resposta tardia não executa ação.

---

# 87. Unknown intent

Não cria Transaction.

Reply com exemplos básicos.

---

# 88. Help

Pode responder com:

```text
35 almoço nubank
empresa 327,40 google ads inter
recebi 2500 cliente empresa inter
transferi 500 nubank para inter
último
resumo
corrige último para 38,90
cancela último
estorna 200 da compra A83K2P
```

---

# 89. Reply delivery failure

Se Finance commitou e Evolution falhou:

```text
financial state remains valid
```

Não reexecutar a Transaction para reenviar resposta.

---

# 90. n8n retries

```text
401/403
→ no blind retry

400/409/422
→ no blind retry

429
→ respect Retry-After

500/503
→ controlled backoff
```

---

# 91. Retry identity

Sempre preservar:

```text
source
source_instance
source_message_id
```

---

# 92. Logging

Pode registrar:

```text
source_message_id
source_instance
correlation_id
HTTP status
reply_id
```

Não logar secrets.

Evitar raw WhatsApp text em logs operacionais.

---

# 93. Prompt injection

Mensagem maliciosa é dado não confiável.

Não concede privilégio administrativo.

---

# 94. Success replies

Construir preferencialmente a partir de dados persistidos após COMMIT.

Não deixar AI inventar confirmação de sucesso.

---

# 95. Not supported V0.1

```text
multiple financial commands per message
cross-Book Transfer
future posted Transaction
installments
recurrence
audio transcription
receipt OCR
price intelligence
vehicle analytics
```

---

# 96. n8n workflow

```text
Evolution Webhook
↓
technical validation/filter
↓
minimal envelope
↓
Finance API
↓
structured response
↓
reply.should_send?
├── yes → Evolution send
└── no  → End
```

---

# 97. E2E — Expense

```text
35 almoço nubank
```

Expected:

```text
1 Inbox
1 Interpretation
1 posted Expense
Audit
reply
```

---

# 98. E2E — Missing Account

Expected:

```text
needs_confirmation
0 Transaction
```

---

# 99. E2E — Duplicate processed webhook

```text
1 logical financial effect
```

---

# 100. E2E — Failed retry

Mesma InboxMessage reutilizada.

---

# 101. E2E — Unauthorized sender

```text
0 Transaction
0 Finance Inbox raw_text
```

---

# 102. E2E — Void

```text
command
+
confirmation
```

---

# 103. E2E — Refund

```text
command
+
confirmation
↓
linked Income
```

---

# 104. E2E — Summary

Depois do módulo de reporting:

```text
resumo
```

deve percorrer o mesmo pipeline fino de WhatsApp, sem lógica de report no n8n.

---

# 105. Core UX goal

Caso normal:

```text
35 almoço nubank
```

deve exigir apenas uma mensagem quando Book/Account puderem ser resolvidos com segurança.

---

# 106. Final ambiguity rule

Se campo crítico não puder ser resolvido com segurança:

```text
do not guess
```

Usar Confirmation ou pedir reformulação.

---

# 107. Final persistence rule

Transaction:

```text
nasce posted
ou
não nasce
```

---

# 108. Correção específica desta v0.3.1

A única data financeira da Transaction usada pelo fluxo WhatsApp V0.1 é:

```text
transaction_date
```

Nenhum horário financeiro específico é inferido ou persistido.

---

# 109. Condição para Freeze

Promover para:

```text
FROZEN — Baseline for Implementation
```

após PASS mecânico final contra o ledger.
