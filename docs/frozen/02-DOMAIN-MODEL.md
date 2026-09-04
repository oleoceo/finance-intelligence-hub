# 02-DOMAIN-MODEL.md

# Finance Intelligence Hub
## Canonical Domain Model

**Documento:** `02-DOMAIN-MODEL.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub  

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`
- `01-MVP-REQUIREMENTS.md`

---

# 1. Objetivo

Este documento define o modelo conceitual canônico do Finance Intelligence Hub.

Ele descreve:

```text
entidades

value objects

agregados

relacionamentos

invariantes

lifecycles

responsabilidades

limites entre domínios

conceitos atuais

pontos de expansão futura
```

Este documento responde:

> Quais conceitos existem no Finance Hub, qual o significado de cada um e quais regras deverão permanecer verdadeiras independentemente da tecnologia utilizada?

---

# 2. Este documento não é o schema SQL

Detalhes físicos como:

```text
DDL

indexes

PostgreSQL constraints

column types definitivos

migration syntax
```

pertencem a:

```text
04-DATABASE.md
```

Aqui definimos primeiro:

```text
meaning
```

Depois o banco implementa esse significado.

---

# 3. Modelo próprio e independente

O Domain Model não será moldado por:

```text
Firefly

n8n

Evolution

Metabase

WhatsApp

AI providers
```

Esses componentes devem adaptar-se ao Finance Hub.

---

# 4. Regra de independência

Uma Transaction deverá continuar fazendo sentido mesmo se:

```text
WhatsApp deixar de existir

n8n for substituído

Evolution mudar

Firefly for removido

AI provider mudar
```

---

# 5. Ubiquitous Language

Os seguintes termos possuem significado específico:

```text
Book
= contexto financeiro

Account
= local financeiro

Category
= classificação financeira

Merchant
= contraparte econômica/comercial

Transaction
= evento financeiro canônico

Refund
= Income Transaction compensatória ligada a uma Expense anterior

Correction
= alteração controlada de dados incorretos

Void
= invalidação de efeito financeiro sem apagar histórico

InboxMessage
= entrada autorizada recebida de canal externo

Interpretation
= interpretação estruturada da entrada

ConfirmationSession
= estado temporário de confirmação ou escolha humana

ClassificationRule
= regra persistente de classificação

AuditEvent
= histórico lógico append-only de mudança

IdempotencyKey
= proteção persistente contra repetição de ações financeiras

OutboxEvent
= evento persistido para integração assíncrona futura
```

---

# 6. Não equivalências fundamentais

Obrigatório preservar:

```text
Transaction != PriceObservation

Product != Category

Merchant != MerchantLocation

Refund != ordinary Income

Refund != Void

Void != Delete

Correction != Refund

InboxMessage != Transaction

Interpretation != Transaction

Receipt != Transaction

FuelEvent != Transaction

Book != User

Account != Bank

Credit Card Account != Credit Card Bill
```

---

# 7. Mapa de domínios

```text
FINANCE HUB
│
├── FINANCE
│   ├── Book
│   ├── Account
│   ├── Category
│   ├── Merchant
│   ├── ClassificationRule
│   └── Transaction
│
├── INGESTION
│   ├── AuthorizedSender
│   ├── InboxMessage
│   ├── Interpretation
│   └── ConfirmationSession
│
├── AUDIT
│   └── AuditEvent
│
├── SYSTEM
│   ├── IdempotencyKey
│   └── OutboxEvent
│
├── CONSUMPTION — FUTURE
│   ├── Product
│   ├── Brand
│   ├── ProductVariant
│   ├── ProductPackage
│   ├── ProductAlias
│   ├── Unit
│   └── TransactionItem
│
├── PRICE INTELLIGENCE — FUTURE
│   ├── PriceObservation
│   └── Promotion
│
├── RECEIPTS / FISCAL — FUTURE
│   ├── Attachment
│   ├── Receipt
│   └── ReceiptItem
│
├── VEHICLES — FUTURE
│   ├── Vehicle
│   └── FuelEvent
│
└── RECONCILIATION — FUTURE
    ├── ExternalTransactionRecord
    └── ReconciliationMatch
```

---

# 8. Aggregate roots principais V0.1

Conceitualmente:

```text
Book

Account

Transaction

InboxMessage

AuthorizedSender

ClassificationRule
```

Merchant também possui identidade própria.

---

# 9. Book

Book representa um contexto financeiro lógico.

Exemplos:

```text
Pessoal

Empresa
```

Outros possíveis:

```text
Casa

Projeto A

Viagem

Empresa B
```

---

# 10. Book não é User

Book não representa autenticação nem identidade humana.

Representa:

```text
financial context
```

---

# 11. Responsabilidade de Book

Delimita principalmente:

```text
Accounts

Categories

Transactions
```

e futuramente outros dados de contexto.

---

# 12. Book invariant

Toda Transaction pertence a exatamente um Book.

---

# 13. Book fields conceituais

```text
id

name

normalized_name

currency

timezone

active

archived_at

created_at

updated_at
```

---

# 14. Book configurável

Não existe enum rígido:

```text
PERSONAL
BUSINESS
```

como única possibilidade.

---

# 15. Book Currency

Cada Book possui uma moeda operacional na V0.1.

---

# 16. Currency invariant V0.1

Obrigatório:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

---

# 17. FX

Não existe no domínio funcional da V0.1.

---

# 18. Book currency mutation

Depois que o Book possuir Accounts/Transactions relevantes:

```text
Book.currency
```

não poderá ser alterado por operação ordinária.

---

# 19. Book archive

Book inativo permanece consultável.

Não poderá receber nova Transaction.

---

# 20. Active/archive invariant

Quando ambos os atributos existirem:

```text
active = true
→ archived_at = null

active = false
→ archived_at != null
```

---

# 21. Account

Account representa o local financeiro onde o valor é:

```text
mantido

recebido

gasto

movimentado
```

Exemplos:

```text
Nubank

Inter

Dinheiro

Cartão Nubank
```

---

# 22. Account types V0.1

```text
checking

savings

cash

credit_card

other
```

---

# 23. Account belongs to Book

Toda Account pertence a exatamente um Book.

---

# 24. Mesmo nome em Books diferentes

Permitido:

```text
Pessoal
└── Nubank

Empresa
└── Nubank
```

---

# 25. Account fields conceituais

```text
id

book_id

name

normalized_name

type

currency

institution_name

notes

active

archived_at

created_at

updated_at
```

---

# 26. Account balance

Saldo não será atributo mutável canônico da Account.

O efeito financeiro deriva de Transactions.

---

# 27. Account Book immutability

Depois da criação:

```text
account.book_id
```

é imutável.

---

# 28. Account Currency immutability

Depois da primeira utilização financeira:

```text
account.currency
```

não poderá ser alterada por operação ordinária.

---

# 29. Account Type immutability

Depois da primeira Transaction:

```text
account.type
```

também não poderá mudar por PATCH normal.

---

# 30. Account inactive

Account inativa permanece no histórico.

Não poderá:

```text
receber nova Transaction

ser source de nova Transfer

ser destination de nova Transfer

ser utilizada como default
```

---

# 31. Credit Card Account

Account:

```text
type = credit_card
```

é permitida V0.1.

---

# 32. Credit Card Bill

Não é Account.

Fatura futura será conceito separado.

---

# 33. Regra futura do cartão

Compra:

```text
Expense
```

Pagamento da fatura:

```text
Transfer
```

---

# 34. Category

Category representa classificação financeira.

Exemplo:

```text
Marketing
└── Tráfego Pago
```

---

# 35. Category pertence a Book

Obrigatório V0.1.

---

# 36. Category hierarchy

Category poderá possuir:

```text
parent_category_id
```

---

# 37. Root uniqueness

Categories raiz do mesmo Book não repetem `normalized_name`.

---

# 38. Child uniqueness

Dentro do mesmo parent, o nome normalizado é único.

---

# 39. Mesmo nome em parents diferentes

Permitido.

---

# 40. Parent same Book

Parent e child pertencem ao mesmo Book.

---

# 41. Self-parent

Proibido:

```text
category.parent_category_id
=
category.id
```

---

# 42. Category cycles

Também proibidos:

```text
A → B → C → A
```

---

# 43. Category fields conceituais

```text
id

book_id

name

normalized_name

parent_category_id

type

active

archived_at

created_at

updated_at
```

---

# 44. Category type

Pode ser:

```text
expense

income

both
```

---

# 45. Transfer e Category

Transfer não necessita de Category financeira de receita/despesa para existir.

---

# 46. Category inactive

Permanece em histórico.

Não pode ser usada em nova Transaction.

---

# 47. Product != Category

Exemplo:

```text
Product:
Gasolina

Category:
Transporte > Combustível
```

---

# 48. Merchant

Merchant representa uma contraparte econômica/comercial.

Exemplos:

```text
Amazon

Shell

Assaí

Google Ads

Hostinger
```

---

# 49. Merchant global

Merchant não precisa pertencer a Book.

Pode aparecer em múltiplos contextos.

---

# 50. Merchant fields conceituais

```text
id

name

normalized_name

type

tax_identifier

active

archived_at

created_at

updated_at
```

---

# 51. Reconhecimento de aliases V0.1

Variações como:

```text
GOOGLE *ADS

GOOGLEADS

GOOGLE ADS
```

podem ser reconhecidas e direcionadas para:

```text
Merchant = Google Ads
```

através de:

```text
ClassificationRule

deterministic matching
```

na V0.1.

---

# 52. MerchantAlias dedicado

`MerchantAlias` não é entidade física obrigatória da V0.1.

Não exige:

```text
merchant_aliases table

MerchantAlias CRUD

MerchantAlias API
```

na baseline inicial.

---

# 53. MerchantAlias futuro

Se o uso real demonstrar necessidade de lifecycle independente para aliases, poderá futuramente ser introduzido como:

```text
MerchantAlias
```

com identidade/tabela própria via migration e ADR quando necessário.

---

# 54. Merchant inactive

Permanece no histórico.

Não deverá ser aplicado automaticamente a nova Transaction.

---

# 55. MerchantLocation

Entidade futura.

Representa uma unidade específica do Merchant.

---

# 56. ClassificationRule

ClassificationRule representa regra persistente de classificação determinística.

---

# 57. Parte da V0.1

Obrigatória no núcleo mínimo.

---

# 58. Objetivo

Evitar:

```text
business rule hardcoded

permanent IF no n8n

AI mandatory for known patterns
```

---

# 59. ClassificationRule fields conceituais

```text
id

priority

active

match_type

pattern

target_book_id

target_account_id

target_category_id

target_merchant_id

source

created_at

updated_at
```

---

# 60. Match types V0.1

Conjunto mínimo:

```text
exact

contains
```

ou equivalente tecnicamente simples.

---

# 61. Rule target invariant

A regra deverá possuir pelo menos um target.

---

# 62. Target compatibility

Todos os targets associados a contexto financeiro precisam ser compatíveis.

Exemplo inválido:

```text
Book Empresa

Account Nubank Pessoal
```

---

# 63. Inactive targets

ClassificationRule não poderá aplicar entidade inativa.

---

# 64. Rule precedence

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
confirmation
```

---

# 65. Explicit instruction wins

Regra automática não substitui silenciosamente informação explícita válida do usuário.

---

# 66. Transaction

Transaction representa um evento financeiro canônico.

---

# 67. Transaction types V0.1

Somente:

```text
expense

income

transfer
```

---

# 68. Tipos que não existem V0.1

```text
refund

adjustment
```

não serão `Transaction.type`.

---

# 69. Transaction status V0.1

Somente:

```text
posted

voided
```

---

# 70. `pending` não pertence a Transaction

Uma Transaction só existe quando possui dados suficientes para ser:

```text
posted
```

---

# 71. Ambiguidade pertence à ingestão

```text
InboxMessage
↓
Interpretation
↓
ConfirmationSession
```

---

# 72. Transaction fields conceituais

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

# 73. Tempo financeiro V0.1

A Transaction possui:

```text
transaction_date DATE
```

para a data financeira.

A V0.1 não armazena horário financeiro específico da Transaction.

---

# 74. Money

Value Object conceitual:

```text
Money
├── amount
└── currency
```

---

# 75. Money amount invariant

```text
amount > 0
```

---

# 76. Valores positivos

Semântica vem de `type`.

---

# 77. Expense

Representa saída financeira real.

Exige:

```text
Book

Account

Amount

Description

Transaction Date
```

---

# 78. Expense Account

Precisa estar:

```text
active
```

e pertencer ao mesmo Book.

---

# 79. Expense Category

Opcional.

---

# 80. Expense Merchant

Opcional.

---

# 81. Income

Representa entrada financeira.

Há dois papéis semânticos:

```text
ordinary income

refund income
```

---

# 82. Ordinary Income

É Income com:

```text
refund_of_transaction_id = null
```

---

# 83. Refund Income

É Income com:

```text
refund_of_transaction_id != null
```

---

# 84. Refund não é Transaction.type

Não existe:

```text
type = refund
```

---

# 85. Refund semantic definition

Formalmente:

```text
Transaction.type = income
AND
refund_of_transaction_id != null
```

---

# 86. Refund target

A Transaction original deverá ser:

```text
type = expense
status = posted
```

---

# 87. Refund Book

Obrigatoriamente igual ao Book da Expense original.

---

# 88. Refund Currency

Obrigatoriamente igual à moeda da Expense original.

---

# 89. Refund Account

Representa a Account onde a devolução foi creditada.

---

# 90. Refund Account inference

Quando nenhuma Account for explicitada e a Account original puder ser inferida com segurança:

```text
original account
```

poderá ser utilizada.

Caso contrário:

```text
ConfirmationSession
```

---

# 91. Refund Date

Obrigatório:

```text
refund.transaction_date
>=
original.transaction_date
```

---

# 92. Partial Refund

Permitido.

---

# 93. Full Refund

Permitido.

---

# 94. Multiple Refunds

Permitidos.

---

# 95. Refund total invariant

Sempre:

```text
sum(posted refunds)
<=
original expense amount
```

---

# 96. Refund concurrency

Finance Core deverá garantir que operações concorrentes não produzam:

```text
over-refund
```

---

# 97. Refund-of-refund

Proibido.

---

# 98. Refund correction

Refund Transaction é imutável V0.1, exceto Void.

---

# 99. Refund errado

Fluxo:

```text
Void Refund
↓
Create correct Refund
```

---

# 100. Void Refund

Permitido.

Depois de `voided`, deixa de reduzir net expense.

---

# 101. Expense Void com Refund

Expense não pode ser voided enquanto possuir Refund posted.

---

# 102. Fluxo correto

```text
Void Refund(s)
↓
Void original Expense
```

---

# 103. Expense Correction com Refund

Obrigatório:

```text
new expense amount
>=
total posted refund amount
```

---

# 104. Expense Date Correction com Refund

A nova data deverá permanecer anterior ou igual às datas de todos os Refunds posted associados.

---

# 105. Transfer

Transfer representa movimentação entre Accounts.

---

# 106. Transfer fields necessários

```text
source Account

