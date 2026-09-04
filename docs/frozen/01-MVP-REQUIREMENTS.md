# 01-MVP-REQUIREMENTS.md

# Finance Intelligence Hub
## MVP Requirements — V0.1

**Documento:** `01-MVP-REQUIREMENTS.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`

---

# 1. Objetivo da V0.1

A V0.1 deverá entregar um núcleo financeiro pessoal self-hosted capaz de:

```text
registrar
consultar
corrigir
cancelar
estornar
classificar
auditar
exportar
recuperar
```

operações financeiras através de API direta e WhatsApp.

O produto deverá continuar funcional mesmo sem:

```text
Firefly
Metabase
dashboard próprio
AI
```

---

# 2. Source of Truth

A fonte canônica de verdade será:

```text
PostgreSQL do Finance Intelligence Hub
```

Não serão Source of Truth:

```text
WhatsApp
Evolution
n8n
Redis
Firefly
Metabase
```

---

# 3. Escopo funcional V0.1

Obrigatório:

```text
Books
Accounts
Categories
Merchants
ClassificationRules
AuthorizedSenders

InboxMessage
Interpretation
ConfirmationSession

Expense
Income
Transfer
Refund vinculado
Correction
Void

Audit
API idempotency

WhatsApp
Last Transaction
Summary
CSV Export

Security
Backup
Restore
```

---

# 4. Fora do escopo V0.1

Não implementar inicialmente:

```text
Firefly integration
Metabase
custom dashboard

installments
recurring transactions
planned transactions
FX

products
price intelligence
receipts
OCR
vehicles
fuel analytics
bank imports
reconciliation

multi-user SaaS
```

---

# 5. Book

Book representa contexto financeiro.

Exemplos configuráveis:

```text
Pessoal
Empresa
```

Não hardcode esses nomes como domínio obrigatório.

---

# 6. Book requirements

Cada Book deverá possuir:

```text
id
name
currency
timezone
active/archive state
```

---

# 7. Currency V0.1

Cada Book possui uma única moeda operacional.

Invariante:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

Default inicial esperado:

```text
BRL
```

mas a moeda pertence ao Book.

---

# 8. FX

Conversão cambial não pertence à V0.1.

---

# 9. Book archive

Book inativo:

```text
continua consultável
não aceita novas Transactions
```

---

# 10. Account

Account representa local financeiro.

Tipos mínimos:

```text
checking
savings
cash
credit_card
other
```

---

# 11. Account requirements

Expense e Income exigem Account.

Transfer exige:

```text
source Account
destination Account
```

---

# 12. Account invariants

```text
Account belongs to one Book

Account.currency = Book.currency

inactive Account cannot be used in new Transaction

source != destination in Transfer
```

---

# 13. Cross-Book Transfer

Não suportada na V0.1.

O sistema não deverá converter silenciosamente uma Transfer cross-Book em Expense + Income.

---

# 14. Credit card semantics

Compra em cartão:

```text
Expense
against credit_card Account
```

Pagamento de fatura futuro:

```text
Transfer
```

e não uma segunda Expense.

---

# 15. Category

Category é classificação financeira pertencente a Book.

Pode possuir hierarquia.

---

# 16. Category hierarchy

Regras:

```text
parent belongs to same Book

direct self-parent forbidden

longer cycles forbidden

same child name allowed under different parents

root normalized name unique within Book

child normalized name unique within parent
```

---

# 17. Category optionality

Category é opcional em Transaction.

Ausência de Category não deverá impedir um lançamento financeiramente válido.

---

# 18. Merchant

Merchant representa contraparte comercial/econômica.

Pode ser utilizado por múltiplos Books.

---

# 19. Merchant alias recognition

Reconhecimento inicial de variações de Merchant poderá utilizar:

```text
ClassificationRule
+
deterministic matching
```

Não é requisito da V0.1 possuir entidade/tabela dedicada de aliases.

---

# 20. ClassificationRule

V0.1 deverá permitir regras persistentes simples de classificação.

Campos conceituais mínimos:

```text
priority
active
match_type
pattern

target_book_id
target_account_id
target_category_id
target_merchant_id

source
```

