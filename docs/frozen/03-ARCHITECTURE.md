# 03-ARCHITECTURE.md

# Finance Intelligence Hub
## System Architecture

**Documento:** `03-ARCHITECTURE.md`  
**Versão:** 0.3  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub  

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`

---

# 1. Objetivo

Este documento define a arquitetura técnica do Finance Intelligence Hub.

Ele especifica:

```text
componentes

responsabilidades

dependências

runtime

persistência

networking

fluxos

integrações

observabilidade

deploy

segurança estrutural

crescimento futuro
```

O objetivo é permitir que o Domain Model seja implementado sem acoplar o Finance Hub às ferramentas externas utilizadas ao seu redor.

---

# 2. Princípio arquitetônico principal

O núcleo do sistema deverá continuar útil mesmo que todas as integrações opcionais estejam indisponíveis.

Arquitetura mínima:

```text
Finance API
    ↓
Finance Core
    ↓
PostgreSQL
```

Esse caminho representa o produto.

---

# 3. Source of Truth

O Source of Truth será:

```text
PostgreSQL
```

do Finance Hub.

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

# 4. Arquitetura de alto nível

```text
                       CLIENTS / INTERFACES
                 ┌──────────┼────────────┐
                 │          │            │
                 ▼          ▼            ▼
             WhatsApp   Future Web   Direct API
                 │
                 ▼
          Evolution API
                 │
                 ▼
                n8n
                 │
                 ▼
            Finance API
                 │
                 ▼
          ★ Finance Core ★
                 │
        ┌────────┼───────────┐
        │        │           │
        ▼        ▼           ▼
   PostgreSQL   Redis      Storage
        │
        ▼
      Outbox
        │
        ▼
 Worker when needed
        │
   ┌────┼──────────────┐
   ▼    ▼              ▼
Firefly AI        Future adapters
```

---

# 5. Modular Monolith

A V0.1 será implementada como:

```text
MODULAR MONOLITH
```

---

# 6. Motivo

Não há necessidade inicial de separar:

```text
account-service

transaction-service

merchant-service

audit-service

ingestion-service
```

em serviços independentes.

Isso adicionaria:

```text
network complexity

distributed transactions

deployment overhead

observability overhead

authentication overhead

failure modes
```

sem benefício proporcional.

---

# 7. Modular Monolith não significa código misturado

O código deverá possuir boundaries internos claros.

---

# 8. Estrutura conceitual

```text
Finance API
    │
    ▼
Application Layer
    │
    ├── Commands
    ├── Queries
    └── Use Cases
    │
    ▼
Domain Layer
    │
    ├── Finance
    ├── Ingestion
    ├── Audit
    └── System
    │
    ▼
Infrastructure Layer
    │
    ├── PostgreSQL
    ├── Redis
    ├── Storage
    └── Integrations
```

---

# 9. Finance API

Responsável por:

```text
HTTP

authentication

authorization context

schema validation

serialization

error mapping

request/correlation IDs
```

Não deverá conter regra financeira central.

---

# 10. Application Layer

Responsável por coordenar casos de uso.

Exemplos:

```text
CreateExpense

CreateIncome

CreateTransfer

CorrectTransaction

VoidTransaction

CreateRefund

ProcessInboxMessage

ResolveConfirmation

GetLastTransaction

GetSummary
```

---

# 11. Domain Layer

Responsável por invariantes permanentes.

Exemplos:

```text
Money > 0

Transaction type allowed

Transaction status allowed

Book isolation

Account validity

Transfer same Book

Transfer same Currency

Refund invariants

Void rules

Correction rules

master-data active rules
```

---

# 12. Infrastructure Layer

Responsável por detalhes técnicos.

Exemplos:

```text
PostgreSQL repositories

Redis client

filesystem/storage

Evolution adapter

Firefly adapter

AI adapter

backup scripts
```

---

# 13. Dependency direction

Domain não deverá depender de:

```text
PostgreSQL library

