# FINAL-FREEZE-DECISIONS.md

# Finance Intelligence Hub
## Final Architecture Freeze Decision Ledger

**Documento:** `FINAL-FREEZE-DECISIONS.md`  
**Versão:** 1.0.1  
**Status:** LOCKED — authoritative decision ledger for documentation regeneration  
**Projeto:** Finance Intelligence Hub  

---

# 1. Objetivo

Este documento consolida as decisões finais tomadas após múltiplas revisões cruzadas da documentação do Finance Intelligence Hub.

Seu propósito é impedir ciclos infinitos de:

```text
documentar
↓
revisar
↓
mudar arquitetura
↓
reescrever
↓
revisar novamente
```

A partir deste documento:

```text
FINAL-FREEZE-DECISIONS
        ↓
regeneração dos documentos canônicos
        ↓
checagem mecânica de consistência
        ↓
DOCUMENTATION FREEZE
        ↓
implementação
```

---

# 2. Regra de bloqueio do Freeze

Depois deste ledger, somente problemas capazes de causar um dos seguintes resultados poderão reabrir uma decisão arquitetônica:

```text
1. valor financeiro incorreto

2. duplicação de efeito financeiro

3. perda de histórico financeiro

4. acesso não autorizado

5. perda de dados / restore impossível

6. schema logicamente impossível

7. milestone tecnicamente impossível de executar
```

Problemas de:

```text
elegância

preferência

otimização prematura

feature futura

refatoração desejável

melhoria de UX não crítica
```

não bloqueiam o início da implementação.

Eles deverão ir para:

```text
BACKLOG
```

ou:

```text
ADR futuro
```

---

# 3. Source of Truth

O Source of Truth do Finance Intelligence Hub será:

```text
PostgreSQL
```

do próprio Finance Hub.

Não serão Source of Truth:

```text
WhatsApp
Evolution
n8n
Redis
Firefly
Metabase
AI provider
Google Drive
```

---

# 4. Arquitetura principal

```text
WhatsApp
↓
Evolution API
↓
n8n
↓
Finance API
↓
Finance Core
↓
PostgreSQL
```

---

# 5. Finance Core independente

O sistema financeiro deverá funcionar com apenas:

```text
Finance API
+
Finance Core
+
PostgreSQL
```

sem depender de:

```text
WhatsApp
Evolution
n8n
Firefly
Metabase
AI
```

---

# 6. Modular Monolith

A arquitetura inicial será:

```text
MODULAR MONOLITH
```

Microservices distribuídos não fazem parte da V0.1.

---

# 7. PostgreSQL da VPS

A infraestrutura escolhida para Lab e Production será:

```text
/opt/apps/apps/databases/postgres-products
```

---

# 8. `postgres-products` pode ainda não estar provisionado

Os documentos não deverão afirmar que ele já existe ou já está operacional.

Gate 0 deverá verificar:

```text
postgres-products existe?
```

---

# 9. Se `postgres-products` existir

Utilizar:

```text
finance_hub_lab
finance_hub_prod
```

como databases separados.

---

# 10. Se `postgres-products` não existir

Antes do M02 deverá existir uma tarefa explícita de infraestrutura:

```text
PROVISION postgres-products
```

em:

```text
/opt/apps/apps/databases/postgres-products
```

com:

```text
apps-backend
sem porta pública
volume persistente
.env próprio
README
backup inicial
```

---

# 11. Provisionamento de infraestrutura compartilhada

Não será alteração casual do Codex.

Exigirá:

```text
aprovação explícita
+
task de infraestrutura delimitada
```

---

# 12. Codex após provisionamento

Retorna ao escopo normal:

```text
repository
+
Finance Hub Lab
```

---

# 13. Banco local/test

A proibição de `finance-postgres` próprio vale para:

```text
VPS Lab
VPS Production
```

Não impede desenvolvimento local.

---

# 14. Desenvolvimento local

Poderá utilizar:

```text
PostgreSQL efêmero
```

através de:

```text
Testcontainers
Docker Compose dev
container temporário
```

---

# 15. Test database

Testes nunca utilizarão:

```text
finance_hub_prod
```

---

# 16. Redis

Utilizar quando necessário:

```text
redis-main
```

com namespace:

```text
finance-hub:
```

---

# 17. Redis não é obrigatório para CRUD financeiro básico

Uma Transaction síncrona simples não dependerá de Redis se seu caso de uso não o exigir.

---

# 18. Worker

`apps/worker` poderá existir como scaffold.

Runtime separado somente será ativado quando existir trabalho assíncrono real.

Exemplos:

```text
Firefly sync
OCR
receipt processing
large imports
background jobs
```

---

# 19. Outbox

`outbox_events` poderá existir desde V0.1.

Porém:

> OutboxEvents somente deverão ser produzidos para eventos que realmente possuam consumidor/integration configurado.

Não acumular eventos eternamente sem consumidor apenas porque a tabela existe.

---

# 20. Outbox delivery

Outbox garante:

```text
persistência confiável do evento
```

Não garante:

```text
exactly-once external delivery
```

Consumers deverão ser idempotentes.

---

# 21. Transaction types finais da V0.1

Os únicos tipos financeiros base serão:

```text
expense
income
transfer
```

---

# 22. `refund` NÃO será Transaction.type

Não existir na V0.1:

```text
type = refund
```

---

# 23. `adjustment` NÃO será Transaction.type V0.1

Também não existir:

```text
type = adjustment
```

na V0.1.

Quando houver caso real:

```text
migration
+
ADR
+
domain rules
```

serão adicionados.

---

# 24. Transaction lifecycle final

Os únicos status V0.1 serão:

```text
posted
voided
```

---

# 25. `pending` não será status de Transaction

Ambiguidade acontece antes de uma Transaction existir.

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

---

# 26. `active` não será status de Transaction

Utilizar:

```text
posted
```

como estado financeiro válido.

---

# 27. Refund — representação canônica

Refund será uma nova Transaction:

```text
type = income
status = posted
refund_of_transaction_id = original_expense_id
```

---

# 28. Refund semântica

Apesar de fisicamente ser:

```text
income
```

a presença de:

```text
refund_of_transaction_id
```

define semanticamente:

```text
REFUND
```

---

# 29. Refund não é receita operacional

Reports deverão separar:

```text
ordinary income
```

de:

```text
refund income
```

---

# 30. Refund report

Exemplo:

```text
Expense original:
500

Refund:
200

Gross Expense:
500

Refunds:
200

Net Expense:
300
```

O Refund não aumenta `ordinary_income`.

---

# 31. Refund target

V0.1 só permitirá Refund de:

```text
posted expense
```

---

# 32. Refund-of-refund

Proibido.

---

# 33. Refund parcial

Permitido.

---

# 34. Multiple Refunds

Permitidos.

---

# 35. Refund amount invariant

Sempre:

```text
sum(posted refunds)
<=
original expense amount
```

---

# 36. Refund concurrency

Criação concorrente deverá proteger a Expense original.

Exemplo:

```text
SELECT ... FOR UPDATE
```

ou mecanismo equivalente.

---

# 37. Refund Book

Refund herdará:

```text
book_id
```

da Expense original.

Client não escolhe outro Book.

---

# 38. Refund Currency

Refund herdará:

```text
currency
```

da Expense original.

---

# 39. Refund Account

Refund exige Account em que a devolução foi efetivamente creditada.

Quando não informada e seguro:

```text
usar Account original
```

Caso contrário:

```text
ConfirmationSession
```

---

# 40. Refund Date

Obrigatório:

```text
refund.transaction_date
>=
original.transaction_date
```

---

# 41. Refund via WhatsApp

Sempre exige confirmação explícita.

---

# 42. Refund via API

Utilizar endpoint específico:

```text
POST /transactions/{id}/refunds
```

Não criar Refund pelo generic:

```text
POST /transactions
```

---

# 43. Refund correction

Refund já criado será imutável na V0.1, exceto Void.

Se valor estava errado:

```text
Void Refund incorreto
↓
criar novo Refund correto
```

---

# 44. Void Refund

Permitido.

Após Void:

```text
refund deixa de afetar summary
```

---

# 45. Void original com Refund posted

Proibido.

Se Expense possui Refund posted:

```text
TRANSACTION_HAS_POSTED_REFUNDS
```

---

# 46. Para invalidar Expense com Refund

Fluxo:

```text
Void Refund(s)
↓
Void Expense
```

---

# 47. Correction da Expense com Refund

Nova quantidade deverá respeitar:

```text
new_amount >= total_posted_refunds
```

---

# 48. Correction da data original com Refund

Nova data não poderá ficar posterior a um Refund existente.

Obrigatório:

```text
original.transaction_date
<=
every posted refund.transaction_date
```

---

# 49. Transaction amount

Sempre positivo:

```text
amount > 0
```

O tipo define o efeito financeiro.

---

# 50. Money precision

Utilizar:

```text
NUMERIC(18,2)
```

Nunca:

```text
float
double
real
```

como valor financeiro principal.

---

# 51. Money API

Valores trafegam como strings:

```json
{
  "amount": "35.00"
}
```

---

# 52. Currency V0.1

Cada Book possui uma moeda.

Para toda Account e Transaction daquele Book:

```text
Account.currency
=
Transaction.currency
=
Book.currency
```

---

# 53. FX

Não existe na V0.1.

---

# 54. Multi-currency

Fica para versão futura.

---

# 55. Summary

Resumo financeiro V0.1 opera:

```text
por Book
```

e consequentemente:

```text
uma moeda
```

---

# 56. Direct API Summary

Deverá exigir:

```text
book_id
```

na V0.1.

---

# 57. WhatsApp Summary

Pode usar:

```text
AuthorizedSender.default_book_id
```

quando Book não for explicitado.

---

# 58. Direct API Last

Também deverá possuir Book explícito na V0.1.

---

# 59. WhatsApp Last

Pode utilizar default Book.

---

# 60. Last Transaction semantics

“último” significa:

```text
Transaction posted
mais recentemente criada
```

no Book/contexto aplicável.

Ordenação:

```text
created_at DESC
+
id DESC
```

como desempate determinístico.

---

# 61. Last não usa `transaction_date`

Uma Transaction retroativa criada agora poderá ser:

```text
último lançamento criado
```

mesmo tendo data financeira anterior.

---

# 62. Transaction Date

V0.1 representa evento ocorrido.

Portanto, para novos lançamentos `posted`:

```text
transaction_date
<=
today in Book timezone
```

---

# 63. Futuro/agendamento

Datas financeiras futuras pertencem a:

```text
scheduling
recurrence
planned transactions
```

e não à Transaction posted V0.1.

---

# 64. Account obrigatória

`expense`:

```text
account_id required
```

`income`:

```text
account_id required
```

---

# 65. Transfer

Exige:

```text
account_id
destination_account_id
```

---

# 66. Transfer invariant

```text
source_account != destination_account
```

---

# 67. Transfer V0.1

Somente entre Accounts:

```text
do mesmo Book
+
da mesma Currency
```

---

# 68. Cross-Book Transfer

Fora da V0.1.

Não transformar silenciosamente em Income/Expense.

---

# 69. Transaction fields imutáveis

Depois de criada:

```text
id
human_ref
book_id
type
source
refund_of_transaction_id
created_at
```

não são alterados por PATCH comum.

---

# 70. Status

Só muda através de operação de domínio:

```text
Void
```

---

# 71. Transaction Delete

Não existe como operação financeira normal.

---

# 72. Void

Transforma:

```text
posted
→
voided
```

e preserva o registro.

---

# 73. Void via WhatsApp

Sempre exige confirmação.

---

# 74. Correction

PATCH ordinário poderá alterar, conforme invariantes:

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

# 75. Optimistic Locking

Transaction utiliza:

```text
version
```

---

# 76. Version Conflict

Alteração com versão antiga:

```text
409 VERSION_CONFLICT
```

---

# 77. Book

Book representa contexto financeiro configurável.

Exemplos:

```text
Pessoal
Empresa
```

são dados.

Não enums hardcoded.

---

# 78. Book Currency immutability

Depois de existirem Accounts/Transactions associadas, `Book.currency` não poderá ser alterada por PATCH normal.

---

# 79. Account Book

`account.book_id` é imutável depois da criação.

---

# 80. Account Currency

Depois da Account ser utilizada:

```text
currency
```

não poderá ser alterada.

---

# 81. Account Type

Depois da primeira Transaction:

```text
type
```

