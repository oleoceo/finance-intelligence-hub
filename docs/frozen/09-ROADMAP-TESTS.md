# 09-ROADMAP-TESTS.md

# Finance Intelligence Hub
## Implementation Roadmap, Gates and Test Strategy — V0.1

**Documento:** `09-ROADMAP-TESTS.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub  

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `03-ARCHITECTURE.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `07-SECURITY.md`
- `08-BACKUP-RESTORE.md`

---

# 1. Objetivo

Este documento define:

```text
ordem de implementação

milestones

gates

dependências

testes

acceptance criteria

release criteria

Production readiness

future roadmap
```

---

# 2. Princípio principal

Não implementar o Finance Intelligence Hub como:

```text
"faça tudo"
```

em uma única task.

A construção será incremental.

---

# 3. Regra principal do roadmap

Cada milestone deverá:

```text
possuir escopo

possuir acceptance criteria

possuir testes

deixar sistema consistente
```

antes da próxima camada.

---

# 4. Ordem canônica V0.1

```text
DOCUMENTATION FREEZE
        ↓
       M01
 Local Bootstrap
        │
        ├────────────────┐
        │                │
        ▼                ▼
 local implementation   Gate 0
                         VPS Safety
        │                │
        └────────┬───────┘
                 ▼
          M01 Lab Validation
                 ↓
                M02
       Database Foundation
                 ↓
                M03
   Master Data / Configuration
                 ↓
                M04
       Transaction Core
                 ↓
               GATE A
                 ↓
                M05
 Inbox / Parser / Confirmation
                 ↓
                M06
      WhatsApp Integration
                 ↓
                M07
 Correction / Void / Refund
                 ↓
               GATE B
                 ↓
                M08
 Reports / Export / Operations
                 ↓
                M09
       Backup / Restore
                 ↓
               GATE C
                 ↓
              v0.1.0
```

---

# 5. Documentation Freeze

Antes da implementação oficial deverão existir:

```text
FINAL-FREEZE-DECISIONS.md

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

todos coerentes.

---

# 6. Após Freeze

Criar:

```text
AGENTS.md

PROJECT_STATE.md

README.md

CHANGELOG.md

initial ADRs
```

---

# 7. Gate de documentação

Somente depois da matriz:

```text
FINAL-FREEZE-DECISIONS
×
10 canonical docs
```

resultar em:

```text
PASS
```

os documentos serão marcados:

```text
FROZEN — Baseline for Implementation
```

---

# 8. Não reabrir arquitetura por preferência

Depois do Freeze:

```text
framework preference

renaming

optional optimization

future feature
```

não reabre documentação.

---

# 9. Mudança arquitetônica pós-Freeze

```text
implementation discovery
↓
is it blocker?
│
├── NO
│   ↓
│  BACKLOG
│
└── YES
    ↓
   ADR
    ↓
affected canonical doc
    ↓
implementation
```

---

# 10. Blockers válidos

Somente problemas capazes de causar:

```text
money incorrect

duplicate financial effect

history loss

unauthorized access

restore impossible

impossible schema

impossible milestone
```

podem reabrir decisão congelada.

---

# 11. M01 — Local Bootstrap

Objetivo:

```text
criar fundação executável do repositório
```

sem depender da VPS.

---

# 12. M01 pode começar antes do Gate 0

Permitido:

```text
Git repository

local code

local tests

local PostgreSQL

migrations skeleton

OpenAPI skeleton

CI
```

---

# 13. M01 não pode antes do Gate 0

Na VPS:

```text
deploy Finance Hub

create Finance DB

provision postgres-products

change Docker networks

change NPM

grant remote Codex operational access
```

---

# 14. M01 stack decision

Escolher:

```text
runtime

web framework

database library/ORM

migration tool

test framework

validation library
```

---

# 15. M01 decision criteria

Priorizar:

```text
maintainability

PostgreSQL support

transaction support

strict validation

testing

migrations

structured logging

Docker friendliness
```

---

# 16. UUID validation

M01 deverá validar suporte real a:

```text
UUIDv7
```

---

# 17. UUID baseline

Preferência:

```text
UUIDv7
```

---

# 18. UUID fallback

Se stack não possuir suporte confiável:

```text
UUIDv4
```

via ADR.

---

# 19. M01 local PostgreSQL

Permitido:

```text
Testcontainers

Docker Compose dev

ephemeral PostgreSQL
```

---

# 20. Regra

A proibição de:

```text
finance-postgres
```

vale para stack da VPS.

Não bloqueia PostgreSQL local/test.

---

# 21. M01 repository structure

Criar pelo menos:

```text
apps/

packages/

database/

scripts/

tests/

docs/
```

conforme arquitetura.

---

# 22. M01 configuration

Criar:

```text
.env.example
```

sem secrets reais.

---

# 23. M01 environment model

Distinguir:

```text
development

test

lab

production
```

---

# 24. M01 health endpoints

Implementar:

```text
/health

/ready
```

---

# 25. Readiness local

PostgreSQL é dependência crítica.

---

# 26. Logging baseline

Implementar:

```text
structured logs

request_id

correlation_id
```

---

# 27. API base

Preparar:

```text
/api/v1
```

---

# 28. Strict schema validation

Esqueleto deverá rejeitar write payload desconhecido conforme política da API.

---

# 29. Test protection

Test suite deverá possuir guard contra:

```text
finance_hub_prod
```

---

# 30. M01 CI

Executar no mínimo:

```text
lint

typecheck if applicable

unit tests

integration tests
```

---

# 31. M01 Acceptance

```text
[ ] fresh clone works

[ ] dependencies install

[ ] local PostgreSQL available

[ ] API starts

[ ] /health works

[ ] /ready validates DB

[ ] migrations framework initialized

[ ] test DB isolated

[ ] structured logging exists

[ ] request/correlation IDs exist

[ ] .env.example exists

[ ] secrets absent from Git

[ ] CI green

[ ] UUID decision validated/documented
```

---

# 32. Gate 0 — VPS Safety

Gate 0 poderá ocorrer em paralelo com M01 local.

---

# 33. Gate 0 objective

Antes de qualquer mudança operacional:

```text
understand VPS exactly as it exists
```

---

# 34. Gate 0 inventory

Verificar:

```text
CPU