HTTP framework

Redis

Evolution

Firefly

AI SDK
```

---

# 14. Finance Core

Conceitualmente:

```text
Finance Core
=
Domain
+
Application Use Cases
```

---

# 15. Finance Core não depende de WhatsApp

Um Expense deverá poder ser criado via API direta sem Evolution ou n8n.

---

# 16. Finance Core não depende de AI

Comandos determinísticos básicos deverão continuar funcionando sem LLM.

---

# 17. Finance Core não depende de Firefly

Firefly offline não impede a persistência financeira.

---

# 18. Finance Core não depende de Metabase

Analytics externo não define o domínio.

---

# 19. Estrutura inicial do repositório

```text
finance-hub/
│
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── PROJECT_STATE.md
├── docker-compose.yml
├── .env.example
│
├── docs/
│   ├── 00-PROJECT-BLUEPRINT.md
│   ├── 01-MVP-REQUIREMENTS.md
│   ├── 02-DOMAIN-MODEL.md
│   ├── 03-ARCHITECTURE.md
│   ├── 04-DATABASE.md
│   ├── 05-API-CONTRACTS.md
│   ├── 06-WHATSAPP-FLOWS.md
│   ├── 07-SECURITY.md
│   ├── 08-BACKUP-RESTORE.md
│   ├── 09-ROADMAP-TESTS.md
│   ├── adr/
│   ├── reviews/
│   └── runbooks/
│
├── apps/
│   ├── api/
│   ├── worker/
│   └── web/
│
├── packages/
│   ├── core/
│   ├── database/
│   ├── contracts/
│   └── integrations/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── views/
│
├── scripts/
│   ├── bootstrap/
│   ├── backup/
│   └── deploy/
│
└── tests/
    └── fixtures/
```

---

# 20. `apps/web`

Pode existir como scaffold/reserva.

Dashboard própria não faz parte da V0.1.

---

# 21. `apps/worker`

Pode existir desde o bootstrap.

Não significa que haverá runtime Worker ativo desde M01.

---

# 22. Worker activation

Worker só será executado quando existir workload assíncrono real.

Exemplos:

```text
Firefly synchronization

OCR

receipt processing

large imports

notifications

background analysis
```

---

# 23. Worker não possui regras financeiras próprias

Worker invoca casos de uso do Core.

---

# 24. PostgreSQL alvo da VPS

Infraestrutura escolhida:

```text
/opt/apps/apps/databases/postgres-products
```

---

# 25. `postgres-products` não é presumido como existente

Gate 0 deverá descobrir seu estado real.

---

# 26. Gate 0 — decisão do PostgreSQL

Fluxo:

```text
Gate 0
  ↓
postgres-products exists?
  │
  ├── YES
  │    ↓
  │  validate
  │
  └── NO
       ↓
explicit shared-infrastructure task
       ↓
provision postgres-products
```

---

# 27. Provisionamento do `postgres-products`

Quando necessário, deverá seguir a estrutura oficial da VPS:

```text
/opt/apps/apps/databases/postgres-products
├── docker-compose.yml
├── .env
├── README.md
└── persistent data
```

com:

```text
apps-backend

no public port

persistent volume

strong credentials

initial backup
```

---

# 28. Mudança de infraestrutura compartilhada

Não fará parte de uma task normal de feature.

Exigirá:

```text
explicit human approval
+
bounded infrastructure task
```

---

# 29. Finance databases

Dentro do servidor PostgreSQL:

```text
finance_hub_lab

finance_hub_prod
```

---

# 30. Test database

Testes poderão utilizar:

```text
finance_hub_test
```

ou database/container efêmero equivalente.

---

# 31. Banco operacional de outras aplicações

É proibido utilizar:

```text
n8n-postgres

evolution-postgres
```

como banco do Finance Hub.

---

# 32. PostgreSQL próprio na VPS

Não criar inicialmente:

```text
finance-postgres
```

como container do Finance Hub.

---

# 33. Desenvolvimento local

Essa proibição não se aplica ao ambiente local/test.

---

# 34. PostgreSQL local

Poderá existir através de:

```text
Testcontainers