---

# 21. ClassificationRule targets

Pelo menos um target deverá existir.

Targets precisam formar contexto compatível.

---

# 22. ClassificationRule source

Valores internos:

```text
manual
system
```

Regras criadas por operação administrativa normal recebem:

```text
source = manual
```

definido pelo servidor.

`system` fica reservado a fluxos internos controlados.

---

# 23. Classification precedence

Ordem canônica:

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
ConfirmationSession
```

---

# 24. Transaction

Tipos canônicos V0.1:

```text
expense
income
transfer
```

Nenhum outro tipo.

---

# 25. Transaction status

Somente:

```text
posted
voided
```

---

# 26. Ambiguidade não vira Transaction

Não existe Transaction intermediária aguardando confirmação.

Fluxo:

```text
InboxMessage
↓
Interpretation
↓
ConfirmationSession
↓
Transaction posted
```

ou nenhuma Transaction.

---

# 27. Transaction fields obrigatórios/conceituais

A Transaction V0.1 deverá suportar:

```text
id
human_ref

book_id
type
status

amount
currency

account_id
destination_account_id

category_id
merchant_id

description
notes

transaction_date

source
source_reference
inbox_message_id

refund_of_transaction_id

version

voided_at
void_reason

created_at
updated_at
```

---

# 28. Transaction financial date

A data financeira canônica é:

```text
transaction_date
```

Tipo lógico:

```text
DATE
```

---

# 29. Sem horário financeiro específico na V0.1

A V0.1 não precisa armazenar horário do acontecimento financeiro.

Para rastreabilidade técnica existem:

```text
created_at
updated_at
```

---

# 30. Relative dates

Expressões como:

```text
hoje
ontem
anteontem
```

serão resolvidas usando o timezone do Book.

Default inicial:

```text
America/Sao_Paulo
```

---

# 31. Future dates

Transaction `posted` representa evento ocorrido.

Portanto:

```text
transaction_date
<=
today in Book timezone
```

---

# 32. Money

Dinheiro nunca será representado por float.

Precisão física esperada:

```text
NUMERIC(18,2)
```

Na API:

```text
decimal string
```

Exemplo:

```json
{
  "amount": "35.90"
}
```

---

# 33. Amount

Sempre positivo:

```text
amount > 0
```

A direção financeira vem de `type`.

---

# 34. Expense

Expense representa saída financeira.

Obrigatório:

```text
Book
Account
Amount
Description
Transaction Date
```

---

# 35. Income

Income representa entrada financeira.

Pode representar:

```text
ordinary income
```

ou:

```text
Refund
```

dependendo da relação existente.

---

# 36. Ordinary Income

Possui:

```text
type = income
refund_of_transaction_id = null
```

---

# 37. Refund

Refund não é um `Transaction.type`.

Refund é:

```text
type = income
+
refund_of_transaction_id = original Expense
```

---

# 38. Refund target

A original precisa ser:

```text
Expense
posted
```

---

# 39. Refund requirements

Obrigatório suportar:

```text
partial Refund
full Refund
multiple Refunds
```

---

# 40. Refund invariants

```text
refund amount > 0

Refund Book = original Book

Refund currency = original currency

Refund date >= original Expense date

Refund cannot target another Refund

sum(posted Refunds)
<=
original Expense amount
```

---

# 41. Concurrent Refund

Requests concorrentes não poderão produzir over-refund.

A implementação deverá proteger a Expense original dentro da transação de banco.

---

# 42. Refund Account

Representa onde o dinheiro retornou.

Quando seguro, poderá ser inferida da Account da Expense original.

Se não for seguro:

```text
ConfirmationSession
```

---

# 43. Refund creation

Generic Transaction create não poderá criar Refund.

Refund utiliza operação dedicada.

---

# 44. Refund correction

Refund é imutável na V0.1, exceto Void.

Refund errado:

```text
Void Refund
↓
Create correct Refund
```

---

# 45. Expense correction after Refund

Nova quantidade deverá respeitar:

```text
new Expense amount
>=
total posted Refunds
```

---

# 46. Expense date correction after Refund

A Expense não poderá ser movida para data posterior a um Refund `posted` vinculado.

---

# 47. Void Expense with Refund

Expense original com Refund `posted` não poderá ser voided.

Fluxo:

```text
Void Refund(s)
↓
Void Expense
```

---

# 48. Transfer

Transfer representa movimentação interna entre Accounts.

Regras:

```text
source != destination