RAM

disk

Docker version

running containers

volumes

networks

public ports

NPM

Portainer

n8n

Evolution

Redis

PostgreSQL services

UFW

Fail2Ban

SSH

backups
```

---

# 35. Gate 0 — `postgres-products`

Verificar:

```text
exists?

running?

healthy?

correct network?

persistent volume?

public port?

backup?
```

---

# 36. `postgres-products` may be absent

Isso não é erro de documentação.

É cenário permitido.

---

# 37. Se existir

Validar antes de usar.

---

# 38. Se não existir

Criar task separada:

```text
PROVISION POSTGRES-PRODUCTS
```

---

# 39. Provisioning task

Deverá possuir:

```text
explicit approval

bounded scope

known path

known network

no public DB port

persistent volume

strong credentials

initial validation

initial backup
```

---

# 40. Path

```text
/opt/apps/apps/databases/postgres-products
```

---

# 41. Shared infra rule

Essa task não é:

```text
normal Finance feature task
```

---

# 42. Gate 0 — n8n connectivity

Verificar se n8n participa de:

```text
apps-backend
```

ou não.

---

# 43. Não presumir

Nenhuma implementação deverá anexar rede automaticamente sem inspeção.

---

# 44. Connectivity decision

Depois da inspeção:

```text
internal apps-backend
```

ou:

```text
controlled authenticated NPM route
```

será registrado via ADR.

---

# 45. Gate 0 — public ports

Confirmar que:

```text
PostgreSQL

Redis
```

não estão públicos.

---

# 46. Gate 0 — permissions

Identificar ownership/UID/GID dos volumes relevantes.

---

# 47. Global chown/chmod

Proibido.

---

# 48. Gate 0 — Codex

Definir modelo operacional seguro.

---

# 49. Codex account

Preferência:

```text
dedicated limited user
```

---

# 50. Codex normal scope

```text
repository

/opt/apps/apps/lab/finance-hub
```

---

# 51. Não conceder

```text
NOPASSWD: ALL

unrestricted Production

unrestricted shared infrastructure
```

---

# 52. Gate 0 — backup

Avaliar estado atual antes das mudanças.

---

# 53. Gate 0 PASS

Somente se riscos operacionais essenciais estiverem entendidos.

---

# 54. Gate 0 Acceptance

```text
[ ] VPS inventoried

[ ] networks inventoried

[ ] public ports known

[ ] n8n connectivity known

[ ] postgres-products state known

[ ] Redis state known

[ ] NPM reviewed

[ ] Portainer reviewed

[ ] UFW reviewed

[ ] Fail2Ban reviewed

[ ] SSH recovery known

[ ] backups reviewed

[ ] filesystem permission model understood

[ ] Codex privilege model decided

[ ] no destructive uncertainty remains
```

---

# 55. M01 Lab Validation

Depois de:

```text
M01 local acceptance
+
Gate 0 PASS
```

a aplicação poderá ser validada no Lab.

---

# 56. Lab path

```text
/opt/apps/apps/lab/finance-hub
```

---

# 57. Lab secrets

Separados de Production.

---

# 58. Lab database

Depois de infraestrutura disponível:

```text
finance_hub_lab
```

---

# 59. M02 — Database Foundation

Objetivo:

```text
implementar schema PostgreSQL canônico V0.1
```

---

# 60. M02 dependency

Na VPS:

```text
Gate 0 PASS

postgres-products operational
```

---

# 61. M02 tables

Criar:

```text
books

accounts

categories

merchants

classification_rules

authorized_senders

inbox_messages

interpretations

confirmation_sessions

transactions

audit_events

idempotency_keys

outbox_events
```

---

# 62. Merchant aliases V0.1

Não criar `merchant_aliases` obrigatoriamente.

Aliases iniciais serão tratados através de:

```text
ClassificationRule

deterministic matching
```

---

# 63. Não criar future tables

Não implementar antecipadamente:

```text
MerchantAlias

Products

PriceObservations

Receipts

Vehicles

Reconciliation

Installments

Recurrence

ExternalMappings
```

---

# 64. Transaction types

Schema:

```text
expense

income

transfer
```

somente.

---

# 65. Transaction statuses

Schema:

```text
posted

voided
```

somente.

---

# 66. Removidos

Não existem fisicamente:

```text
type=refund

type=adjustment

status=pending

status=active
```

---

# 67. Refund schema

```text
type = income

refund_of_transaction_id != null
```

---

# 68. Money

```text
NUMERIC(18,2)
```

---

# 69. Currency

```text
VARCHAR(3)
```

upper-case validated.

---

# 70. Same Currency invariant

Schema deverá reforçar:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

quando possível através de FKs compostas.

---

# 71. Transaction financial date

V0.1 utiliza:

```text
transaction_date DATE
```

Não há horário financeiro específico da Transaction na baseline.

---

# 72. Inbox identity

```text
source

source_instance

source_message_id
```

UNIQUE.

---

# 73. Inbox retry metadata

Schema inclui:

```text
attempt_count

processing_started_at

last_attempt_at

processed_at
```

---

# 74. Confirmation

Schema inclui:

```text
resolved_by_inbox_message_id

resolution_reason

expires_at

target_version
```

---

# 75. One pending Confirmation

Índice único parcial.

---

# 76. Idempotency

Estados:

```text
in_progress

completed
```

---

# 77. Idempotency expiry

Não implementar automática V0.1.

---

# 78. M02 migrations

Deverão funcionar sobre:

```text
empty database
```

---

# 79. M02 DB roles

Preparar:

```text
finance_hub_app

finance_hub_migrations

finance_hub_readonly
```

---

# 80. Runtime role

Não superuser.

---

# 81. M02 tests

```text
migration fresh

money precision

FKs

CHECKs

uniqueness

Book currency

Account Book

Category hierarchy

Inbox uniqueness

Confirmation uniqueness

Transaction structure

idempotency uniqueness
```

---

# 82. M02 Acceptance

```text
[ ] all V0.1 tables exist

[ ] future tables absent

[ ] merchant_aliases absent as mandatory table