docker-compose.dev.yml

temporary container
```

---

# 35. Objetivo do ambiente local

Permitir:

```text
fresh clone

migrations

integration tests

local API development
```

sem depender da VPS.

---

# 36. Database roles

Modelo recomendado:

```text
finance_hub_app

finance_hub_migrations

finance_hub_readonly
```

---

# 37. Application role

Não será superuser.

---

# 38. Migration role

Poderá executar DDL controlado.

---

# 39. Read-only role

Futura para analytics/Metabase.

---

# 40. Database network

PostgreSQL deverá permanecer em rede interna.

Nunca na `proxy`.

---

# 41. Database public port

Proibido.

---

# 42. Redis

Finance Hub poderá utilizar:

```text
redis-main
```

---

# 43. Redis namespace

Obrigatório:

```text
finance-hub:
```

---

# 44. Redis use cases

```text
rate limiting

cache

temporary locks

queue support

ephemeral operational state
```

---

# 45. Redis não é Source of Truth

Nenhuma Transaction, Inbox final, Audit ou IdempotencyKey financeira dependerá exclusivamente de Redis.

---

# 46. Redis não é requisito universal

CRUD financeiro síncrono não deverá depender dele quando não necessário.

---

# 47. ConfirmationSession persistence

ConfirmationSession deverá ser persistida no PostgreSQL.

---

# 48. Motivo

Restart da aplicação não deverá apagar silenciosamente uma confirmação válida.

---

# 49. API Idempotency persistence

Também no PostgreSQL.

---

# 50. Idempotency não usa Redis como autoridade

Redis pode ajudar com locks, mas:

```text
canonical idempotency state
=
PostgreSQL
```

---

# 51. Transaction model arquitetônico

V0.1:

```text
type
├── expense
├── income
└── transfer

status
├── posted
└── voided
```

---

# 52. Refund architecture

Refund não é tipo separado.

Fluxo:

```text
Original Expense
      ↓
CreateRefund use case
      ↓
new Transaction
type = income
refund_of_transaction_id = original.id
```

---

# 53. Refund use case é explícito

Mesmo utilizando `income` fisicamente, Refund deverá possuir:

```text
dedicated application use case

dedicated API endpoint

dedicated validations

dedicated audit semantics
```

---

# 54. Refund não passa pelo generic transaction create

Evita clients criarem:

```text
income
+
arbitrary refund_of_transaction_id
```

sem validação.

---

# 55. Refund concurrency

CreateRefund deverá operar em transaction boundary adequada.

Estratégia possível:

```text
BEGIN

lock original Expense

validate original

calculate posted Refund total

validate requested Refund

insert Refund Income

insert Audit

COMMIT
```

---

# 56. Expense correction with Refund

Correction use case deverá consultar Refunds relacionados antes de permitir:

```text
amount change

transaction_date change
```

---

# 57. Void original with Refund

Void use case deverá rejeitar original Expense enquanto houver Refund posted.

---

# 58. Void Refund

É permitido através do mesmo Void use case, respeitando versioning/idempotency.

---

# 59. Transaction atomicity

Operação financeira deverá persistir de forma atômica seus componentes obrigatórios.

Exemplo:

```text
BEGIN

Transaction change

AuditEvent

IdempotencyKey completion when applicable

OutboxEvent when actually required

COMMIT
```

---

# 60. Outbox

Tabela poderá existir desde V0.1.

---

# 61. Outbox não é obrigatoriamente preenchida para toda Transaction

Somente quando existir:

```text
consumer

integration