destination Account

Amount
```

---

# 107. Transfer invariant

```text
source != destination
```

---

# 108. Transfer same Book

Obrigatório V0.1.

---

# 109. Transfer same Currency

Obrigatório.

---

# 110. Cross-Book Transfer

Não pertence à V0.1.

---

# 111. Cross-Book semantic rule

Não transformar automaticamente em:

```text
Expense

Income
```

---

# 112. Transfer reporting

Não compõe:

```text
ordinary income

gross expenses

net expenses
```

---

# 113. Transaction Date

Representa a data em que o evento financeiro ocorreu.

---

# 114. Posted date invariant

```text
transaction_date
<=
today in Book timezone
```

---

# 115. Future date

Pertence a conceitos futuros de:

```text
planned transaction

recurrence

schedule
```

---

# 116. `created_at`

Representa momento técnico de persistência no Finance Hub.

---

# 117. `transaction_date != created_at`

Exemplo válido:

```text
transaction_date = 2026-09-01

created_at = 2026-09-04T...
```

---

# 118. Last Transaction

“Último” significa:

```text
posted Transaction
mais recentemente criada
```

no Book aplicável.

---

# 119. Last ordering

```text
created_at DESC
id DESC
```

---

# 120. Last não usa transaction_date

Uma Transaction retroativa criada agora pode ser a mais recentemente criada.

---

# 121. Human Reference

Transaction poderá possuir:

```text
human_ref
```

Exemplo:

```text
A83K2P
```

---

# 122. Human Reference não substitui ID canônico

ID principal continua UUID.

---

# 123. UUID strategy

Baseline:

```text
UUIDv7 preferred
```

---

# 124. UUID fallback

Se M01 demonstrar suporte inadequado:

```text
UUIDv4
```

poderá ser escolhido via ADR.

---

# 125. Correction

Correction representa atualização controlada de dado registrado incorretamente.

---

# 126. Correction não é entidade financeira separada

Ela altera uma Transaction existente e produz AuditEvent.

---

# 127. Correction fields permitidos

Conforme tipo e invariantes:

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

# 128. Immutable Transaction fields

Operação ordinária não altera:

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

# 129. Book correction

Book errado não será PATCH comum V0.1.

Estratégia:

```text
Void wrong Transaction
↓
create correct Transaction
```

---

# 130. Optimistic Locking

Transaction possui:

```text
version
```

---

# 131. Version invariant

Alteração usa versão esperada.

Versão obsoleta:

```text
VERSION_CONFLICT
```

---

# 132. Void

Void invalida um lançamento sem apagar histórico.

---

# 133. Void transition

```text
posted
→
voided
```

---

# 134. Void preserves history

Transaction permanece armazenada.

---

# 135. Void != Delete

Hard delete não é operação financeira normal.

---

# 136. Void metadata

```text
voided_at

void_reason
```

---

# 137. Voided Transaction reporting

Não afeta summary normal.

---

# 138. AuthorizedSender

Representa origem humana autorizada a utilizar um canal de ingestão.

---

# 139. AuthorizedSender não é sistema completo de User

V0.1 não exige multi-user.

---

# 140. AuthorizedSender fields conceituais

```text
id

channel

sender_reference

name

default_book_id

default_account_id

active

created_at