[ ] migrations from empty DB pass

[ ] NUMERIC money

[ ] only 3 Transaction types

[ ] only posted/voided statuses

[ ] linked Refund schema exists

[ ] source_instance Inbox uniqueness

[ ] Confirmation fields complete

[ ] idempotency states complete

[ ] indexes created

[ ] app role non-superuser

[ ] integration tests pass
```

---

# 83. M03 — Master Data / Configuration

Objetivo:

```text
implementar configuração financeira
```

---

# 84. M03 features

```text
Books

Accounts

Categories

Merchants

ClassificationRules

AuthorizedSenders
```

---

# 85. Book tests

```text
create

update allowed fields

archive

single currency

currency immutability after dependencies
```

---

# 86. Account tests

```text
same Book currency

archive

type

same-name across Books

immutable Book after create

currency/type immutable after use
```

---

# 87. Category tests

```text
root uniqueness

child uniqueness

same name in different parents

same Book parent

self-parent rejected

cycle rejected
```

---

# 88. Merchant tests

```text
create

normalize

archive

history preserved
```

---

# 89. ClassificationRule tests

```text
at least one target

priority

exact

contains

target compatibility

inactive target not applied

explicit instruction wins

merchant alias-like matching
```

---

# 90. AuthorizedSender tests

```text
sender uniqueness

default Book

default Account

default Account requires Book

same Book defaults

active defaults only

archive target blocked while default
```

---

# 91. Production bootstrap

Não usar migration rígida para criar:

```text
Pessoal

Empresa
```

---

# 92. Lab seed

Permitido.

---

# 93. M03 Acceptance

```text
[ ] Books CRUD/config works

[ ] Accounts works

[ ] Categories hierarchy works

[ ] cycles blocked

[ ] Merchants works

[ ] ClassificationRules works

[ ] merchant alias-like matching works through rules

[ ] target compatibility enforced

[ ] AuthorizedSender defaults work

[ ] inactive defaults rejected

[ ] archive protection works

[ ] Lab seed works
```

---

# 94. M04 — Transaction Core

Objetivo:

```text
implementar núcleo financeiro independente de WhatsApp
```

---

# 95. M04 must work without

```text
Evolution

n8n

AI

Firefly

Metabase
```

---

# 96. M04 features

```text
Create Expense

Create Income

Create Transfer

Get Transaction

List Transactions

Get Last

basic Audit

direct API idempotency
```

---

# 97. Create Expense

Validar:

```text
Book active

Account active

same Book

same Currency

amount > 0

date not future
```

---

# 98. Create Income

Mesmas invariantes essenciais.

---

# 99. Ordinary Income

Obrigatório:

```text
refund_of_transaction_id = null
```

quando criado genericamente.

---

# 100. Generic Refund bypass

Proibido.

---

# 101. Create Transfer

Validar:

```text
source active

destination active

source != destination

same Book

same Currency

amount > 0

date not future
```

---

# 102. Cross-Book Transfer

Rejeitar.

---

# 103. Last semantics

Implementar:

```text
status = posted

order by created_at DESC, id DESC
```

---

# 104. Direct Last

Exige:

```text
book_id
```

---

# 105. Audit create

Criar:

```text
TRANSACTION_CREATED
```

na mesma DB transaction.

---

# 106. Direct API Idempotency

Obrigatório no generic create.

---

# 107. Idempotency tests

```text
same key + same request
→ same result

same key + different request
→ 409
```

---

# 108. M04 financial tests

```text
Money

Expense

Income

Transfer

Book isolation

Currency

inactive master data

future date

Last

Audit

Idempotency
```

---

# 109. M04 Acceptance

```text
[ ] Expense works

[ ] Income works

[ ] Transfer works

[ ] generic create only 3 types

[ ] posted only initial status

[ ] inactive entities rejected

[ ] future dates rejected

[ ] cross-Book Transfer rejected

[ ] Last correct

[ ] Audit atomic

[ ] idempotency atomic

[ ] Finance Core works without WhatsApp/AI
```

---

# 110. GATE A — Core Independence

Gate A verifica:

```text
Finance Hub is already a valid financial system
without messaging integrations
```

---

# 111. Gate A tests

Com:

```text
Evolution stopped

n8n unavailable

AI unavailable

Firefly absent
```

deve ser possível:

```text
Create Expense

Create Income

Create Transfer

Query Transaction

Get Last
```

via Finance API/Core.

---

# 112. Gate A PASS

Obrigatório antes de M05/M06.

---

# 113. M05 — Inbox / Parser / Confirmation

Objetivo:

```text
transformar mensagem autorizada em comando financeiro seguro
```

---

# 114. M05 features

```text
AuthorizedSender check

Inbox persistence

Inbox uniqueness

retry lifecycle

Interpretation

deterministic parser

ClassificationRules

defaults

ConfirmationSession

unknown intent
```

---

# 115. Authorization order test

Obrigatório:

```text
service auth
↓
group/fromMe filter
↓
normalize sender
↓
AuthorizedSender
↓
raw Inbox persistence
```

---

# 116. Unauthorized sender test

Esperado:

```text
0 Transaction

0 Finance Inbox raw_text
```

---

# 117. Group test

Ignored before Finance Inbox normal persistence.

---

# 118. fromMe test

Ignored.

---

# 119. Inbox unique identity test

Same:

```text
source

source_instance

source_message_id
```

não cria segunda Inbox.

---

# 120. Processed retry

Não reexecuta.

---

# 121. Failed retry

Reprocessa:

```text
same InboxMessage
```

---

# 122. Stale processing

Recuperável após timeout operacional.

---

# 123. Parser priority

Testar:

```text
explicit input

ClassificationRule

deterministic alias/mapping

deterministic parser

AI fallback

Confirmation
```

---

# 124. AI optional

M05 acceptance não depende de AI externa.

---

# 125. Missing Account

Gera:

```text
needs_confirmation
```

sem Transaction.

---

# 126. Confirmation default TTL

```text
15 minutes
```

---

# 127. Confirmation status

```text
pending

confirmed

cancelled

expired
```

---

# 128. One pending per sender

Test obrigatório.

---

# 129. Supersede

Novo comando completo:

```text
old confirmation cancelled