domain event requirement
```

real.

---

# 62. Outbox flow futuro

```text
Finance Core
↓
PostgreSQL transaction
├── domain state
└── outbox event
↓
COMMIT
↓
Worker
↓
external integration
```

---

# 63. External failure

Não desfaz Transaction financeira já commitada.

---

# 64. Firefly future architecture

```text
Transaction
↓
OutboxEvent
↓
Worker
↓
Firefly Adapter
```

---

# 65. ExternalMapping

Só entra quando uma integração persistente realmente necessitar.

---

# 66. Inbox architecture

Fluxo V0.1:

```text
incoming request
↓
service authentication
↓
technical filtering
↓
sender normalization
↓
AuthorizedSender check
↓
persist InboxMessage
↓
interpret
↓
resolve defaults/rules
↓
validate
↓
Transaction / Query / Confirmation
↓
reply
```

---

# 67. Regra crítica de privacidade

Não persistir `raw_text` financeiro antes de verificar AuthorizedSender.

---

# 68. Technical filtering antes da Inbox

Antes da persistência normal:

```text
group?

from_me?

sender valid?

sender authorized?
```

---

# 69. Sender não autorizado

Fluxo:

```text
request
↓
auth ok
↓
sender unauthorized
↓
minimal security/operational log
↓
reject
```

Sem:

```text
Finance Inbox raw_text
```

---

# 70. Groups

Ignorados antes de entrar no pipeline financeiro.

---

# 71. `from_me`

Ignorado para prevenir loop.

---

# 72. Inbox identity

Chave lógica técnica:

```text
source
+
source_instance
+
source_message_id
```

---

# 73. `source_instance`

Exemplo:

```text
evolution-main/<instance>
```

---

# 74. Inbox lifecycle

```text
received

processing

needs_confirmation

processed

failed

ignored
```

---

# 75. Inbox processing metadata

Deverá permitir:

```text
attempt_count

processing_started_at

last_attempt_at

processed_at
```

---

# 76. Duplicate processed Inbox

Não executa novamente a operação financeira.

---

# 77. Failed Inbox retry

Reutiliza a mesma InboxMessage.

---

# 78. Stale processing

Inbox presa em `processing` após crash poderá ser recuperada após timeout operacional.

---

# 79. Exactly-once objetivo

Garantir:

```text
exactly-once logical financial effect
```

para retries técnicos.

---

# 80. Exactly-once reply não é requisito

Outbound delivery não terá garantia absoluta V0.1.

---

# 81. ConfirmationSession architecture

Persistida no PostgreSQL.

---

# 82. Uma pending por sender

Aplicação/DB deverá garantir no máximo uma:

```text
pending ConfirmationSession
```

por:

```text
channel + sender
```

---

# 83. Confirmation lifecycle

```text
pending

confirmed

cancelled

expired
```

---

# 84. Superseded

Representado como:

```text
status = cancelled

resolution_reason =
superseded_by_new_command
```

---

# 85. Confirmation TTL

Default:

```text
15 minutes
```

configurável.

---

# 86. Confirmation destructive action

Para Void/Refund:

```text
target_entity_id

target_version
```

devem ser persistidos.

---

# 87. Confirmation resolution tracking

Guardar:

```text
origin inbox_message_id

resolved_by_inbox_message_id
```

---

# 88. Full new command during pending confirmation

Fluxo:

```text
pending Confirmation
↓
new complete command
↓
cancel previous Confirmation
↓
mark superseded reason
↓
process new command
```

---

# 89. Short reply

```text
sim
não
1
2
```

é resolvido contra Confirmation ativa.

---

# 90. Confirmation original Inbox lifecycle

Ao concluir/cancelar/expirar a sessão, a Inbox original não poderá permanecer indefinidamente em `needs_confirmation`.

---

# 91. Classification pipeline

```text
explicit user data
↓
ClassificationRule
↓
known alias / deterministic mapping
↓
deterministic parser
↓
AI fallback
↓
Confirmation when needed
```

---

# 92. AI Adapter

AI será tratada como serviço externo não confiável para efeitos de autoridade.

---

# 93. AI output

Será:

```text
structured candidate
```

não comando executável.

---

# 94. AI validation

Fluxo:

```text
AI output
↓
schema validation
↓
Finance Core validation
↓
application use case
```

---

# 95. AI não recebe DB write capability

Proibido:

```text
LLM
↓
arbitrary SQL
```

---

# 96. Service authorization

V0.1 deverá separar contexts de credencial.

---

# 97. Ingest credential

Usada pelo n8n.

Scope conceitual:

```text
finance:ingest
```

---

# 98. Ingest access

Principalmente:

```text
POST /api/v1/inbox/messages
```

---

# 99. Admin credential

Usada para:

```text
direct API