não poderá ser alterado por PATCH normal.

---

# 82. Master data archive

Books, Accounts, Categories e Merchants permanecem disponíveis para histórico quando inativos.

---

# 83. Master data inativa

Não poderá participar de uma nova Transaction.

---

# 84. Active/archive invariant

Se ambos os campos existirem:

```text
active = true
→ archived_at IS NULL

active = false
→ archived_at IS NOT NULL
```

---

# 85. Default Book

AuthorizedSender poderá possuir:

```text
default_book_id
```

---

# 86. Default Account

Poderá possuir:

```text
default_account_id
```

---

# 87. Default Account exige Default Book

Não permitir:

```text
default_account_id != NULL
default_book_id = NULL
```

---

# 88. Default consistency

```text
default_account.book_id
=
default_book_id
```

---

# 89. Default ativo

Default Book/Account precisa estar ativo.

---

# 90. Archive de entidade usada como default

Bloquear até que o default seja removido/alterado.

Exemplo:

```text
DEFAULT_ACCOUNT_IN_USE
```

---

# 91. Category hierarchy

Category pai deve pertencer ao mesmo Book.

---

# 92. Self-parent

Proibido:

```text
category.parent_category_id = category.id
```

---

# 93. Category cycles

Finance Core deverá impedir ciclos maiores:

```text
A → B → C → A
```

---

# 94. ClassificationRule

Parte mínima da V0.1.

---

# 95. ClassificationRule precisa fazer algo

Cada regra deverá possuir pelo menos um target:

```text
Book
Account
Category
Merchant
```

---

# 96. ClassificationRule targets

Todos os targets relacionados a Book precisam ser compatíveis entre si.

---

# 97. ClassificationRule e entidades inativas

Rule não poderá aplicar:

```text
inactive Book
inactive Account
inactive Category
inactive Merchant
```

---

# 98. Rule precedence

```text
explicit user instruction
↓
manual ClassificationRule
↓
known alias
↓
deterministic parser
↓
AI fallback
↓
confirmation
```

---

# 99. AI

AI é opcional.

Não executa:

```text
SQL
DB writes
authorization
```

diretamente.

---

# 100. AuthorizedSender

Somente sender autorizado poderá executar comandos financeiros via WhatsApp.

---

# 101. Autorização ocorre antes de persistir conteúdo bruto

Fluxo obrigatório:

```text
service authentication
↓
group/fromMe validation
↓
sender normalization
↓
AuthorizedSender?
│
├── NO
│   └── reject + minimal security log
│       no raw_text persistence
│
└── YES
    ↓
persist InboxMessage
```

---

# 102. Groups

Ignorados antes da persistência financeira normal.

---

# 103. `from_me`

Ignorado antes do pipeline financeiro.

---

# 104. Raw WhatsApp conversations

Finance Hub não será arquivo geral de conversas.

---

# 105. Service credentials

Não utilizar uma única credencial com todos os privilégios.

---

# 106. INGEST credential

n8n recebe credencial com acesso apenas ao necessário para ingestão.

Exemplo de scope:

```text
finance:ingest
```

---

# 107. ADMIN credential

Operações administrativas/direct API utilizam credencial diferente.

Exemplo:

```text
finance:admin
```

---

# 108. n8n não acessa endpoints administrativos

Por padrão:

```text
/admin/*
POST /transactions
```

não pertencem ao scope `finance:ingest`.

---

# 109. AuthorizedSender não substitui token scope

Cada controle resolve ameaça diferente.

---

# 110. Comprometimento do n8n

É tratado como comprometimento da integration trust boundary.

Mitigações:

```text
limited ingest scope
internal network
audit
least privilege
```

Não afirmar que sender whitelist sozinha protege contra n8n comprometido.

---

# 111. Inbox identity

A chave técnica será:

```text
source
+
source_instance
+
source_message_id
```

---

# 112. Exemplo

```text
source = whatsapp

source_instance = evolution-main/<instance>

source_message_id = ...
```

---

# 113. Inbox uniqueness

```text
UNIQUE(
  source,
  source_instance,
  source_message_id
)
```

---

# 114. Inbox lifecycle

Estados:

```text
received

processing

needs_confirmation

processed

failed

ignored
```

---