resolution_reason =
superseded_by_new_command
```

---

# 130. Confirmation resolution message

Persistir:

```text
resolved_by_inbox_message_id
```

---

# 131. Original Inbox finalization

Não deixar:

```text
needs_confirmation forever
```

---

# 132. One financial command per message

Testar rejeição/reformulação de múltiplos comandos.

---

# 133. M05 Acceptance

```text
[ ] unauthorized sender blocked pre-raw persistence

[ ] groups ignored

[ ] from_me ignored

[ ] Inbox uniqueness works

[ ] processed retry does not repeat

[ ] failed retry reuses row

[ ] stale processing recoverable

[ ] deterministic parser works

[ ] defaults work

[ ] ClassificationRules work

[ ] AI is optional

[ ] Confirmation persisted

[ ] 15-minute TTL

[ ] one pending Confirmation

[ ] supersede works

[ ] resolution Inbox tracked

[ ] original Inbox finalized
```

---

# 134. M06 — WhatsApp Integration

Objetivo:

```text
ligar Evolution + n8n à Finance API
```

sem mover regra financeira para o workflow.

---

# 135. Escopo funcional do M06

M06 valida o transporte WhatsApp para capacidades que já existem até esse ponto.

Não antecipa funcionalidades que pertencem a M07 ou M08.

---

# 136. n8n credential

Somente:

```text
finance:ingest
```

---

# 137. Security test

n8n token:

```text
POST /inbox/messages ✓

POST /transactions ✗