updated_at
```

---

# 141. Default Book

Opcional.

---

# 142. Default Account

Opcional.

---

# 143. Default Account dependency

Se:

```text
default_account_id != null
```

então:

```text
default_book_id != null
```

---

# 144. Default consistency

```text
default_account.book_id
=
default_book_id
```

---

# 145. Default active

Book e Account configurados como default precisam estar ativos.

---

# 146. Archive default target

Não permitir archive enquanto entidade estiver usada como default ativo.

---

# 147. InboxMessage

Representa uma entrada autorizada aceita pelo pipeline Finance Hub.

---

# 148. Autorização precede raw persistence

Mensagem não autorizada não vira InboxMessage financeiro contendo seu `raw_text`.

---

# 149. Pre-ingestion filtering

Antes de persistir:

```text
service authentication

group/fromMe validation

sender normalization

AuthorizedSender check
```

---

# 150. Group

Ignorado.

---

# 151. `from_me`

Ignorado.

---

# 152. Inbox technical identity

```text
source

source_instance

source_message_id
```

---

# 153. Inbox uniqueness

Essa tripla identifica uma mensagem técnica única.

---

# 154. Inbox fields conceituais

```text
id

source

source_instance

source_message_id

sender_reference

authorized_sender_id

raw_text

raw_payload

received_at

processing_status

attempt_count

processing_started_at

last_attempt_at

processed_at

correlation_id

failure metadata

created_at

updated_at
```

---

# 155. Inbox lifecycle

```text
received

processing

needs_confirmation

processed

failed

ignored
```

---

# 156. Processed Inbox

Não executa novamente efeito financeiro para a mesma identidade.

---

# 157. Failed Inbox

Pode ser reprocessada.

---

# 158. Failed retry invariant

Retry utiliza:

```text
same InboxMessage
```

---

# 159. Stale processing

Inbox presa em `processing` após crash poderá ser retomada após timeout operacional.

---

# 160. Exactly-once goal

Objetivo:

```text
exactly-once logical financial effect
```

sob retry técnico.

---

# 161. Manual repeat

Mensagens diferentes com IDs diferentes podem representar eventos reais diferentes.

---

# 162. Interpretation

Representa interpretação estruturada da Inbox.

---

# 163. Interpretation fields conceituais

```text
id

inbox_message_id

attempt_number

intent

confidence

parsed_data

parser_type

parser_version

AI metadata optional

status

created_at
```

---

# 164. Intents V0.1

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

# 165. Refund intent

Existe como intent conversacional.

Não implica `Transaction.type = refund`.

---

# 166. Interpretation não é Source of Truth financeiro

Depois da Transaction existir:

```text
Transaction
```

é a entidade financeira canônica.

---

# 167. Multiple interpretation attempts

Uma Inbox poderá ter múltiplos attempts de interpretação/reprocessamento.

---

# 168. AI metadata

Quando aplicável:

```text
provider

model

prompt_version
```

---

# 169. AI cannot bypass domain

Confidence não substitui validação.

---

# 170. ConfirmationSession

Estado temporário para ação que necessita:

```text
confirmação

escolha

resolução de ambiguidade
```

---

# 171. Confirmation examples

```text
Qual conta?

Confirma cancelar?

Confirma estorno?
```

---

# 172. Confirmation fields conceituais

```text
id

channel

sender_reference

authorized_sender_id

inbox_message_id

resolved_by_inbox_message_id

action

target_entity_type

target_entity_id

target_version

payload

status

resolution_reason

expires_at

created_at

resolved_at
```

---

# 173. Confirmation lifecycle

```text
pending

confirmed

cancelled

expired
```

---

# 174. Superseded

Não é status independente.

É:

```text
status = cancelled

resolution_reason =
superseded_by_new_command
```

---

# 175. Confirmation TTL

Default:

```text
15 minutes
```

configurável.

---

# 176. One pending confirmation

No máximo uma sessão `pending` por:

```text
channel + sender
```

---

# 177. Confirmation version safety

Ações sobre Transaction guardam:

```text
target_entity_id

target_version
```

---

# 178. Stale confirmation

Se a versão mudou:

```text
não executa
```

e deverá revalidar/reapresentar.

---

# 179. Origin message

`inbox_message_id` identifica a mensagem que abriu a ConfirmationSession.

---

# 180. Resolution message

`resolved_by_inbox_message_id` identifica a mensagem que confirmou/cancelou.

---

# 181. Short replies

Com sessão pendente:

```text
sim

não

1

2
```

são interpretados contextualmente.

---

# 182. New full command

Novo comando completo cancela a sessão pendente e é processado independentemente.

---

# 183. Confirmation finalization

A Inbox original deverá sair de `needs_confirmation` quando a sessão resolver, cancelar ou expirar.

---

# 184. IdempotencyKey

Representa proteção persistente contra repetição de operações financeiras explícitas da API.

---

# 185. Idempotency vs Inbox identity

São mecanismos diferentes.

Inbox:

```text
source
+
source_instance
+
source_message_id
```

Direct financial POST:

```text
Idempotency-Key
```

---

# 186. IdempotencyKey fields conceituais

```text
id