# 115. Inbox processing metadata

Persistir:

```text
attempt_count

processing_started_at

last_attempt_at

processed_at
```

conforme aplicável.

---

# 116. Inbox retry — processed

Se:

```text
status = processed
```

a mesma mensagem nunca executa novamente o efeito financeiro.

---

# 117. Inbox retry — failed

Se:

```text
status = failed
```

a mesma InboxMessage pode ser reprocessada.

Não criar uma nova Inbox.

---

# 118. Stale processing

Se processo morrer com:

```text
status = processing
```

e ultrapassar timeout operacional:

```text
reclaim
+
retry same InboxMessage
```

---

# 119. Exactly-once objetivo

Garantir:

```text
exactly-once logical financial effect
```

sob retries técnicos.

---

# 120. Outbound reply

Não prometer exatamente-once delivery no WhatsApp.

V0.1 aceita:

```text
at-least-once / best controlled delivery
```

com proteção para nunca duplicar o efeito financeiro.

---

# 121. ConfirmationSession

Obrigatória na V0.1.

---

# 122. Uma pending por sender

Preferir:

```text
one pending ConfirmationSession
per channel + sender
```

---

# 123. Confirmation status

```text
pending
confirmed
cancelled
expired
```

---

# 124. Superseded

Não criar status separado.

Utilizar:

```text
status = cancelled

resolution_reason =
superseded_by_new_command
```

---

# 125. Confirmation TTL

Default:

```text
15 minutes
```

configurável.

---

# 126. Confirmation target

Para ações sobre Transaction:

```text
target_entity_id
target_version
```

obrigatórios.

---

# 127. Confirmation origin

Guardar:

```text
inbox_message_id
```

que abriu a sessão.

---

# 128. Confirmation resolution

Guardar:

```text
resolved_by_inbox_message_id
```

da mensagem:

```text
sim
não
1
2
```

que resolveu a sessão.

---

# 129. Short reply

Com confirmation pendente:

```text
sim
não
1
2
```

é interpretado como resposta contextual.

---

# 130. Novo comando completo

Com confirmation pendente:

```text
25 café nubank
```

cancela a sessão anterior com:

```text
resolution_reason =
superseded_by_new_command
```

e processa o novo comando.

---

# 131. Void e Refund superseded

Nenhuma ação destrutiva é executada.

---

# 132. Confirmation finalization

Após:

```text
confirmed
cancelled
expired
```

a Inbox original que estava em `needs_confirmation` deverá ser levada a estado terminal apropriado.

---

# 133. Idempotency API

Persistência canônica:

```text
PostgreSQL
```

Nunca Redis como única verdade.

---

# 134. Financial write endpoints com Idempotency-Key

Obrigatório em:

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

---

# 135. Idempotency states V0.1

Somente:

```text
in_progress

completed
```

---

# 136. Falha da DB transaction

Se a operação falhar antes do COMMIT:

```text
idempotency record
+
financial data
```

sofrem rollback juntos.

Não manter `failed` complexo na V0.1.

---

# 137. Idempotency expiration

V0.1:

```text
não expirar automaticamente
```

Volume esperado é pequeno e segurança contra replay vale mais que limpeza precoce.

---

# 138. Same key + same request

Retornar o mesmo resultado lógico.

---

# 139. Same key + different request

```text
409 IDEMPOTENCY_CONFLICT
```

---

# 140. PATCH

Não precisa de Idempotency-Key obrigatório.

Utiliza:

```text
version
```

e GET posterior para resolver timeout/conflito.

---

# 141. API base

```text
/api/v1
```

---

# 142. Source

`source` é controlado pelo servidor/contexto autenticado.

---

# 143. Generic Transaction create

Só cria:

```text
expense
income
transfer
```

---

# 144. Refund response

Retorna Transaction:

```text
type = income
refund_of_transaction_id != null
```

e poderá expor também campo derivado:

```text
is_refund = true
```

ou semantic role equivalente no response.

---

# 145. PATCH immutable fields

Não permitir alterar genericamente:

```text
book_id
type
status
source
refund_of_transaction_id
```

---

# 146. Refund PATCH

Proibido V0.1.

---

# 147. DELETE Transaction

Não existe.

---

# 148. Pagination

Default sugerido:

```text
page_size = 50
```

Teto V0.1:

```text
100
```

---

# 149. WhatsApp

n8n permanece fino.

Responsabilidades:

```text
receive webhook

filter technical event

normalize envelope

call Finance API

deliver reply
```

---

# 150. n8n não possui

```text
financial rules

classification rules

defaults

direct SQL
```

---

# 151. Parser

Casos básicos devem funcionar deterministicamente sem IA.

---

# 152. One transaction per message

V0.1:

```text
1 financial command per message
```

---

# 153. Edited WhatsApp messages

Não alteram Transaction automaticamente.

---

# 154. Deleted WhatsApp messages

Não executam Void.

---

# 155. Gate 0

Não bloqueia:

```text
M01 local
Git
local tests
docs
ADRs
```

---

# 156. Gate 0 bloqueia

Antes da conclusão não executar:

```text
VPS Lab deploy

shared infra provisioning

network changes

remote Codex operational access

real Finance DB creation
```

---

# 157. Gate 0 verifica

```text
VPS resources

containers

networks

n8n connectivity

postgres-products existence

UFW

Fail2Ban

NPM

Portainer

SSH

backups

Codex privileges
```

---

# 158. M02 dependency

M02 na VPS só começa depois de:

```text
Gate 0 PASS
```

e:

```text
postgres-products operational
```

---

# 159. Production bootstrap

`Pessoal` e `Empresa` não deverão ser migrations hardcoded.

Podem ser criados por:

```text
explicit bootstrap/setup command
```

ou processo administrativo inicial.

---

# 160. Lab seeds

Podem conter:

```text
Pessoal
Empresa
fake accounts
fake categories
fake sender
classification rules
```

---

# 161. Production secrets

Nunca em seeds/Git.

---

# 162. Backup Finance Hub

Backup da aplicação inclui:

```text
Finance Hub database
+
Finance Hub persistent storage
```

---

# 163. Não fazer backup indiscriminado do cluster como backup da aplicação

Finance backup não significa:

```text
dump every database in postgres-products
```

---

# 164. Database backup

Production:

```text
pg_dump finance_hub_prod
```

em custom format ou formato acordado pelo runbook.

---

# 165. Shared PostgreSQL roles

Roles globais como:

```text
finance_hub_app
finance_hub_migrations
finance_hub_readonly
```

não deverão depender de dump global do cluster para recuperação da aplicação.

---

# 166. Roles e grants

Devem ser recriáveis por:

```text
versioned bootstrap / infrastructure scripts
+
secrets injected separately
```

---

# 167. Backup directories oficiais

Usar:

```text
/opt/apps/backups/
├── databases/
│   └── finance-hub/
│       ├── lab/
│       └── production/
│
└── files/
    └── finance-hub/
        ├── lab/
        └── production/
```

---

# 168. Off-site

Fluxo:

```text
pg_dump + storage
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

# 169. Google Drive

Não é runtime dependency.

---

# 170. V0.1 backup frequency

No mínimo:

```text
daily
```

---

# 171. RPO

Target inicial:

```text
<= 24h
```

---

# 172. Retention

```text
14 daily

8 weekly

12 monthly
```

---

# 173. Restore testing

No mínimo:

```text
monthly isolated restore test
```

após operação real.

Antes do primeiro uso financeiro real:

```text
at least one successful restore
```

---

# 174. Restore target

Nunca restaurar primeiro sobre Production.

Utilizar:

```text
isolated temporary database/environment
```

---

# 175. Backup antes de risco

Obrigatório antes de:

```text
Production migration

destructive database operation

high-risk infrastructure change
```

---

# 176. Security filesystem

Nunca executar globalmente:

```text
chown -R
chmod -R
```

em:

```text
/opt/apps
/opt/apps/apps
```

---

# 177. Permissions

Sempre específicas ao projeto/volume e baseadas no UID/GID real do container.

---

# 178. Database / Redis exposure

Nunca públicos.

---

# 179. NPM / proxy

Apenas aplicações HTTP que realmente precisem de publicação entram em:

```text
proxy
```

---

# 180. apps-backend

Preferida para comunicação interna.

Conectividade real do n8n será verificada no Gate 0, não presumida.

---

# 181. Firefly

Fora da V0.1.

Quando entrar:

```text
Finance Hub
↓
Outbox
↓
Worker
↓
Firefly Adapter
```

---

# 182. Firefly não bloqueia Finance Core

Firefly offline:

```text
Transaction permanece válida
```

---

# 183. Metabase

Futuro.

Somente read-only.

---

# 184. Dashboard

Futuro.

Usa Finance API, nunca DB diretamente.

---

# 185. Future physical schemas

Não criar migrations V0.1 para:

```text
Products