same Book

same currency

amount > 0
```

Transfer não participa dos totais de receitas/despesas.

---

# 49. Correction

Correction atualiza Transaction existente.

Campos permitidos, conforme invariantes:

```text
amount
account_id
category_id
merchant_id
description
notes
transaction_date
```

---

# 50. Immutable Transaction fields

Não alterar por PATCH comum:

```text
id
human_ref
book_id
type
status
source
refund_of_transaction_id
created_at
```

---

# 51. Wrong Book

Book incorreto não será corrigido por PATCH normal.

Fluxo:

```text
Void wrong Transaction
↓
Create correct Transaction
```

---

# 52. Versioning

Transaction deverá possuir:

```text
version
```

Operações stale-sensitive devem utilizar optimistic locking.

---

# 53. Void

Void altera:

```text
posted
→
voided
```

sem apagar histórico.

---

# 54. Delete

Não haverá hard delete normal de Transaction através da API financeira.

---

# 55. Last Transaction

“Último” significa:

```text
most recently created posted Transaction
```

no Book aplicável.

Ordenação:

```text
created_at DESC
id DESC
```

---

# 56. Retroactive launch

Uma Transaction criada agora com `transaction_date` antiga poderá ser “último”, pois “último” se refere à criação, não à maior data financeira.

---

# 57. Last direct API

Na API direta V0.1:

```text
book_id required
```

---

# 58. WhatsApp Last

Pode utilizar:

```text
AuthorizedSender.default_book_id
```

quando Book não for explicitado.

---

# 59. Summary

Summary V0.1 deverá expor:

```text
ordinary_income
gross_expenses
refunds
net_expenses
net
```

---

# 60. Summary formulas

```text
ordinary_income
=
posted income
WHERE refund_of_transaction_id IS NULL
```

```text
gross_expenses
=
posted expense
```

```text
refunds
=
posted income
WHERE refund_of_transaction_id IS NOT NULL
```

```text
net_expenses
=
gross_expenses - refunds
```

```text
net
=
ordinary_income - net_expenses
```

Transfers e Transactions `voided` são excluídos.

---

# 61. Summary direct API

Exige:

```text
book_id
```

---

# 62. Summary period

Quando ausente, poderá assumir:

```text
current month
```

no timezone do Book.

---

# 63. AuthorizedSender

Sender WhatsApp autorizado deverá possuir:

```text
channel
sender_reference
active
```

e poderá possuir:

```text
default_book_id
default_account_id
```

---

# 64. AuthorizedSender defaults

Se `default_account_id` existir:

```text
default_book_id
```

também precisa existir.

A Account deve:

```text
belong to default Book
be active
have same currency
```

---

# 65. Archive default target

Não permitir archive de Book/Account enquanto estiver configurado como default de sender sem primeiro alterar o default.

---

# 66. Ingestion authorization order

Antes de persistir conteúdo financeiro:

```text
validate service credential
↓
validate group/fromMe
↓
normalize sender
↓
AuthorizedSender?
↓
persist InboxMessage
```

---

# 67. Unauthorized sender

Não deverá gerar:

```text
Finance Inbox raw_text
Transaction
ConfirmationSession
financial query result
```

---

# 68. Group

Ignorado.

---

# 69. from_me

Ignorado.

---

# 70. Inbox identity

Unicidade lógica:

```text
source
+
source_instance
+
source_message_id
```

---

# 71. Inbox statuses

```text
received
processing
needs_confirmation
processed
failed
ignored
```

---

# 72. Inbox retry metadata

No mínimo:

```text
attempt_count
processing_started_at
last_attempt_at
processed_at
```

---

# 73. Duplicate processed Inbox

Não reexecuta efeito financeiro.

---

# 74. Failed Inbox

Pode ser reprocessada utilizando a mesma InboxMessage.

---

# 75. Stale processing

Entrada presa em `processing` após timeout operacional poderá ser retomada na mesma linha lógica.

---

# 76. Exactly-once goal

Garantir:

```text
exactly-once logical financial effect
```

sob retry técnico.

Não prometer exatamente uma entrega visual de reply pelo WhatsApp.

---

# 77. ConfirmationSession

Statuses:

```text
pending
confirmed
cancelled
expired
```

---

# 78. Confirmation TTL

Default:

```text
15 minutes
```

configurável.

---

# 79. One pending Confirmation

No máximo uma:

```text
pending
```

por:

```text
channel + sender
```

---

# 80. Confirmation target safety

Ações envolvendo Transaction deverão capturar:

```text
target_entity_id
target_version
```

---

# 81. Confirmation resolution

Registrar:

```text
origin inbox_message_id
resolved_by_inbox_message_id
```

---

# 82. New command supersedes

Novo comando completo durante uma Confirmation pendente:

```text
old Confirmation
→ cancelled