configuration

admin resources
```

Scope conceitual:

```text
finance:admin
```

---

# 100. n8n não recebe Admin por padrão

O token de ingestão não poderá chamar:

```text
/admin/*

POST /transactions
```

---

# 101. Least privilege

Credenciais distintas reduzem impacto de comprometimento da integração.

---

# 102. Sender whitelist

É barreira adicional para canal WhatsApp.

Não é substituto de service authorization.

---

# 103. Comprometimento do n8n

É tratado como:

```text
integration trust boundary compromised
```

Mitigações:

```text
scope limitado

networking interno

audit

credential rotation
```

---

# 104. Direct API Idempotency

Financial POST actions deverão usar `Idempotency-Key`.

---

# 105. Endpoints

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

---

# 106. Idempotency transaction model

Fluxo conceitual:

```text
BEGIN

acquire/create IdempotencyKey
↓
validate request hash
↓
execute financial use case
↓
persist Audit
↓
mark IdempotencyKey completed
↓
COMMIT
```

---

# 107. Idempotency states

Somente:

```text
in_progress

completed
```

---

# 108. Failed transaction

Se antes do COMMIT:

```text
ROLLBACK
```

remove também o idempotency state iniciado naquela transaction.

---

# 109. No automatic expiration

V0.1 manterá IdempotencyKeys persistidas.

---

# 110. Same key/same request

Retorna mesmo resultado lógico.

---

# 111. Same key/different request

Retorna:

```text
409 IDEMPOTENCY_CONFLICT
```

---

# 112. PATCH concurrency

Utiliza:

```text
version
```

e optimistic locking.

---

# 113. Summary architecture

Consulta canônica ao PostgreSQL.

---

# 114. Summary por Book

V0.1 opera um Book por request/contexto.

---

# 115. Summary semantics

```text
ordinary_income

gross_expenses

refunds

net_expenses

net
```

---

# 116. Refund calculation

Refund é identificado por:

```text
type = income
AND
refund_of_transaction_id IS NOT NULL
```

---

# 117. Ordinary Income

```text
type = income
AND
refund_of_transaction_id IS NULL
```

---

# 118. Transfers

Excluídas da receita/despesa consolidada.

---

# 119. Voided Transactions

Excluídas dos cálculos normais.

---

# 120. Last Transaction architecture

Consulta:

```text
status = posted
```

ordenada por:

```text
created_at DESC
id DESC
```

---

# 121. Last não utiliza maior transaction_date

---

# 122. Direct API context

`book_id` explícito para:

```text
last

summary
```

V0.1.

---

# 123. WhatsApp context

Pode resolver Book via AuthorizedSender default.

---

# 124. Storage architecture

Arquivos persistentes serão armazenados fora do database.

---

# 125. V0.1 Storage

Pode existir vazio.

Não criar Receipt/OCR apenas por possuir diretório.

---

# 126. Future storage layout

```text
storage/
├── receipts/
├── attachments/
├── imports/
├── generated/
└── temp/
```

---

# 127. Large binary data

Não armazenar inicialmente como BLOB grande no PostgreSQL.

---

# 128. Google Drive

Somente destino off-site de backup.

---

# 129. Docker architecture

Na VPS, Compose do Finance Hub inicialmente poderá conter:

```text
finance-api
```

---

# 130. Worker no Compose

Pode ser definido futuramente ou através de profile.

Não precisa rodar desde M01.

---

# 131. PostgreSQL não entra no Compose Finance Hub da VPS

É infraestrutura compartilhada.

---

# 132. Redis não entra como novo container da stack

Usar `redis-main` se necessário.

---

# 133. External networks

Quando apropriado:

```text
apps-backend

proxy
```

serão declaradas como externas.

---

# 134. `apps-backend`

Preferida para tráfego interno entre:

```text
Finance API

PostgreSQL

Redis

n8n when validated
```

---

# 135. Não presumir n8n em `apps-backend`

Gate 0 deverá inspecionar.

---

# 136. Cenário interno preferido

Se adequado:

```text
n8n
↓
apps-backend
↓
finance-api
```

---

# 137. Cenário alternativo

Se a alteração da rede compartilhada não for apropriada:

```text
n8n
↓
authenticated route
↓
NPM / controlled exposure
↓
Finance API
```

---

# 138. Connectivity decision

Deverá virar ADR depois da inspeção real.

---

# 139. `proxy`

Finance API somente entra se precisar ser publicada via NPM.

---

# 140. PostgreSQL e Redis

Nunca entram na `proxy`.

---

# 141. Lab path

```text
/opt/apps/apps/lab/finance-hub
```

---

# 142. Production path

```text
/opt/apps/apps/personal/finance-hub
```

---

# 143. Environment isolation

Lab e Production terão:

```text
separate database

separate .env

separate storage

separate secrets
```

---

# 144. Production data no Lab

Não por padrão.

Preferir dados sintéticos.

---

# 145. Local environment

Pode operar sem VPS.

---

# 146. Gate 0 relation to M01

M01 local pode ocorrer antes do Gate 0.

---

# 147. Gate 0 bloqueia VPS changes

Antes de Gate 0 PASS:

```text
no Lab deployment

no real Finance DB

no shared infra provisioning

no network modifications

no operational Codex remote access
```

---

# 148. Gate 0 checks

```text
CPU

RAM

disk

Docker

containers

networks

ports

n8n connectivity

postgres-products existence

UFW

Fail2Ban

SSH

NPM

Portainer

backup state

Codex privileges
```

---

# 149. M02 dependency

Na VPS:

```text
Gate 0 PASS
+
postgres-products operational
```

são pré-requisitos.

---

# 150. Codex role

Codex será agente de implementação.

---

# 151. Codex não define arquitetura

Segue:

```text
AGENTS.md

PROJECT_STATE.md

canonical docs

accepted ADRs
```

---

# 152. Codex normal scope

```text
repository

/opt/apps/apps/lab/finance-hub
```

---

# 153. Shared infrastructure outside normal scope

```text
n8n

Evolution

redis-main

postgres-products infrastructure

NPM

Portainer

UFW

SSH

WordPress
```

---

# 154. Shared infra change

Somente através de task explícita e aprovada.

---

# 155. Filesystem permissions

Nunca usar globalmente:

```text
chmod -R

chown -R
```

sobre:

```text
/opt/apps

/opt/apps/apps
```

---

# 156. Permission troubleshooting

Diagnosticar:

```text
container UID/GID

mounted path

ownership

mode
```

antes de alterar permissões.

---

# 157. Docker access

Acesso ao Docker daemon deverá ser tratado como privilégio elevado.

---

# 158. Production access

Não concedido automaticamente ao agente.

---

# 159. Deployment flow

```text
Git
↓
tests
↓
build
↓
Lab
↓
acceptance
↓
release
↓
Production
```

---

# 160. Production deployment

Não será automático por padrão V0.1.

---

# 161. Migrations

Todas versionadas.

---

# 162. Startup migrations

Aplicação não deverá fazer mudanças destrutivas automáticas em Production durante boot.

---

# 163. Production migrations

Passo explícito/controlado.

---

# 164. Pre-migration backup

Obrigatório para migration Production relevante.

---

# 165. Backup architecture

```text
finance_hub_prod
↓
pg_dump
      \
       → local staging
Finance storage
      /
       ↓
Restic encrypted repository
       ↓
rclone
       ↓
Google Drive
```

---

# 166. Backup scope

Finance Hub backup inclui:

```text
Finance Hub database

Finance Hub storage
```

---

# 167. Backup não inclui automaticamente cluster inteiro

Não fazer como responsabilidade da aplicação:

```text
dump all postgres-products databases
```

---

# 168. Shared roles and grants

Devem ser recriáveis por:

```text
versioned bootstrap scripts
+
external secrets
```

---

# 169. Backup paths

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

# 170. Runtime independent of backup destination

Google Drive indisponível não derruba Finance API.

---

# 171. Observability

Finance API deverá produzir:

```text
structured logs

request_id

correlation_id

health

readiness
```

---

# 172. Health

Responde:

```text
process alive?
```

---

# 173. Readiness

Responde:

```text
critical runtime dependencies ready?
```

---

# 174. PostgreSQL readiness

Crítico.

---

# 175. Redis readiness

Somente se realmente indispensável ao runtime específico.

---

# 176. Firefly readiness

Não crítico.

---

# 177. Evolution readiness

Não crítico para Finance API.

---

# 178. Metabase readiness

Não crítico.

---

# 179. Logging secrets

Proibido registrar:

```text
Authorization

service tokens

database passwords

complete DATABASE_URL

Evolution secrets
```

---

# 180. Raw WhatsApp text

Evitar repetir em operational logs.

Seu local controlado é InboxMessage autorizada.

---

# 181. Correlation chain

Quando possível:

```text
incoming integration event
↓
InboxMessage
↓
Interpretation
↓
Transaction
↓
AuditEvent
```

compartilham correlation ID.

---

# 182. Graceful degradation — PostgreSQL

PostgreSQL indisponível:

```text
financial write unavailable
```

---

# 183. Graceful degradation — Redis

Se operação não depende dele:

```text
financial write may continue
```

---

# 184. Graceful degradation — Evolution

```text
WhatsApp unavailable
Finance API available
```

---

# 185. Graceful degradation — Firefly

```text
Finance Core available
sync delayed
```

---

# 186. Graceful degradation — AI

```text
deterministic flows available
ambiguous AI-dependent flow asks user/rejects
```

---

# 187. Future analytics

Metabase poderá utilizar read-only role.

---

# 188. Future dashboard

Usará Finance API.

---

# 189. Future Natural Language Analytics

Não dará SQL irrestrito ao LLM.

---

# 190. Controlled analytics

```text
question
↓
controlled query layer
↓
canonical data
↓
analysis
```

---

# 191. Future Products

Adicionar como domínio separado.

Não misturar em Transaction Core.

---

# 192. Future Price Intelligence

PriceObservation não altera saldo.

---

# 193. Future Receipts

Provavelmente justificará Worker.

---

# 194. Future Vehicles

Adiciona dados complementares sem substituir Transaction.

---

# 195. Future Reconciliation

Deverá evitar duplicação financeira.

---

# 196. Scalability target

A arquitetura deverá suportar confortavelmente volume pessoal de:

```text
10k

100k

centenas de milhares
```

de Transactions sem mudança arquitetônica fundamental.

---

# 197. Não utilizar inicialmente

```text
Kubernetes

Kafka

service mesh

full Event Sourcing

complex CQRS infrastructure

distributed transactions
```

---

# 198. Audit + Outbox != Event Sourcing

PostgreSQL tables continuam armazenando estado canônico atual.

---

# 199. Commands/Queries internos

Podem ser separados conceitualmente sem adotar infraestrutura CQRS complexa.

---

# 200. ADRs

Decisões técnicas ainda abertas serão registradas em:

```text
docs/adr/
```

---

# 201. ADRs iniciais prováveis

```text
application stack

ORM/query builder

migration framework

UUID runtime support

n8n connectivity

Codex operational access
```

---

# 202. UUID

Baseline/preferência:

```text
UUIDv7
```

---

# 203. UUID validation M01

M01 deverá verificar suporte real no runtime/biblioteca escolhida.

---

# 204. UUID fallback

Se suporte inadequado:

```text
UUIDv4
```

via ADR.

---

# 205. UUID não bloqueia stack saudável

Regra obrigatória.

---

# 206. Arquitetura mínima de sucesso

Com apenas:

```text
Finance API

Finance Core

PostgreSQL
```

deve ser possível:

```text
Expense

Income

Transfer

Correction

Void

Refund

Last

Summary

Audit
```

---

# 207. WhatsApp success

Depois:

```text
Evolution
+
n8n
```

adicionam apenas interface/orquestração.

---

# 208. Refund architecture success

Refund continua:

```text
Income Transaction
+
refund_of_transaction_id
```

sem exigir tipo próprio.

---

# 209. Ingestion success

Nenhuma Transaction `pending`.

Ambiguidade fica em:

```text
Inbox

Interpretation

Confirmation
```

---

# 210. Security success

n8n possui apenas ingest scope necessário.

---

# 211. Retry success

Webhook retry não duplica efeito financeiro.

Failed Inbox pode ser retomada corretamente.

---

# 212. Recoverability success

Perda da VPS deverá ser recuperável através de:

```text
Git

Finance DB backup

Finance storage backup

secrets/recovery material

documentation
```

---

# 213. V0.1 architecture Definition of Done

```text
[ ] Modular Monolith implemented

[ ] Finance Core independent from integrations

[ ] PostgreSQL Source of Truth

[ ] postgres-products state verified before VPS DB work

[ ] explicit provisioning path if postgres-products absent

[ ] local ephemeral PostgreSQL supported

[ ] Lab/Prod DB isolated

[ ] no Finance PostgreSQL public port

[ ] Redis optional and namespaced

[ ] Worker not forced prematurely

[ ] Transaction type only expense/income/transfer

[ ] status only posted/voided

[ ] Refund implemented as linked Income

[ ] Inbox authorization occurs before raw persistence

[ ] source_instance participates in inbox identity

[ ] failed Inbox retry supported

[ ] stale processing recoverable

[ ] Confirmation persisted

[ ] 15-minute default confirmation TTL

[ ] INGEST and ADMIN privilege contexts separated

[ ] persistent API idempotency

[ ] Outbox produced only when useful

[ ] health/readiness

[ ] structured logs

[ ] backup/restore architecture aligned
```

---

# 214. Principais mudanças definitivas desta v0.3

Esta versão consolida:

```text
postgres-products may not exist yet

Gate 0 discovers/provisions path

shared infra changes require explicit task

local ephemeral PostgreSQL allowed

Transaction type = expense | income | transfer

Transaction status = posted | voided

Refund = linked Income

no pending Transaction

authorization before Inbox raw persistence

source_instance in Inbox identity

failed/stale Inbox retry lifecycle

Confirmation resolution tracking

15-minute TTL

finance:ingest vs finance:admin

Outbox only when consumer/use exists

Finance-specific backup scope
```

---

# 215. Condição para Freeze

Este documento somente poderá mudar de:

```text
FREEZE CANDIDATE
```

para:

```text
FROZEN — Baseline for Implementation
```

quando a checagem mecânica contra:

```text
FINAL-FREEZE-DECISIONS.md
```

resultar em:

```text
PASS
```

---

# 216. Regra final

A arquitetura não será reaberta por preferência de framework ou melhoria opcional.

Somente blocker capaz de causar:

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

# 217. Objetivo final

A arquitetura deverá permitir começar com:

```text
WhatsApp
↓
Finance API
↓
Finance Core
↓
PostgreSQL
```

e crescer futuramente para:

```text
Products

Prices

Receipts

Vehicles

Reconciliation

Analytics

Dashboard

AI
```

sem trocar a fonte canônica de dados ou destruir a semântica financeira da V0.1.