PriceObservations

Receipts

Vehicles

Reconciliation

Installments

Recurring
```

---

# 186. Prepare vs Implement

É permitido:

```text
document future concept
reserve folder
define extension point
```

Não significa:

```text
create table now
run service now
build feature now
```

---

# 187. V0.1 final scope

```text
Books

Accounts

Categories

Merchants

ClassificationRules

AuthorizedSender defaults

Inbox

Interpretation

ConfirmationSession

Expense

Income

Transfer

basic linked Refund

Correction

Void

Audit

API idempotency

WhatsApp

Summary

CSV Export

Security

Backup

Restore
```

---

# 188. V0.1 final transaction model

```text
Transaction
│
├── type
│   ├── expense
│   ├── income
│   └── transfer
│
├── status
│   ├── posted
│   └── voided
│
└── refund_of_transaction_id
    ├── NULL → ordinary transaction
    └── UUID → refund income linked to Expense
```

---

# 189. V0.1 Refund example

```text
Original
────────
type: expense
amount: 500
status: posted

Refund
──────
type: income
amount: 200
status: posted
refund_of_transaction_id: original.id
```

Financial summary:

```text
ordinary income: 0

gross expenses: 500

refunds: 200

net expenses: 300
```

---

# 190. V0.1 lifecycle principle

Nenhuma Transaction existe até estar suficientemente definida para ser:

```text
posted
```

Ambiguidade pertence ao ingestion layer.

---

# 191. Freeze process depois deste documento

Os documentos serão regenerados como:

```text
Version: 0.3
Status: FREEZE CANDIDATE
```

---

# 192. Documentos a regenerar

```text
00-PROJECT-BLUEPRINT.md

01-MVP-REQUIREMENTS.md

02-DOMAIN-MODEL.md

03-ARCHITECTURE.md

04-DATABASE.md

05-API-CONTRACTS.md

06-WHATSAPP-FLOWS.md

07-SECURITY.md

08-BACKUP-RESTORE.md

09-ROADMAP-TESTS.md
```

---

# 193. Regra da revisão final

Depois da regeneração, NÃO haverá nova revisão arquitetônica aberta.

A checagem será exclusivamente:

```text
Decision Ledger
       ↓
Document
       ↓
MATCH?
```

---

# 194. Resultado

Para cada decisão:

```text
PASS
```

ou:

```text
FAIL
```

---

# 195. Se existir FAIL

Corrigir somente o documento afetado.

Não rediscutir todo o projeto.

---

# 196. Se todos forem PASS

Alterar:

```text
Status:
FREEZE CANDIDATE
```

para:

```text
FROZEN — Baseline for Implementation
```

---

# 197. Depois do Freeze

Criar:

```text
AGENTS.md

PROJECT_STATE.md

README.md

CHANGELOG.md

initial ADRs
```

---

# 198. Regra de mudança depois do Freeze

Uma nova necessidade descoberta durante implementação:

```text
implementation discovery
↓
is it a blocker?
│
├── NO → backlog
│
└── YES
     ↓
    ADR
     ↓
canonical doc affected
     ↓
implementation
```

---

# 199. Não reabrir documentação por preferência

Exemplo:

```text
"talvez outro nome de endpoint seja mais bonito"
```

não reabre o freeze.

---

# 200. Princípio final

A documentação deve ser suficientemente precisa para impedir:

```text
dinheiro incorreto

duplicidade

histórico quebrado

segurança fraca

deploy perigoso

restore impossível
```

Ela não precisa prever toda feature futura antes de começarmos a construir.

---

# 201. Status Final das Decisões

As decisões deste arquivo estão:

```text
LOCKED
```

para a regeneração v0.3.

Alterações somente pelos critérios definidos neste próprio ledger.