resolution_reason
=
superseded_by_new_command
```

e o novo comando é processado normalmente.

---

# 83. Void via WhatsApp

Sempre exige confirmação explícita.

---

# 84. Refund via WhatsApp

Sempre exige confirmação explícita.

---

# 85. Clear ordinary correction

Pode executar sem segunda confirmação se:

```text
target unambiguous
fields unambiguous
version valid
```

---

# 86. AI

AI será fallback opcional.

Casos simples devem funcionar sem AI.

---

# 87. AI authority

AI produz apenas interpretação candidata estruturada.

Todo resultado passa por:

```text
strict schema
↓
Finance Core
```

---

# 88. AI restrictions

Não oferecer:

```text
DB credentials
SQL write authority
service credentials
.env
```

ao modelo.

---

# 89. n8n

Responsabilidade:

```text
receive webhook
technical filtering
normalize envelope
call Finance API
deliver reply
```

---

# 90. n8n não possui lógica financeira canônica

Não deverá decidir:

```text
Book
Account
Category
Refund
Void
financial defaults
```

nem executar SQL financeiro direto.

---

# 91. API scopes

Separação mínima:

```text
finance:ingest
finance:admin
```

---

# 92. finance:ingest

Para n8n.

Principalmente:

```text
POST /api/v1/inbox/messages
```

---

# 93. finance:admin

Para:

```text
direct API
trusted administration
future trusted Web backend
```

---

# 94. n8n least privilege

Credential normal do n8n não poderá executar:

```text
/admin/*
POST /transactions
PATCH /transactions/*
POST /transactions/*/void
POST /transactions/*/refunds
```

---

# 95. API idempotency

Obrigatória em:

```text
POST /transactions
POST /transactions/{id}/void
POST /transactions/{id}/refunds
```

através de:

```text
Idempotency-Key
```

---

# 96. Idempotency persistence

PostgreSQL.

Estados V0.1:

```text
in_progress
completed
```

---

# 97. Idempotency semantics

```text
same scoped key + same request
→ same logical result
```

```text
same scoped key + different request
→ 409 IDEMPOTENCY_CONFLICT
```

---

# 98. Failed idempotent operation

Falha pré-COMMIT reverte junto o registro de idempotência.

Não há status persistente `failed` na V0.1.

---

# 99. Idempotency expiry

Não haverá expiração automática V0.1.

---

# 100. Audit

Mutação financeira relevante deverá ser auditável.

No mínimo:

```text
TRANSACTION_CREATED
TRANSACTION_UPDATED
TRANSACTION_VOIDED
TRANSACTION_REFUND_CREATED
```

---

# 101. Audit append-only

AuditEvent não será normalmente atualizado/apagado.

---

# 102. Outbox

Schema poderá existir V0.1.

Só emitir eventos quando houver consumidor real.

Não criar eventos rotineiramente sem finalidade.

---

# 103. Outbox atomicity

Quando evento for emitido:

```text
domain change
+
Audit when applicable
+
OutboxEvent
```

deverão participar da mesma transaction PostgreSQL quando necessário.

---

# 104. External delivery

Não prometer exactly-once.

Consumers futuros deverão ser idempotentes.

---

# 105. CSV Export

Obrigatório na V0.1.

Deverá permitir exportação por Book/período.

---

# 106. CSV security

Mitigar spreadsheet formula injection.

---

# 107. Pagination

Default:

```text
50
```

Máximo:

```text
100
```

---

# 108. Health

Obrigatório:

```text
/health
```

---

# 109. Readiness

Obrigatório:

```text
/ready
```

PostgreSQL é dependência crítica.

Redis só entra como dependência crítica se runtime específico realmente depender dele.

---

# 110. PostgreSQL deployment target

Na VPS:

```text
/opt/apps/apps/databases/postgres-products
```

com databases separados:

```text
finance_hub_lab
finance_hub_prod
```

---

# 111. Não presumir infraestrutura

Gate 0 deverá verificar se `postgres-products` realmente existe.

Se não existir:

```text
explicit approved infrastructure provisioning
```

antes de M02 na VPS.

---

# 112. Bancos proibidos

Não usar:

```text
n8n-postgres
evolution-postgres
```

para dados Finance Hub.

---

# 113. Redis

Operacional apenas.

Nunca Source of Truth.

Sem porta pública.

---

# 114. Production seed

Migrations não deverão hardcode:

```text
Pessoal
Empresa
```

---

# 115. Lab fixture

Pode criar Books/Accounts/Categories fake para testes.

---

# 116. Security baseline

Obrigatório:

```text
strict API schemas
no mass assignment
internal PostgreSQL
internal Redis
secrets outside Git
Lab/Prod separation
least privilege
auditable writes
```

---

# 117. Codex safety

Antes de alteração VPS:

```text
Gate 0 PASS
```

Codex não deverá possuir automaticamente:

```text
root
NOPASSWD: ALL
unrestricted Docker
unrestricted Production
unrestricted shared infrastructure
```

---

# 118. Backup

Production:

```text
daily
```

RPO alvo:

```text
<= 24h
```

RTO inicial:

```text
same-day target
```

---

# 119. Retention

```text
14 daily
8 weekly
12 monthly
```

---

# 120. Backup architecture

```text
pg_dump custom format
+
Finance storage
↓
local staging
↓
Restic encrypted repository
↓
rclone
↓
Google Drive
```

---

# 121. Official backup paths

```text
/opt/apps/backups/
├── databases/
│   └── finance-hub/
└── files/
    └── finance-hub/
```

com separação Lab/Production.

---

# 122. Restore

Obrigatório executar restore isolado real.

Antes de dados financeiros reais:

```text
at least one successful isolated restore
```

---

# 123. Gate C

`REAL DATA READY` exige:

```text
financial correctness
authorization
idempotency
audit
security
backup
successful restore
```

---

# 124. Definition of Done V0.1

```text
[ ] Book/Account/Category/Merchant configuration

[ ] ClassificationRules

[ ] AuthorizedSender

[ ] Expense/Income/Transfer

[ ] Refund linked as Income

[ ] Correction

[ ] Void

[ ] optimistic locking

[ ] persistent API idempotency

[ ] Inbox retry semantics

[ ] ConfirmationSession

[ ] WhatsApp

[ ] Last

[ ] Summary

[ ] CSV

[ ] Audit

[ ] strict service scopes

[ ] security baseline

[ ] daily encrypted off-site backup

[ ] isolated restore PASS
```

---

# 125. Correção específica desta v0.3.1

A V0.1 possui apenas:

```text
transaction_date
```

como data financeira da Transaction.

Não há campo separado de horário financeiro.

Campos temporais técnicos continuam sendo:

```text
created_at
updated_at
```

---

# 126. Condição para Freeze

Este documento poderá ser promovido para:

```text
FROZEN — Baseline for Implementation
```

quando a checagem final confirmar aderência ao ledger sem contradições.

---

# 127. Regra final

A V0.1 deve ser:

```text
small
correct
auditable
secure
recoverable
```

antes de crescer em funcionalidades futuras.