scope

idempotency_key

request_hash

status

response_status

response_body/reference

resource_type

resource_id

created_at

completed_at
```

---

# 187. Idempotency states V0.1

Somente:

```text
in_progress

completed
```

---

# 188. No failed lifecycle

Falha pré-COMMIT reverte idempotency record junto da operação.

---

# 189. No automatic expiration

V0.1 não expira automaticamente IdempotencyKey.

---

# 190. Idempotency semantic invariant

```text
same scope
+
same key
+
same request
=
same logical result
```

---

# 191. Conflict

```text
same scope
+
same key
+
different request
=
IDEMPOTENCY_CONFLICT
```

---

# 192. AuditEvent

Registra mudança relevante de domínio.

---

# 193. Audit fields conceituais

```text
id

entity_type

entity_id

action

source

actor_reference

old_data

new_data

correlation_id

created_at
```

---

# 194. Audit append-only lógico

Não será normalmente editado ou apagado.

---

# 195. Audit minimum events

```text
TRANSACTION_CREATED

TRANSACTION_UPDATED

TRANSACTION_VOIDED

TRANSACTION_REFUND_CREATED
```

---

# 196. Audit != Log

Operational logs e Audit possuem funções distintas.

---

# 197. OutboxEvent

Representa evento persistido para integração assíncrona.

---

# 198. Outbox fields conceituais

```text
id

event_type

aggregate_type

aggregate_id

payload

status

attempts

available_at

processed_at

last_error

created_at
```

---

# 199. Outbox rule V0.1

A tabela pode existir.

Eventos somente serão produzidos quando houver:

```text
consumer
ou
integration configurada
```

real.

---

# 200. Outbox is not Redis

Outbox canônica é persistida no PostgreSQL.

---

# 201. External delivery

Não prometer exactly-once.

Consumers devem ser idempotentes.

---

# 202. Service authorization

A V0.1 distinguirá pelo menos dois contextos.

---

# 203. Ingest credential

Scope:

```text
finance:ingest
```

---

# 204. Admin credential

Scope:

```text
finance:admin
```

---

# 205. n8n trust boundary

n8n comprometido significa integration trust boundary comprometida.

AuthorizedSender não é defesa criptográfica suficiente contra isso.

---

# 206. Mitigações

```text
least privilege

limited scope

internal networking

audit
```

---

# 207. Source

Entidades relevantes poderão indicar origem:

```text
whatsapp

api

web

import

system
```

---

# 208. Source is server-controlled

Client comum não escolhe `source` arbitrariamente.

---

# 209. SourceReference

Pode armazenar referência externa.

---

# 210. Correlation ID

Fluxos relacionados deverão poder compartilhar um identificador.

```text
InboxMessage
↓
Interpretation
↓
Transaction
↓
AuditEvent
```

---

# 211. Summary model

Resumo V0.1 por Book deverá separar:

```text
ordinary_income

gross_expenses

refunds

net_expenses

net
```

---

# 212. Ordinary income

```text
posted income
AND
refund_of_transaction_id IS NULL
```

---

# 213. Refunds

```text
posted income
AND
refund_of_transaction_id IS NOT NULL
```

---

# 214. Gross expenses

```text
posted expense
```

---

# 215. Net expenses

```text
gross expenses
-
refunds
```

---

# 216. Net

```text
ordinary income
-
net expenses
```

---

# 217. Transfers

Excluídas de income/expense summary.

---

# 218. Voided Transactions

Excluídas de summary normal.

---

# 219. Direct summary context

API direta deverá fornecer Book explicitamente.

---

# 220. WhatsApp summary context

Pode usar Default Book do AuthorizedSender.

---

# 221. Future Consumption Domain

Não implementar na V0.1.

Entidades previstas:

```text
Product

Brand

ProductVariant

ProductPackage

ProductAlias

Unit

TransactionItem
```

---

# 222. Product

Representa produto genérico.

---

# 223. Brand

Representa marca.

---

# 224. ProductVariant

Representa variação.

---

# 225. ProductPackage

Representa apresentação comercial específica.

---

# 226. TransactionItem

Representa item efetivamente comprado.

---

# 227. Transaction can exist without TransactionItems

Fundamental.

---

# 228. Future Price Intelligence

Principal entidade:

```text
PriceObservation
```

---

# 229. PriceObservation

Representa preço observado.

---

# 230. PriceObservation != Transaction

Se apenas observado, não há necessariamente efeito financeiro.

---

# 231. Future Receipt

```text
Attachment

Receipt

ReceiptItem
```

---

# 232. Receipt != Transaction

Documento e evento financeiro possuem lifecycles distintos.

---

# 233. Future Vehicle

```text
Vehicle