/admin/* ✗
```

---

# 138. n8n workflow

```text
Evolution webhook
↓
technical filter
↓
minimal normalization
↓
Finance API
↓
structured result
↓
reply.should_send?
↓
Evolution send
```

---

# 139. n8n does not contain

```text
financial defaults

Refund logic

Void logic

classification business logic

SQL
```

---

# 140. Retry rules

```text
500/503
→ controlled retry

429
→ Retry-After

4xx validation/domain
→ no blind retry
```

---

# 141. Retry identity

Always preserve:

```text
source

source_instance

source_message_id
```

---

# 142. Duplicate webhook E2E

Exactly one logical financial effect.

---

# 143. Reply delivery failure

Finance state remains valid.

---

# 144. Reply exactly-once

Not guaranteed.

---

# 145. M06 acceptance commands

Os comandos obrigatórios desta milestone são:

```text
35 almoço nubank

empresa 327,40 google ads inter

recebi 2500 cliente empresa inter

transferi 500 nubank para inter

último
```

---

# 146. `resumo` não é acceptance de M06

O comando:

```text
resumo
```

faz parte da experiência final V0.1, mas seu backend de reporting será implementado em:

```text
M08 — Reports / Export / Operations
```

---

# 147. Motivo

M06 deve provar:

```text
WhatsApp transport
+
Inbox
+
Finance Core integration
```

sem antecipar o módulo de reporting.

---

# 148. M06 Acceptance

```text
[ ] Evolution webhook reaches n8n

[ ] n8n uses ingest-only credential

[ ] Finance API receives normalized envelope

[ ] Expense command works

[ ] Income command works

[ ] Transfer command works

[ ] Last works

[ ] duplicate webhook safe

[ ] reply delivery works

[ ] reply failure does not duplicate finance

[ ] no financial SQL in n8n
```

---

# 149. M07 — Correction / Void / Refund

Objetivo:

```text
completar lifecycle financeiro seguro
```

---

# 150. Correction

Implementar:

```text
PATCH transaction
```

com optimistic locking.

---

# 151. Mutable fields

Conforme contrato:

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

# 152. Immutable fields

Testar rejeição:

```text
book_id

type

status

source

refund_of_transaction_id
```

---

# 153. Book correction

Fora de PATCH comum.

Estratégia:

```text
Void
+
recreate
```

---

# 154. Void

Implementar:

```text
POST /transactions/{id}/void
```

---

# 155. Void Idempotency-Key

Obrigatório.

---

# 156. Void version

Obrigatória.

---

# 157. WhatsApp Void

Sempre Confirmation.

---

# 158. Refund representation

Congelada:

```text
type = income

refund_of_transaction_id = original Expense
```

---

# 159. Refund endpoint

```text
POST /transactions/{id}/refunds
```

---

# 160. Refund generic create

Proibido.

---

# 161. Refund Idempotency-Key

Obrigatório.

---

# 162. Refund target

Somente:

```text
posted Expense
```

---

# 163. Partial Refund

Obrigatório suportar.

---

# 164. Multiple Refunds

Obrigatório suportar.

---

# 165. Refund overflow

Obrigatório bloquear.

---

# 166. Refund concurrency test

Exemplo:

```text
Expense 500

request A Refund 300
request B Refund 300
```

Resultado final deverá sempre respeitar:

```text
sum(posted Refunds) <= 500
```

---

# 167. Refund Account

Mesmo Book/currency.

---

# 168. Refund Book/Currency

Herdados da original.

---

# 169. Refund date

```text
>= original date
```

---

# 170. Refund-of-refund

Rejected.

---

# 171. Refund immutable

PATCH comum rejeitado.

---

# 172. Wrong Refund correction

```text
Void old Refund
↓
create correct Refund
```

---

# 173. Expense correction with Refund

Não permitir:

```text
new Expense amount
<
posted Refund total
```

---

# 174. Expense date correction with Refund

Não permitir data original posterior a Refund.

---

# 175. Void original with Refund

Rejeitar enquanto houver Refund `posted`.

---

# 176. Order to invalidate

```text
Void Refund(s)
↓
Void Expense
```

---

# 177. Refund Audit

No mínimo registrar de forma rastreável:

```text
new Refund Transaction

relationship to original Expense
```

---

# 178. M07 tests

```text
Correction success

Version conflict

Void

Void retry

Refund partial

Refund full

Multiple Refunds

Concurrent Refunds

Refund overflow

Refund wrong target

Refund date

Refund immutable

Void Refund

Void original with Refund

Correction below refunded amount

Correction date after Refund

Audit
```

---

# 179. M07 WhatsApp tests

```text
corrige último para 38,90

cancela último

estorna 200 da compra A83K2P
```

---

# 180. Void confirmation test

Sem resposta:

```text
0 Void
```

---

# 181. Refund confirmation test

Sem confirmação:

```text
0 Refund Transaction
```

---

# 182. Stale Confirmation test

Target version changed:

```text
0 destructive action
```

---

# 183. M07 Acceptance

```text
[ ] Correction works

[ ] optimistic locking works

[ ] Void works

[ ] Void is idempotent

[ ] WhatsApp Void always confirmed

[ ] Refund creates linked Income

[ ] generic Refund bypass blocked

[ ] partial Refund works

[ ] multiple Refund works

[ ] over-refund impossible

[ ] concurrent over-refund impossible

[ ] Refund Book/Currency inherited

[ ] Refund immutable except Void

[ ] Refund date invariant

[ ] original Void blocked with posted Refund

[ ] Expense correction respects Refunds

[ ] WhatsApp Refund always confirmed

[ ] Audit complete
```

---

# 184. GATE B — Financial Integrity

Objetivo:

```text
prove complete financial lifecycle
```

---

# 185. Gate B features required

```text
Create

Read

Correction

Void

Refund

Idempotency

Audit

Inbox retry
```

---

# 186. Gate B critical scenario

```text
Expense 500
↓
Refund 200
↓
Correction Expense 450
↓
valid

Correction Expense 100
↓
invalid

Void Expense
↓
invalid

Void Refund
↓
valid

Void Expense
↓
valid
```

---

# 187. Gate B duplicate scenario

Webhook/API retries não duplicam efeito financeiro.

---

# 188. Gate B PASS

Obrigatório antes de Operations/Production readiness.

---

# 189. M08 — Reports / Export / Operations

Objetivo:

```text
tornar dados consultáveis e operáveis
```

---

# 190. Summary

Implementar:

```text
ordinary_income

gross_expenses

refunds

net_expenses

net
```

---

# 191. Formula tests

```text
ordinary income
=
posted Income without refund relation
```

---

# 192. Gross Expenses

```text
posted Expenses
```

---

# 193. Refunds

```text
posted Income with refund_of_transaction_id
```

---

# 194. Net Expenses

```text
gross_expenses - refunds
```

---

# 195. Net

```text
ordinary_income - net_expenses
```

---

# 196. Transfers

Excluded.

---

# 197. Voided

Excluded.

---

# 198. Summary API

Direct API requires:

```text
book_id
```

---

# 199. Summary date default

Quando período não for especificado:

```text
current month
```

no timezone do Book.

---

# 200. WhatsApp Summary activation

Depois que o Summary do Finance Core/API estiver implementado, o pipeline WhatsApp já criado em M06 passará a suportar:

```text
resumo

resumo pessoal

resumo empresa
```

sem introduzir nova lógica financeira no n8n.

---

# 201. WhatsApp Summary flow

```text
WhatsApp
↓
Evolution
↓
n8n
↓
Inbox
↓
query_summary
↓
Finance Core
↓
Summary query
↓
structured reply
↓
WhatsApp
```

---

# 202. WhatsApp Summary E2E

Obrigatório em M08.

Exemplos:

```text
resumo

resumo empresa
```

---

# 203. WhatsApp Summary test

Deverá validar:

```text
default Book

explicit Book

ordinary Income

Refund separation

Transfer exclusion

Voided exclusion

current-month default
```

---

# 204. Last API

Direct API requires:

```text
book_id
```

---

# 205. CSV Export

Implementar por Book/período.

---

# 206. CSV injection

Test obrigatório.

---

# 207. Pagination

Default:

```text
50
```

Max:

```text
100
```

---

# 208. Operational endpoints

Validar:

```text
/health

/ready
```

---

# 209. Structured logging

Validar redaction.

---

# 210. Log tests

Secrets não aparecem.

---

# 211. M08 Acceptance

```text
[ ] Summary formulas correct

[ ] Refund separated from ordinary Income

[ ] Transfers excluded

[ ] Voided excluded

[ ] Book required in direct Summary

[ ] WhatsApp "resumo" works

[ ] WhatsApp "resumo empresa" works

[ ] Summary current-month default works

[ ] Book required in direct Last

[ ] CSV export works

[ ] CSV injection mitigated

[ ] pagination max 100

[ ] health works

[ ] readiness works

[ ] logs structured

[ ] secrets redacted
```

---

# 212. M09 — Backup / Restore

Objetivo:

```text
make Finance Hub recoverable
```

---

# 213. Production DB backup

```text
pg_dump finance_hub_prod
```

---

# 214. Backup scope

Somente Finance Hub application data:

```text
Finance DB

Finance storage
```

---

# 215. Não usar como rotina da aplicação

```text
pg_dumpall
```

do `postgres-products`.

---

# 216. Shared roles

Recriáveis por:

```text
versioned bootstrap scripts

external secrets
```

---

# 217. Official backup paths

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

# 218. Local retention

Aproximadamente:

```text
2–3 recent dumps
```

---

# 219. Off-site flow

```text
dump + storage
↓
Restic encrypted repository
↓
rclone
↓
Google Drive
```

---

# 220. Scheduler

Preferência:

```text
systemd timer
```

Cron aceitável.

---

# 221. n8n

Não é único scheduler de backup.

---

# 222. Frequency

```text
daily
```

---

# 223. RPO

```text
<= 24h
```

---

# 224. RTO

Target:

```text
same day
```

---

# 225. Retention

```text
14 daily

8 weekly

12 monthly
```

---

# 226. Repository check

```text
weekly
```

---

# 227. Restore test

Obrigatório antes de Real Data Ready.

---

# 228. Isolated database

Exemplo:

```text
finance_hub_restore_test
```

---

# 229. Restore validation

```text
DB restore

roles/bootstrap

Finance API connection

Books

Accounts

Transactions

Refund relations

Audit

Summary
```

---

# 230. Production untouched

Durante restore test.

---

# 231. Monthly restore

Depois do go-live:

```text
monthly isolated restore
```

---

# 232. Recovery secrets

Devem existir fora da VPS.

---

# 233. Plaintext Drive dump

Proibido como fluxo oficial.

---

# 234. Pre-migration backup

Obrigatório antes de mudança Production relevante.

---

# 235. M09 Acceptance

```text
[ ] custom-format pg_dump works

[ ] Finance storage handled

[ ] official backup paths used

[ ] local retention works

[ ] Restic encrypted repository works

[ ] rclone remote works

[ ] daily schedule works

[ ] 14/8/12 retention configured

[ ] weekly check configured

[ ] backup failures visible

[ ] recovery secrets outside VPS

[ ] restore runbook exists

[ ] isolated restore succeeds

[ ] Finance API validates restored DB

[ ] monthly restore procedure defined
```

---

# 236. GATE C — Real Data Ready

Gate C é o último gate antes da V0.1 real.

---

# 237. Gate C objective

Responder:

```text
Can this system safely store real personal financial data?
```

---

# 238. Gate C — Core

```text
Expense ✓

Income ✓

Transfer ✓

Correction ✓

Void ✓

Refund ✓
```

---

# 239. Gate C — Integrity

```text
Money precision ✓

Book isolation ✓

Currency ✓

Idempotency ✓

Audit ✓
```

---

# 240. Gate C — Ingestion

```text
AuthorizedSender ✓

raw persistence ordering ✓

Inbox retries ✓

Confirmation ✓

WhatsApp ✓
```

---

# 241. Gate C — Reporting

```text
Summary ✓

WhatsApp Summary ✓

CSV ✓
```

---

# 242. Gate C — Security

```text
finance:ingest limited ✓

finance:admin separated ✓

DB internal only ✓

Redis internal only ✓

secrets protected ✓

Codex bounded ✓
```

---

# 243. Gate C — Operations

```text
logs ✓

health ✓

readiness ✓
```

---

# 244. Gate C — Recovery

```text
daily backup ✓

off-site encryption ✓

retention ✓

restore runbook ✓

successful isolated restore ✓
```

---

# 245. Gate C blocker

Se restore não foi realmente executado:

```text
GATE C = FAIL
```

---

# 246. Gate C blocker

Se `finance:ingest` consegue executar operações administrativas:

```text
FAIL
```

---

# 247. Gate C blocker

Se sender não autorizado consegue gerar Finance Inbox contendo raw content:

```text
FAIL
```

---

# 248. Gate C blocker

Se webhook retry duplica Transaction:

```text
FAIL
```

---

# 249. Gate C blocker

Se Refund pode exceder original:

```text
FAIL
```

---

# 250. Gate C blocker

Se DB/Redis estão públicos:

```text
FAIL
```

---

# 251. Gate C PASS

Marca:

```text
REAL DATA READY
```

---

# 252. Release

Depois de Gate C:

```text
v0.1.0
```

---

# 253. V0.1 release scope

```text
Books

Accounts

Categories

Merchants

ClassificationRules

AuthorizedSender

Inbox

Interpretation

Confirmation

Expense

Income

Transfer

Correction

Void

Refund

Audit

Idempotency

WhatsApp

Summary

CSV

Security

Backup

Restore
```

---

# 254. V0.1 excluded

```text
Firefly

Metabase

custom dashboard

Products

Price Intelligence

Receipts

OCR

Vehicles

bank imports

reconciliation

installments

recurring transactions

FX

multi-user SaaS
```

---

# 255. Post-v0.1 — M10 Firefly Adapter

Somente depois do Core estável.

---

# 256. M10 architecture

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

# 257. Firefly rule

Finance Hub continua Source of Truth.

---

# 258. ExternalMappings

Podem entrar em M10 se integração real necessitar.

---

# 259. Firefly failure

Não reverte Finance Transaction commitada.

---

# 260. M11 — Cards / Installments / Recurrence

Inclui:

```text
advanced credit card lifecycle

installments

recurring rules
```

Suggested release:

```text
v0.2
```

---

# 261. M12 — Products / Consumption

Adicionar:

```text
Products

Brands

Variants

Packages

TransactionItems
```

---

# 262. M13 — Price Intelligence

Adicionar:

```text
PriceObservation

Promotion

price history

unit normalization
```

Suggested release:

```text
v0.3
```

---

# 263. M14 — Receipts / Fiscal

Adicionar:

```text
Attachments

Receipts

ReceiptItems

OCR

fiscal enrichment
```

Worker provavelmente necessário.

Suggested release:

```text
v0.4
```

---

# 264. M15 — Vehicles / Fuel

Adicionar:

```text
Vehicles

FuelEvents

km/l

cost/km
```

Suggested release:

```text
v0.5
```

---

# 265. M16 — Imports / Reconciliation

Adicionar:

```text
CSV

OFX

bank records

reconciliation
```

Main invariant:

```text
Import não duplica Transaction já registrada.
```

Suggested release:

```text
v0.6
```

---

# 266. M17 — Analytics / Metabase

Read-only analytics.

Suggested release:

```text
v0.7
```

---

# 267. M18 — Custom Dashboard

Interface própria via Finance API.

---

# 268. M19 — Natural Language Intelligence

Perguntas como:

```text
quanto gastei com marketing?

onde meus gastos cresceram?

quanto meu combustível subiu?
```

Sem SQL irrestrito direto ao LLM.

---

# 269. M20 — Alerts / Predictions

Futuro:

```text
anomaly detection

budget alerts

price alerts

spending forecasts
```

---

# 270. Unit Test Strategy

Testar regra isolada.

Prioridades:

```text
Money

classification precedence

date parsing

Transaction invariants

Refund invariants

Correction

Void

Confirmation interpretation
```

---

# 271. Integration Test Strategy

Utilizar PostgreSQL real/efêmero.

---

# 272. Não confiar somente em mock de DB

Constraints reais precisam ser exercitadas.

---

# 273. Integration priorities

```text
migrations

FKs

unique constraints

repository transactions

idempotency

Inbox retries

Confirmation uniqueness

Audit atomicity

Refund concurrency
```

---

# 274. Contract Tests

Validar:

```text
auth

scopes

strict schemas

error codes

money strings

Transaction types

statuses

Idempotency-Key

versioning

Refund representation
```

---

# 275. E2E Core Tests

```text
Direct API
↓
Finance Core
↓
PostgreSQL
```

---

# 276. E2E WhatsApp Tests

```text
WhatsApp
↓
Evolution
↓
n8n
↓
Finance API
↓
PostgreSQL
↓
reply
```

---

# 277. E2E progression

M06 testa:

```text
Expense

Income

Transfer

Last
```

M07 adiciona:

```text
Correction

Void

Refund
```

M08 adiciona:

```text
Summary
```

Essa progressão é canônica.

---

# 278. Backup/Restore Tests

Testes operacionais reais.

---

# 279. Security Tests

Separados de happy path.

---

# 280. Critical Scenario — Money

```text
0.10 + 0.20
```

não pode produzir erro de floating point.

---

# 281. Critical Scenario — Expense

```text
35 almoço nubank
```

gera exatamente um Expense `posted`.

---

# 282. Critical Scenario — Ordinary Income

```text
income
+
refund_of_transaction_id = null
```

---

# 283. Critical Scenario — Transfer

```text
source != destination
same Book
same Currency
```

---

# 284. Critical Scenario — Cross-Book

Rejected.

---

# 285. Critical Scenario — Inactive Account

Rejected for new Transaction.

---

# 286. Critical Scenario — Category cycle

Rejected.

---

# 287. Critical Scenario — Rule incompatible targets

Rejected.

---

# 288. Critical Scenario — Last

Uses:

```text
posted

created_at DESC

id DESC
```

---

# 289. Critical Scenario — Summary

Depois de M08:

```text
ordinary_income

gross_expenses

refunds

net_expenses

net
```

devem coincidir tanto na API direta quanto no comando WhatsApp `resumo`.

---

# 290. Critical Scenario — Refund

```text
Expense 500
Refund 200

gross expenses = 500
refunds = 200
net expenses = 300
```

---

# 291. Critical Scenario — Refund overflow

```text
Expense 500

Refund 300

Refund 300
```

segundo rejected.

---

# 292. Critical Scenario — concurrent Refund

Duas requests concorrentes nunca podem deixar total posted Refund > Expense.

---

# 293. Critical Scenario — Refund-of-refund

Rejected.

---

# 294. Critical Scenario — Refund Date

Refund anterior à Expense rejected.

---

# 295. Critical Scenario — Refund PATCH

Rejected.

---

# 296. Critical Scenario — Void Refund

Allowed.

---

# 297. Critical Scenario — Void original with Refund

Rejected until Refund is voided.

---

# 298. Critical Scenario — Correction after Refund

Cannot reduce original amount below posted Refund total.

---

# 299. Critical Scenario — Correction Date

Cannot move original date after posted Refund.

---

# 300. Critical Scenario — Void retry

Same Idempotency-Key returns same logical result.

---

# 301. Critical Scenario — Refund retry

Same behavior.

---

# 302. Critical Scenario — Generic create Refund bypass

Rejected.

---

# 303. Critical Scenario — Generic create adjustment

Rejected.

---

# 304. Critical Scenario — Transaction pending

Impossible.

---

# 305. Critical Scenario — Transaction active

Impossible.

---

# 306. Critical Scenario — Unauthorized sender

```text
0 financial effects

0 financial Inbox raw_text
```

---

# 307. Critical Scenario — Group

Ignored.

---

# 308. Critical Scenario — from_me

Ignored.

---

# 309. Critical Scenario — processed duplicate Inbox

No new financial effect.

---

# 310. Critical Scenario — failed Inbox retry

Same Inbox reused.

---

# 311. Critical Scenario — stale processing

Recoverable.

---

# 312. Critical Scenario — pending Confirmation

No Transaction exists yet.

---

# 313. Critical Scenario — superseded Confirmation

Old destructive action not executed.

---

# 314. Critical Scenario — expired Confirmation

No action.

---

# 315. Critical Scenario — stale Confirmation

No action.

---

# 316. Critical Scenario — ingest scope

n8n cannot use direct financial/admin endpoints.

---

# 317. Critical Scenario — mass assignment

Client cannot force:

```text
status

source

refund relation
```

---

# 318. Critical Scenario — CSV injection

Malicious text does not become spreadsheet formula unexpectedly.

---

# 319. Critical Scenario — AI prompt injection

Does not gain privileges.

---

# 320. Critical Scenario — PostgreSQL unavailable

Financial write fails safely.

---

# 321. Critical Scenario — Redis unavailable

Basic financial CRUD continues if feature does not require Redis.

---

# 322. Critical Scenario — Evolution unavailable

Finance API remains usable.

---

# 323. Critical Scenario — AI unavailable

Deterministic flows remain usable.

---

# 324. Critical Scenario — Firefly unavailable

Future integration failure does not invalidate Finance data.

---

# 325. Critical Scenario — Backup failure

Runtime remains available but failure visible.

---

# 326. Critical Scenario — Restore

Restored environment produces correct Summary.

---

# 327. Test Data Policy

Test data deverá ser sintético.

---

# 328. Production data in automated tests

Proibido.

---

# 329. Production destructive tests

Proibidos.

---

# 330. Fixture examples

```text
Books:
Pessoal
Empresa

Accounts:
Nubank Pessoal
Inter Pessoal
Inter Empresa

Categories:
Alimentação
Marketing > Tráfego Pago

Merchants:
Google Ads
Amazon
Shell
```

---

# 331. Refund fixture

```text
Expense:
500 Amazon

Refund:
200
linked to Expense
```

---

# 332. Test isolation

Cada integration test deve ser reproduzível.

---

# 333. Database reset

Somente contra:

```text
test database
```

---

# 334. CI database

Ephemeral preferred.

---

# 335. Performance baseline

Não otimizar prematuramente.

---

# 336. Performance tests

Poderão validar consultas com:

```text
10k

100k
```

Transactions sintéticas conforme necessidade.

---

# 337. Partitioning

Não implementar apenas por benchmark inicial.

---

# 338. Observability tests

Validar:

```text
request_id

correlation_id

error code

secret redaction
```

---

# 339. Migration tests

Toda migration nova deve ser testada sobre:

```text
fresh DB
```

---

# 340. Future migration tests

Também sobre versão anterior suportada.

---

# 341. Production migration checklist

```text
[ ] migration reviewed

[ ] backup completed

[ ] backup validated

[ ] rollback/recovery plan understood

[ ] Lab migration passed

[ ] Production change approved
```

---

# 342. Release checklist v0.1.0

```text
[ ] Documentation FROZEN

[ ] AGENTS.md exists

[ ] PROJECT_STATE.md exists

[ ] README exists

[ ] CHANGELOG exists

[ ] Gate 0 PASS

[ ] M01 PASS

[ ] M02 PASS

[ ] M03 PASS

[ ] M04 PASS

[ ] Gate A PASS

[ ] M05 PASS

[ ] M06 PASS

[ ] M07 PASS

[ ] Gate B PASS

[ ] M08 PASS

[ ] WhatsApp Summary E2E PASS

[ ] M09 PASS

[ ] Gate C PASS

[ ] isolated restore PASS
```

---

# 343. No hidden release blocker

Features futuras não poderão bloquear v0.1.

---

# 344. Example non-blockers

```text
no dashboard

no Firefly

no receipt OCR

no Price Intelligence

no vehicle analytics
```

---

# 345. Release quality over feature count

V0.1 deve ser:

```text
small

correct

safe

auditable

recoverable
```

---

# 346. Codex task strategy

Cada task futura deverá conter:

```text
milestone

goal

allowed paths

relevant docs

acceptance criteria

tests

explicit forbidden scope
```

---

# 347. Codex task size

Preferir tasks pequenas e verificáveis.

---

# 348. Exemplo

Em vez de:

```text
implemente M04
```

preferir:

```text
M04-T01 Money Value Object

M04-T02 Expense Use Case

M04-T03 Income Use Case

M04-T04 Transfer Use Case

M04-T05 Transaction Queries

M04-T06 Idempotency

M04-T07 Audit
```

---

# 349. Shared infra task

Nunca esconder dentro de feature task.

---

# 350. Example explicit task

```text
INFRA-T01
Provision postgres-products
```

se Gate 0 comprovar ausência.

---

# 351. Human approval tasks

Marcar claramente:

```text
REQUIRES APPROVAL
```

para operações sensíveis.

---

# 352. PROJECT_STATE

Depois de cada task concluída:

```text
update PROJECT_STATE.md
```

---

# 353. CHANGELOG

Mudanças relevantes/releases registradas.

---

# 354. ADR

Somente quando existe decisão arquitetônica real.

---

# 355. Não criar ADR para toda linha de código

Evitar burocracia excessiva.

---

# 356. Definition of Done de uma task

Quando aplicável:

```text
[ ] implementation

[ ] validation

[ ] unit tests

[ ] integration tests

[ ] migration

[ ] docs

[ ] acceptance

[ ] PROJECT_STATE updated
```

---

# 357. Stop-the-line conditions

Durante implementação, parar task normal se descobrir necessidade de:

```text
shared infra modification

destructive Production action

new unrestricted privilege

schema incompatible with frozen domain

financial invariant contradiction
```

---

# 358. Stop-the-line does not mean restart documentation

Avaliar primeiro contra blocker criteria.

---

# 359. If non-blocker

```text
backlog
```

---

# 360. If blocker

```text
ADR
+
specific canonical doc update
```

---

# 361. Não regenerar todos os docs automaticamente

Pós-Freeze:

```text
change only affected canonical docs
```

quando realmente necessário.

---

# 362. Consolidações desta v0.3.1

Esta versão mantém congelado:

```text
M01 local before Gate 0 allowed

Gate 0 before VPS changes

postgres-products existence verified, not assumed

explicit infra provisioning if absent

local ephemeral PostgreSQL allowed

expense | income | transfer

posted | voided

Refund = linked Income

single currency per Book

Inbox source_instance idempotency

failed/stale Inbox retry

15-minute Confirmation

finance:ingest vs finance:admin

Void/Refund Idempotency-Key

Refund concurrency protection

Finance-specific backups

Gate C requires real restore
```

e corrige especificamente a ordem:

```text
M06
=
WhatsApp integration for existing capabilities

M08
=
Summary implementation
+
WhatsApp Summary E2E
```

---

# 363. Milestone ownership final

```text
M06
Expense
Income
Transfer
Last
WhatsApp transport

M07
Correction
Void
Refund

M08
Summary
CSV
Operations
WhatsApp Summary
```

---

# 364. Condição para Freeze

Este documento somente poderá mudar de:

```text
FREEZE CANDIDATE
```

para:

```text
FROZEN — Baseline for Implementation
```

quando a checagem mecânica confirmar:

```text
M06 does NOT require Summary
```

e:

```text
M08 DOES require Summary + WhatsApp Summary E2E
```

---

# 365. Próximo passo depois desta versão

Não escrever código ainda.

Executar exclusivamente:

```text
CHECK 1
02-DOMAIN-MODEL.md
MerchantAlias mandatory V0.1?
→ must be NO

CHECK 2
09-ROADMAP-TESTS.md
Summary required in M06?
→ must be NO

CHECK 3
09-ROADMAP-TESTS.md
Summary + WhatsApp E2E in M08?
→ must be YES
```

---

# 366. Se os checks passarem

Resultado:

```text
10 / 10 canonical documents
PASS
```

e então:

```text
DOCUMENTATION FREEZE
```

---

# 367. Estado final esperado

Todos os documentos passam para:

```text
FROZEN — Baseline for Implementation
```

---

# 368. Depois do Freeze

Criar:

```text
AGENTS.md

PROJECT_STATE.md

README.md

CHANGELOG.md

initial ADRs
```

e então:

```text
Git
↓
M01
```

---

# 369. Regra final do roadmap

O Finance Intelligence Hub não deverá chegar a Production por quantidade de código produzido.

Chegará quando:

```text
financial correctness

authorization

idempotency

audit

backup

restore
```

estiverem comprovados.

---

# 370. Objetivo final

A sequência:

```text
documentation
↓
core
↓
database
↓
ingestion
↓
WhatsApp
↓
financial lifecycle
↓
reports
↓
operations
↓
backup
↓
restore
```

deverá produzir uma V0.1 pequena, mas suficientemente confiável para se tornar a base dos módulos futuros do Finance Intelligence Hub.