FuelEvent
```

---

# 234. FuelEvent != Transaction

FuelEvent representa detalhes técnicos do abastecimento.

---

# 235. Future Reconciliation

```text
ExternalTransactionRecord

ReconciliationMatch
```

---

# 236. Import does not automatically mean Transaction

Objetivo é evitar duplicação de Transactions já registradas.

---

# 237. Future Installments

Deverão possuir modelo explícito.

---

# 238. Future Recurrence

Regra recorrente é separada da Transaction gerada.

---

# 239. V0.1 entities obrigatórias

```text
Book

Account

Category

Merchant

ClassificationRule

AuthorizedSender

InboxMessage

Interpretation

ConfirmationSession

Transaction

AuditEvent

IdempotencyKey

OutboxEvent
```

---

# 240. Alias recognition na V0.1

Reconhecimento de aliases de Merchant faz parte da classificação, mas **não exige uma entidade `MerchantAlias` dedicada**.

Baseline:

```text
ClassificationRule
+
deterministic matching
```

---

# 241. Future entities não físicas V0.1

Não criar tabelas V0.1 para:

```text
MerchantAlias

MerchantLocation

Product

Brand

ProductVariant

ProductPackage

ProductAlias

Unit

TransactionItem

PriceObservation

Promotion

Attachment

Receipt

ReceiptItem

Vehicle

FuelEvent

InstallmentGroup

RecurringTransactionRule

ExternalTransactionRecord

ReconciliationMatch

TransactionSplit

Budget

Tag

MonitoringRule
```

---

# 242. ExternalMapping

Só deverá existir quando integração persistente realmente necessitar.

Exemplo futuro:

```text
Finance Transaction
↔
Firefly Transaction
```

---

# 243. V0.1 conceptual diagram

```text
AuthorizedSender
      │
      ├── default Book
      └── default Account


Book
 │
 ├── Accounts
 │
 ├── Categories
 │
 └── Transactions
        │
        ├── Expense
        ├── Ordinary Income
        ├── Transfer
        └── Refund Income
              │
              └── refund_of_transaction_id
                       ↓
                  Expense


Merchant
    ↑
    │
Transaction


ClassificationRule
   │
   ├── Book
   ├── Account
   ├── Category
   └── Merchant


Authorized inbound message
        ↓
InboxMessage
        ↓
Interpretation
        │
        ├── Transaction
        ├── Query
        └── ConfirmationSession


ConfirmationSession
        │
        ├── target Transaction/version
        └── resolving InboxMessage


Transaction
    ├── AuditEvents
    └── OutboxEvents when configured
```

---

# 244. Core invariants

Obrigatório manter:

```text
Every Transaction belongs to one Book.

Every Account belongs to one Book.

Every Category belongs to one Book.

Book/Account/Transaction currency match V0.1.

Transaction amount > 0.

Transaction type is only expense/income/transfer.

Transaction status is only posted/voided.

Posted Transaction date cannot be future V0.1.

Expense requires active Account.

Income requires active Account.

Transfer requires two active Accounts.

Transfer source != destination.

Transfer remains within one Book.

Refund is Income + refund_of_transaction_id.

Refund target is a posted Expense.

Refund cannot point to a Refund.

Refund Book/Currency equal original Expense.

Refund date >= Expense date.

Total posted Refunds <= Expense amount.

Expense with posted Refund cannot be voided.

Refund is immutable except Void.

Correction cannot violate Refund invariants.

Void preserves Transaction.

Inactive master data cannot be used in new Transactions.

Duplicate processed Inbox cannot duplicate financial effect.

Failed Inbox may be retried using same Inbox entity.

Unauthorized sender does not create financial Inbox raw_text.

API financial POST idempotency is persistent.

AI cannot bypass Finance Core.
```

---

# 245. Progressive Enrichment

Uma Transaction poderá existir sem:

```text
Category

Merchant
```

quando esses dados não forem seguros.

---

# 246. Critical fields

Expense/Income exigem:

```text
Book

Account

Amount

Description

Transaction Date
```

---

# 247. Não exigir domínio futuro

Mensagem:

```text
35 almoço nubank
```

não exige:

```text
Product

Receipt

Tax

TransactionItem
```

---

# 248. Raw Data Preservation

Quando uma InboxMessage for autorizada e aceita, preservar:

```text
raw_text
```

para rastreabilidade/reprocessamento conforme política.

---

# 249. Unauthorized raw data

Não armazenar `raw_text` em Finance Inbox para sender não autorizado.

---

# 250. Normalization

Fluxo:

```text
raw
↓
normalized
```

deve preservar a origem.

---

# 251. Derived data

Valores como:

```text
summary

net expenses

average price
```

são derivados e deverão ser reconstruíveis quando razoável.

---

# 252. Domain Event vs AuditEvent

Domain Event significa:

```text
algo ocorreu
```

AuditEvent significa:

```text
mudança persistida para histórico
```

Não são obrigatoriamente a mesma estrutura.

---

# 253. Worker

Não é domínio.

É runtime operacional.

---

# 254. Redis

Também não é domínio.

É componente operacional.

---

# 255. Tool-shaped domain proibido

Não adicionar campos canônicos apenas porque uma integração específica os possui.

---

# 256. Regra para nova entidade

Antes de criar nova entidade:

> Possui identidade e lifecycle próprios?

Se não:

```text
provavelmente atributo, regra ou value object
```

---

# 257. Regra para provider fields

Antes de adicionar:

```text
firefly_id

evolution_id
```

ao Core, avaliar adapter/mapping.

---

# 258. Success Scenario — Expense

```text
35 almoço nubank
```

pode resultar em:

```text
InboxMessage

Interpretation

posted Expense

AuditEvent
```

---

# 259. Success Scenario — Ordinary Income

```text
recebi 2500 cliente empresa inter
```

gera:

```text
type = income

refund_of_transaction_id = null
```

---

# 260. Success Scenario — Transfer

```text
transferi 500 nubank para inter
```

gera:

```text
type = transfer

same Book

same Currency
```

---

# 261. Success Scenario — Correction

```text
corrige último para 38,90
```

gera:

```text
version check

Transaction update

version increment

AuditEvent
```

---

# 262. Success Scenario — Void

```text
apaga último
```

gera:

```text
ConfirmationSession
↓
confirmation
↓
posted → voided
```

---

# 263. Success Scenario — Refund

Original:

```text
Expense
R$500
```

Refund:

```text
Income
R$200
refund_of_transaction_id = original.id
```

---

# 264. Refund summary

```text
ordinary_income = 0

gross_expenses = 500

refunds = 200

net_expenses = 300
```

---

# 265. Success Scenario — Duplicate Processed Inbox

Mesma identidade técnica:

```text
0 new financial effects
```

---

# 266. Success Scenario — Failed Inbox Retry

Reprocessa a mesma InboxMessage.

---

# 267. Success Scenario — Unauthorized Sender

```text
0 Transactions

0 Finance Inbox raw_text
```

---

# 268. Success Scenario — Confirmation superseded

Pending Confirmation + novo comando completo:

```text
old confirmation cancelled

resolution_reason = superseded_by_new_command

new command processed
```

---

# 269. Future Product Example

```text
Leite Shefa Integral 1L
```

poderá futuramente ser:

```text
Product = Leite

Brand = Shefa

Variant = Integral

Package = 1L
```

---

# 270. Future Price Example

Preço apenas observado gera:

```text
PriceObservation
```

não Expense.

---

# 271. Future Receipt Example

```text
Receipt
↓
ReceiptItems
↓
Normalization
↓
Transaction / TransactionItems
```

conforme regra futura.

---

# 272. Future Fuel Example

Abastecimento poderá gerar:

```text
Expense Transaction
+
FuelEvent
```

sem misturar os dois conceitos.

---

# 273. Stability rule

O núcleo:

```text
Book

Account

Category

Merchant

Transaction
```

deverá permanecer válido durante expansão futura.

---

# 274. Consolidações definitivas desta v0.3.1

Esta versão mantém congelado:

```text
Transaction.type
=
expense | income | transfer

Transaction.status
=
posted | voided

Refund
=
Income + refund_of_transaction_id

single currency per Book

persistent Inbox/Confirmation

ClassificationRule-based alias recognition
```

e corrige especificamente:

```text
MerchantAlias
≠
mandatory V0.1 physical entity
```

Na V0.1:

```text
alias recognition
↓
ClassificationRule / deterministic matching
```

Entidade dedicada `MerchantAlias` fica futura.

---

# 275. Condição para Freeze

Este documento somente poderá mudar de:

```text
FREEZE CANDIDATE
```

para:

```text
FROZEN — Baseline for Implementation
```

quando a checagem mecânica final confirmar:

```text
MerchantAlias is NOT mandatory V0.1 entity
```

e compatibilidade com `FINAL-FREEZE-DECISIONS.md`.

---

# 276. Regra final

O Domain Model não será reaberto por preferência de implementação.

Somente problema capaz de causar:

```text
dinheiro incorreto

duplicação financeira

perda de histórico

acesso não autorizado

restore impossível

schema impossível

milestone impossível
```

poderá reabrir decisão congelada.

---

# 277. Objetivo final

O modelo deve permitir começar com:

```text
35 almoço nubank
```

e evoluir futuramente para:

```text
financial history

products

prices

receipts

vehicles

reconciliation

analytics

AI
```

sem reinterpretar ou destruir a semântica financeira da V0.1.