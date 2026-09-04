# 00-PROJECT-BLUEPRINT.md

# Finance Intelligence Hub
## Project Blueprint

**Documento:** `00-PROJECT-BLUEPRINT.md`  
**Versão:** 0.3  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub  
**Tipo:** Aplicação pessoal self-hosted com arquitetura preparada para expansão futura  
**Ambiente inicial:** Lab  
**Path inicial:** `/opt/apps/apps/lab/finance-hub`  
**Path de produção planejado:** `/opt/apps/apps/personal/finance-hub`

---

# 1. Objetivo deste documento

Este documento define a visão estrutural do Finance Intelligence Hub.

Ele estabelece:

- propósito;
- princípios;
- escopo;
- limites;
- arquitetura principal;
- Source of Truth;
- domínios;
- responsabilidades dos componentes;
- estratégia de persistência;
- infraestrutura-alvo;
- roadmap conceitual;
- regras de independência;
- critérios para evolução.

Os documentos seguintes detalham requisitos, domínio, arquitetura, banco, API, WhatsApp, segurança, backup e roadmap.

Este arquivo responde:

> O que estamos construindo, por que estamos construindo dessa forma e quais decisões estruturais não poderão ser alteradas silenciosamente durante a implementação?

---

# 2. Autoridade deste documento

Este documento foi regenerado a partir de:

```text
FINAL-FREEZE-DECISIONS.md
```

Durante a checagem final:

```text
FINAL-FREEZE-DECISIONS.md
        ↓
00-PROJECT-BLUEPRINT.md
        ↓
MATCH?
```

Em caso de divergência durante esta fase:

```text
FINAL-FREEZE-DECISIONS.md
```

vence.

Após o Documentation Freeze, as decisões serão refletidas nos documentos canônicos congelados e em ADRs futuros quando necessário.

---

# 3. Visão do produto

O Finance Intelligence Hub será uma plataforma pessoal de inteligência financeira self-hosted capaz de consolidar progressivamente:

```text
finanças
consumo
preços
notas fiscais
dados tributários
veículos
histórico de compras
analytics
automação
IA
```

em uma base própria, auditável e recuperável.

A interface inicial principal será:

```text
WhatsApp
```

Mas WhatsApp não será o produto.

O produto será o conjunto:

```text
Finance Core
+
Canonical Domain Model
+
PostgreSQL
+
Audit
+
Migrations
+
Backups
```

---

# 4. Problema principal

Sistemas financeiros tradicionais frequentemente exigem:

```text
abrir aplicação
↓
navegar
↓
escolher conta
↓
escolher categoria
↓
preencher campos
↓
salvar
```

Esse atrito reduz a frequência e a qualidade dos registros.

A hipótese do Finance Intelligence Hub é:

```text
evento financeiro aconteceu
        ↓
mensagem curta
        ↓
interpretação estruturada
        ↓
validação
        ↓
persistência correta
        ↓
histórico confiável
```

Exemplo:

```text
35 almoço nubank
```

deverá ser suficiente para registrar uma despesa simples quando os campos críticos puderem ser resolvidos com segurança.

---

# 5. Objetivo de longo prazo

O sistema deverá evoluir de:

```text
registro financeiro pessoal
```

para:

```text
FINANCE INTELLIGENCE HUB

├── Finance
├── Consumption
├── Price Intelligence
├── Receipts / Fiscal
├── Vehicles
├── Reconciliation
├── Analytics
└── AI Assistance
```

sem reconstruir o núcleo financeiro.

---

# 6. Princípio arquitetônico principal

> Os dados pertencem ao Finance Intelligence Hub, e não às ferramentas utilizadas ao redor dele.

Portanto:

```text
PostgreSQL Finance Hub
=
Source of Truth
```

Enquanto:

```text
WhatsApp
Evolution
n8n
Redis
Firefly
Metabase
Google Drive
AI providers
dashboards
```

serão:

```text
interfaces
adapters
orchestrators
operational dependencies
consumers
integrations
```

---

# 7. Componentes substituíveis

A arquitetura deverá permitir:

```text
Evolution
→ outra gateway WhatsApp

n8n
→ outro orchestrator

Firefly
→ outra interface financeira

Metabase
→ outro BI

AI provider A
→ AI provider B

Google Drive
→ outro destino de backup

Dashboard A
→ Dashboard B
```

sem alterar o modelo financeiro canônico.

---

# 8. Componentes permanentes

Mesmo se integrações forem substituídas, deverão permanecer recuperáveis:

```text
Finance Core

Canonical Domain Model

PostgreSQL data

Migrations

Audit history

Persistent files

Exports

Backup history

Tests

Git history
```

---

# 9. Source of Truth

O Source of Truth será:

```text
PostgreSQL
```

do Finance Hub.

Não serão Source of Truth:

```text
Firefly database
n8n database
Evolution database
Redis
WhatsApp chat history
Metabase
Google Drive
```

---

# 10. PostgreSQL escolhido para a VPS

A infraestrutura escolhida para Lab e Production será:

```text
/opt/apps/apps/databases/postgres-products
```

com databases separados:

```text
finance_hub_lab
finance_hub_prod
```

---

# 11. `postgres-products` não será presumido como existente

A documentação não deverá afirmar que:

```text
postgres-products
```

já está operacional.

Durante Gate 0 será verificado:

```text
postgres-products existe?
```

---

# 12. Cenário A — `postgres-products` já existe

Se estiver operacional:

```text
postgres-products
      │
      ├── finance_hub_lab
      └── finance_hub_prod
```

será utilizado.

---

# 13. Cenário B — `postgres-products` ainda não existe

Antes do M02 na VPS deverá ocorrer tarefa explícita de infraestrutura:

```text
PROVISION postgres-products
```

em:

```text
/opt/apps/apps/databases/postgres-products
```

obedecendo:

```text
Docker Compose

.env próprio

README

volume persistente

apps-backend

sem porta pública

backup inicial
```

---

# 14. Provisionamento de infraestrutura compartilhada

Não será uma alteração casual do agente de implementação.

Exigirá:

```text
aprovação explícita
+
task delimitada de infraestrutura
```

Depois disso, o agente retorna ao escopo normal do Finance Hub.

---

# 15. PostgreSQL dedicado do Finance Hub

Na VPS não será criado inicialmente:

```text
finance-postgres
```

como container próprio da aplicação.

---

# 16. Migração futura para PostgreSQL dedicado

Poderá ocorrer se existirem razões reais de:

```text
isolamento

performance

criticidade

backup independente

segurança

crescimento
```

Fluxo conceitual:

```text
finance_hub_prod
↓
pg_dump
↓
PostgreSQL dedicado
```

sem alterar o Domain Model.

---

# 17. Desenvolvimento local

A regra de não criar `finance-postgres` próprio se aplica à arquitetura da VPS.

Desenvolvimento e testes locais poderão utilizar:

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

# 18. Arquitetura principal

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

# 19. Arquitetura expandida

```text
                         INTERFACES
                  ┌─────────┼─────────┐
                  │         │         │
              WhatsApp   Future Web  Direct API
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
          ┌───────┼──────────────┐
          │       │              │
          ▼       ▼              ▼
     PostgreSQL  Redis         Storage
          │
          ▼
        Outbox
          │
          ▼
   Worker when needed
          │
      ┌───┼────────────┐
      ▼   ▼            ▼
   Firefly AI       Future adapters
```

---

# 20. Modular Monolith

O Finance Hub começará como:

```text
MODULAR MONOLITH
```

Não como conjunto distribuído de microservices.

---

# 21. Motivo

Microservices iniciais criariam complexidade em:

```text
networking

deployment

authentication

observability

consistency

debug

testing

distributed transactions
```

sem benefício proporcional para um sistema pessoal.

---

# 22. Finance API

Será a interface canônica de software para:

```text
direct clients

n8n

future dashboard

future integrations
```

Clientes não acessarão PostgreSQL diretamente.

---

# 23. Finance Core

O Finance Core será responsável pelas regras permanentes do domínio.

Exemplos:

```text
Create Expense

Create Income

Create Transfer

Correction

Void

Refund

Money validation

Book isolation

Account validation

Idempotency coordination

Audit rules
```

---

# 24. n8n

n8n será:

```text
workflow engine
orchestrator
connector
```

e não:

```text
Finance Core
```

---

# 25. Evolution API

Evolution será:

```text
WhatsApp gateway
```

Responsável por:

```text
connection

receive

send

webhooks

technical message metadata
```

Não por regras financeiras.

---

# 26. Firefly III

Firefly será integração opcional futura.

Arquitetura:

```text
Finance Hub
↓
Outbox
↓
Worker
↓
Firefly Adapter
```

Firefly não será Source of Truth.

---

# 27. Firefly não é requisito V0.1

A V0.1 deverá ser considerada completa sem Firefly.

---

# 28. Metabase

Poderá ser utilizado futuramente para:

```text
analytics
dashboards
BI
```

com acesso:

```text
read-only
```

ao Finance Hub.

---

# 29. Dashboard própria

Fica fora da V0.1.

Quando existir:

```text
Browser
↓
Finance Web
↓
Finance API
↓
Finance Core
↓
PostgreSQL
```

Nunca:

```text
Browser
↓
PostgreSQL
```

---

# 30. Redis

Finance Hub poderá utilizar:

```text
redis-main
```

com namespace:

```text
finance-hub:
```

---

# 31. Redis não será Source of Truth

Redis poderá armazenar:

```text
cache

rate limit

locks

temporary state

queues
```

Mas nenhuma Transaction poderá existir somente nele.

---

# 32. Redis não é requisito de CRUD financeiro básico

Se um caso de uso síncrono não precisar de Redis:

```text
POST transaction
```

deverá poder funcionar sem ele.

---

# 33. Worker

O repositório poderá possuir:

```text
apps/worker/
```

desde o início.

Isso não significa que um Worker container deverá ser executado desde M01.

---

# 34. Worker será ativado quando houver trabalho assíncrono real

Exemplos:

```text
Firefly sync

OCR

receipt processing

large import

background analysis

notifications
```

---

# 35. Outbox

A V0.1 poderá possuir:

```text
outbox_events
```

como estrutura preparada para integrações confiáveis.

---

# 36. Outbox não deverá produzir eventos inúteis

A presença da tabela não significa que toda Transaction gerará obrigatoriamente OutboxEvent.

Regra:

> Só produzir OutboxEvent quando existir consumidor ou evento configurado que realmente precise ser processado.

---

# 37. Outbox semantics

Outbox garante:

```text
event persisted reliably
```

Não garante:

```text
external exactly-once delivery
```

Consumers deverão ser idempotentes.

---

# 38. Storage

Arquivos permanentes ficarão fora do PostgreSQL.

Estrutura futura:

```text
storage/
├── receipts/
├── attachments/
├── imports/
└── generated/
```

PostgreSQL armazenará metadata e referências quando módulos correspondentes existirem.

---

# 39. V0.1 não exige arquivos financeiros

O storage poderá existir vazio no início.

Receipt pipeline não será implementado antecipadamente.

---

# 40. Google Drive

Será:

```text
off-site backup target
```

Não:

```text
runtime storage
```

---

# 41. Domínio Finance

O núcleo financeiro será baseado em:

```text
Book

Account

Category

Merchant

Transaction

Audit
```

e conceitos auxiliares.

---

# 42. Book

`Book` representa contexto financeiro configurável.

Exemplos iniciais sugeridos:

```text
Pessoal

Empresa
```

São dados.

Não enums.

---

# 43. Production bootstrap

`Pessoal` e `Empresa` não deverão ser criados como parte rígida das migrations.

Poderão ser criados por:

```text
setup/bootstrap administrativo explícito
```

---

# 44. Lab seeds

Lab poderá possuir:

```text
Pessoal
Empresa
Accounts fake
Categories fake
Merchants fake
Sender fake
ClassificationRules fake
```

para testes.

---

# 45. Account

Account representa local financeiro.

Exemplos:

```text
Nubank
Inter
Dinheiro
Cartão Nubank
```

---

# 46. Tipos de Account V0.1

```text
checking
savings
cash
credit_card
other
```

---

# 47. Account pertence a Book

Toda Account pertence a exatamente um Book.

---

# 48. Category

Representa classificação financeira.

Exemplo:

```text
Marketing
└── Tráfego Pago
```

---

# 49. Category pertence a Book

Na V0.1 toda Category pertence a exatamente um Book.

---

# 50. Merchant

Representa contraparte econômica/comercial.

Exemplos:

```text
Amazon
Shell
Assaí
Google Ads
Hostinger
```

Merchant será global ao usuário, não obrigatoriamente vinculado a Book.

---

# 51. ClassificationRule

A V0.1 possuirá regras persistentes mínimas para classificação.

Exemplo:

```text
contains "google ads"
↓
Merchant Google Ads
Category Marketing > Tráfego Pago
```

---

# 52. Motivo da ClassificationRule

Evitar:

```text
hardcode no código

regras permanentes no n8n

dependência obrigatória de IA
```

---

# 53. Precedência de interpretação/classificação

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

# 54. Transaction — modelo final V0.1

A V0.1 possuirá apenas:

```text
expense
income
transfer
```

como `Transaction.type`.

---

# 55. Tipos removidos da V0.1

Não existirão:

```text
refund
adjustment
```

como `Transaction.type`.

---

# 56. Transaction lifecycle final

A V0.1 possuirá somente:

```text
posted
voided
```

como `Transaction.status`.

---

# 57. `pending` não é estado financeiro V0.1

Uma mensagem ambígua não cria Transaction.

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

# 58. `active` não será utilizado

O estado válido financeiramente será:

```text
posted
```

---

# 59. Expense

Representa saída financeira.

Exemplo:

```text
35 almoço nubank
```

gera:

```text
type = expense
status = posted
```

---

# 60. Income

Representa entrada financeira comum.

Exemplo:

```text
recebi 2500 cliente empresa inter
```

gera:

```text
type = income
status = posted
refund_of_transaction_id = null
```

---

# 61. Transfer

Representa movimentação entre Accounts.

Não aumenta:

```text
ordinary income
expense
```

consolidado.

---

# 62. Transfer V0.1

Só poderá ocorrer entre Accounts:

```text
do mesmo Book
+
da mesma Currency
```

---

# 63. Cross-Book Transfer

Fica fora da V0.1.

Não deverá ser transformada silenciosamente em Expense/Income.

---

# 64. Refund — representação final

Refund será uma Transaction compensatória:

```text
type = income
status = posted
refund_of_transaction_id = original_expense_id
```

---

# 65. Refund é semanticamente distinto de receita comum

Apesar de fisicamente utilizar:

```text
type = income
```

a presença de:

```text
refund_of_transaction_id
```

determina que ele é um Refund.

---

# 66. Refund reporting

Exemplo:

```text
Expense:
500

Refund:
200
```

Relatório:

```text
ordinary income = 0

gross expenses = 500

refunds = 200

net expenses = 300
```

---

# 67. Refund target V0.1

Refund só poderá apontar para:

```text
posted expense
```

---

# 68. Refund-of-refund

Proibido.

---

# 69. Partial Refund

Permitido.

---

# 70. Multiple Refunds

Permitidos, desde que:

```text
sum(posted refunds)
<=
original expense amount
```

---

# 71. Refund Book

Herda:

```text
book_id
```

da Expense original.

---

# 72. Refund Currency

Herda:

```text
currency
```

da Expense original.

---

# 73. Refund Account

Representa a Account onde o dinheiro foi efetivamente devolvido.

Quando seguro, poderá usar a Account original.

Quando ambíguo:

```text
ConfirmationSession
```

---

# 74. Refund Date

Obrigatório:

```text
refund.transaction_date
>=
original.transaction_date
```

---

# 75. Refund correction

Refund será imutável na V0.1, exceto Void.

Se incorreto:

```text
Void Refund
↓
create correct Refund
```

---

# 76. Void original com Refund posted

Proibido.

Fluxo correto:

```text
Void Refund(s)
↓
Void original Expense
```

---

# 77. Correction de Expense com Refund

Obrigatório manter:

```text
new_expense_amount
>=
sum(posted refunds)
```

---

# 78. Correction de data com Refund

A data da Expense original não poderá ficar posterior a nenhum Refund existente.

---

# 79. Void

Void transforma:

```text
posted
↓
voided
```

sem remover o registro.

---

# 80. Void != Delete

Hard delete não será operação financeira normal.

---

# 81. Correction

Correções alteram dados permitidos e incrementam:

```text
version
```

com geração de AuditEvent.

---

# 82. Campos imutáveis de Transaction

Depois da criação:

```text
id
human_ref
book_id
type
source
refund_of_transaction_id
created_at
```

não poderão ser alterados por PATCH comum.

---

# 83. Status não é campo de PATCH

Mudança de status ocorre através de:

```text
Void
```

---

# 84. Money

Valores monetários serão armazenados como:

```text
NUMERIC(18,2)
```

---

# 85. Floats proibidos para dinheiro

Não utilizar:

```text
FLOAT
REAL
DOUBLE PRECISION
```

como representação financeira principal.

---

# 86. Valores armazenados positivos

Exemplo:

```text
expense
amount = 35.00
```

A semântica vem de `type`, não do sinal.

---

# 87. Money na API

Utilizar string decimal:

```json
{
  "amount": "35.00"
}
```

---

# 88. Currency V0.1

Cada Book possui uma moeda.

Obrigatório:

```text
Book.currency
=
Account.currency
=
Transaction.currency
```

---

# 89. FX

Não faz parte da V0.1.

---

# 90. Multi-currency

Futuro.

---

# 91. Book.currency

Depois que existirem Accounts/Transactions relevantes:

```text
Book.currency
```

não poderá ser alterada por PATCH normal.

---

# 92. Account.currency

Depois de utilizada:

```text
Account.currency
```

torna-se imutável por PATCH normal.

---

# 93. Account.type

Depois da primeira Transaction:

```text
Account.type
```

não poderá ser alterado por PATCH normal.

---

# 94. Master data archive

Book, Account, Category e Merchant poderão ser arquivados/inativados.

Histórico permanece.

---

# 95. Master data inativa

Não poderá participar de nova Transaction.

---

# 96. Active/archive consistency

Se ambos os campos forem utilizados:

```text
active = true
→ archived_at IS NULL

active = false
→ archived_at IS NOT NULL
```

---

# 97. AuthorizedSender

Representa sender permitido em determinado canal.

---

# 98. Default Book

Poderá possuir:

```text
default_book_id
```

---

# 99. Default Account

Poderá possuir:

```text
default_account_id
```

---

# 100. Default Account exige Default Book

Não será permitido:

```text
default_account_id != null
default_book_id = null
```

---

# 101. Default consistency

Obrigatório:

```text
default_account.book_id
=
default_book_id
```

---

# 102. Default precisa estar ativo

Book/Account inativos não poderão funcionar como default.

---

# 103. Archive de default

Bloquear archive até atualizar/remover a referência do AuthorizedSender.

---

# 104. Category hierarchy

Category pai deve pertencer ao mesmo Book.

---

# 105. Category self-parent

Proibido.

---

# 106. Category cycles

Finance Core deverá impedir ciclos como:

```text
A → B → C → A
```

---

# 107. ClassificationRule válida

Toda regra precisa possuir pelo menos um target real:

```text
Book
Account
Category
Merchant
```

---

# 108. ClassificationRule compatibility

Targets associados a Book precisam ser compatíveis entre si.

---

# 109. ClassificationRule com entidade inativa

Não deverá ser aplicada.

---

# 110. Ingestion

Mensagens externas relevantes serão processadas através de:

```text
InboxMessage
```

---

# 111. Autorização antes de persistir raw_text

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

# 112. Groups

Ignorados antes do pipeline financeiro normal.

---

# 113. `from_me`

Ignorado para prevenir bot loop.

---

# 114. Finance Hub não arquiva conversas WhatsApp

Somente conteúdo relevante de sender autorizado entra no Inbox financeiro.

---

# 115. Inbox identity

A unicidade técnica será baseada em:

```text
source
+
source_instance
+
source_message_id
```

---

# 116. Exemplo

```text
source = whatsapp

source_instance = evolution-main/<instance>

source_message_id = ...
```

---

# 117. Inbox lifecycle

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

# 118. Inbox retry metadata

Deverá permitir:

```text
attempt_count

processing_started_at

last_attempt_at

processed_at
```

conforme necessário.

---

# 119. Processed Inbox

Nunca executa novamente o mesmo efeito financeiro.

---

# 120. Failed Inbox

Pode ser reprocessada usando:

```text
a mesma InboxMessage
```

Não uma nova.

---

# 121. Stale processing

Processamento abandonado por crash deverá poder ser recuperado e reprocessado após timeout operacional.

---

# 122. Idempotência de Inbox

Objetivo:

```text
exactly-once logical financial effect
```

sob retries técnicos.

---

# 123. Exactly-once WhatsApp reply

Não será prometido.

Outbound delivery será tratado como mecanismo operacional separado.

---

# 124. ConfirmationSession

Obrigatória na V0.1.

---

# 125. One pending confirmation

Preferir:

```text
1 pending ConfirmationSession
por channel + sender
```

---

# 126. Confirmation status

```text
pending

confirmed

cancelled

expired
```

---

# 127. Superseded

Não será status próprio.

Será:

```text
status = cancelled

resolution_reason =
superseded_by_new_command
```

---

# 128. Confirmation TTL

Default:

```text
15 minutes
```

configurável.

---

# 129. Confirmation target

Para ações sobre Transaction:

```text
target_entity_id
target_version
```

serão preservados.

---

# 130. Confirmation origin/resolution

Guardar:

```text
inbox_message_id
```

da mensagem que iniciou a sessão e:

```text
resolved_by_inbox_message_id
```

da mensagem que a resolveu.

---

# 131. Short contextual replies

Com sessão pendente:

```text
sim
não
1
2
```

são interpretados como resposta à ConfirmationSession.

---

# 132. Novo comando completo

Se existir Confirmation pendente e o usuário enviar:

```text
25 café nubank
```

a sessão antiga será:

```text
cancelled
resolution_reason = superseded_by_new_command
```

e o novo comando será processado.

---

# 133. Finalização de Confirmation

Após:

```text
confirmed
cancelled
expired
```

a Inbox original em `needs_confirmation` deverá atingir estado terminal apropriado.

---

# 134. API idempotency

Operações financeiras de criação/ação deverão usar persistência no PostgreSQL.

Redis não será autoridade de idempotência.

---

# 135. Idempotency-Key obrigatório

Na V0.1:

```text
POST /transactions

POST /transactions/{id}/void

POST /transactions/{id}/refunds
```

---

# 136. Idempotency states

Somente:

```text
in_progress
completed
```

---

# 137. Idempotency failure

Se a DB transaction falhar antes do COMMIT:

```text
idempotency row
+
financial changes
```

sofrem rollback juntos.

---

# 138. Idempotency expiration

V0.1:

```text
não expirar automaticamente
```

---

# 139. Same key + same request

Retorna mesmo resultado lógico.

---

# 140. Same key + different request

Retorna:

```text
409 IDEMPOTENCY_CONFLICT
```

---

# 141. PATCH

Usa:

```text
version
```

para optimistic locking.

Não exige Idempotency-Key como requisito padrão V0.1.

---

# 142. Service credentials

Não utilizar uma única credencial universal.

---

# 143. INGEST credential

n8n terá scope equivalente a:

```text
finance:ingest
```

para o pipeline Inbox.

---

# 144. ADMIN credential

Operações administrativas/direct API usam credencial separada, por exemplo:

```text
finance:admin
```

---

# 145. n8n não terá acesso administrativo por padrão

Não deverá possuir acesso normal a:

```text
/admin/*

POST /transactions
```

---

# 146. Sender whitelist não protege sozinho contra n8n comprometido

Se n8n for comprometido:

```text
integration trust boundary compromised
```

As mitigações serão:

```text
limited token scope

internal network

audit

least privilege
```

---

# 147. Parser

Casos básicos devem funcionar sem IA.

---

# 148. AI

Será fallback opcional.

Fluxo:

```text
text
↓
structured AI suggestion
↓
schema validation
↓
Finance Core
```

---

# 149. AI não executa SQL

Nem possui autorização própria para alterar dados.

---

# 150. Transaction Date

Representa evento financeiro ocorrido.

Para V0.1:

```text
transaction_date
<=
today in Book timezone
```

---

# 151. Datas futuras

Pertencem futuramente a:

```text
planned transactions
scheduling
recurrence
```

Não a Transaction posted V0.1.

---

# 152. Timezone inicial

```text
America/Sao_Paulo
```

---

# 153. Last Transaction

“Último” significa:

```text
posted Transaction
mais recentemente criada
```

dentro do Book aplicável.

Ordenação:

```text
created_at DESC
+
id DESC
```

como desempate determinístico.

---

# 154. Last não usa `transaction_date`

Uma Transaction retroativa criada agora poderá ser a última Transaction criada.

---

# 155. Direct API Last

Na V0.1 exigirá:

```text
book_id
```

---

# 156. WhatsApp Last

Pode utilizar:

```text
AuthorizedSender.default_book_id
```

---

# 157. Direct API Summary

Também exigirá:

```text
book_id
```

---

# 158. WhatsApp Summary

Pode utilizar default Book.

---

# 159. Summary V0.1

Deverá separar:

```text
ordinary income

gross expenses

refunds

net expenses

net
```

---

# 160. Transfer no Summary

Não entra em Income/Expense.

---

# 161. Voided Transaction no Summary

Não entra.

---

# 162. Refund no Summary

Reduz despesa líquida.

Não aumenta ordinary income.

---

# 163. Audit

Alterações relevantes gerarão:

```text
AuditEvent
```

---

# 164. Eventos mínimos

```text
TRANSACTION_CREATED

TRANSACTION_UPDATED

TRANSACTION_VOIDED

TRANSACTION_REFUND_CREATED
```

e eventos adicionais quando necessários.

---

# 165. Audit != Log

Audit registra história de domínio.

Logs servem operações/debug.

---

# 166. API Base

```text
/api/v1
```

---

# 167. Generic Transaction create

Permitirá apenas:

```text
expense
income
transfer
```

---

# 168. Refund endpoint específico

```text
POST /transactions/{id}/refunds
```

---

# 169. Void endpoint específico

```text
POST /transactions/{id}/void
```

---

# 170. DELETE Transaction

Não existe.

---

# 171. Pagination

Default:

```text
page_size = 50
```

Teto V0.1:

```text
100
```

---

# 172. WhatsApp UX

Objetivo:

```text
ação financeira comum
↓
1 mensagem
```

na maior parte dos casos.

---

# 173. Void WhatsApp

Sempre:

```text
command
+
confirmation
```

---

# 174. Refund WhatsApp

Sempre:

```text
command
+
confirmation
```

---

# 175. Correction WhatsApp

Quando target e alteração forem inequívocos, pode executar sem confirmação adicional.

---

# 176. One command per message

V0.1 processará:

```text
1 financial command
por mensagem
```

---

# 177. Edited WhatsApp messages

Não alteram Transaction automaticamente.

---

# 178. Deleted WhatsApp messages

Não executam Void.

---

# 179. Segurança de master data

Entidade inativa permanece disponível para histórico, mas não poderá ser utilizada em nova Transaction.

---

# 180. VPS Lab

Path:

```text
/opt/apps/apps/lab/finance-hub
```

---

# 181. VPS Production

Path:

```text
/opt/apps/apps/personal/finance-hub
```

---

# 182. Lab e Production

Devem possuir:

```text
database separado

.env separado

storage separado

secrets separados
```

---

# 183. Docker networks

Preferência para comunicação interna:

```text
apps-backend
```

quando Gate 0 confirmar conectividade adequada.

---

# 184. `proxy`

Somente serviços HTTP que precisem de publicação via NPM deverão entrar.

---

# 185. n8n network

Não presumir sua conexão com `apps-backend`.

Gate 0 inspeciona e decisão é registrada.

---

# 186. Banco e Redis

Nunca expostos publicamente.

---

# 187. Secrets

Cada ambiente terá:

```text
.env
```

não versionado.

Git conterá somente:

```text
.env.example
```

---

# 188. Filesystem safety

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

# 189. Permissions

Somente paths específicos do Finance Hub, conhecendo UID/GID correto.

---

# 190. Codex

Será agente de implementação.

Não autoridade arquitetônica.

---

# 191. Codex lê antes de trabalhar

```text
AGENTS.md

PROJECT_STATE.md

relevant canonical docs
```

---

# 192. Codex escopo normal

```text
repository
+
Finance Hub Lab
```

---

# 193. Serviços compartilhados fora do escopo normal

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

# 194. Shared infrastructure exception

Mudanças somente através de:

```text
explicitly approved infrastructure task
```

---

# 195. Gate 0

Gate 0 não bloqueia:

```text
M01 local

Git

docs

ADRs

local tests
```

---

# 196. Gate 0 bloqueia

Antes dele não executar:

```text
VPS Lab deploy

shared infra provisioning

network changes

remote Codex operational access

Finance Hub real database creation
```

---

# 197. Gate 0 verifica

```text
CPU

RAM

disk

Docker

containers

networks

public ports

n8n connectivity

postgres-products existence

UFW

Fail2Ban

SSH

NPM

Portainer

current backups

Codex privileges
```

---

# 198. M02 dependency

M02 na VPS requer:

```text
Gate 0 PASS
+
postgres-products operational
```

---

# 199. Backup Finance Hub

Backup da aplicação inclui:

```text
Finance Hub database
+
Finance Hub persistent storage
```

---

# 200. Não fazer backup global como responsabilidade da aplicação

Backup Finance Hub não significa:

```text
dump de todos os databases do postgres-products
```

---

# 201. Database backup

Production:

```text
pg_dump finance_hub_prod
```

---

# 202. Database roles

Roles/grants deverão ser recriáveis por:

```text
versioned bootstrap/infrastructure scripts
+
secrets externos
```

Não depender de dump global do cluster.

---

# 203. Backup directories oficiais

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

# 204. Backup off-site

```text
PostgreSQL dump
+
storage
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

# 205. Backup frequency V0.1

No mínimo:

```text
daily
```

---

# 206. RPO

Target inicial:

```text
<= 24h
```

---

# 207. Retention

```text
14 daily

8 weekly

12 monthly
```

---

# 208. Restore

Antes do primeiro uso financeiro real:

```text
at least one successful isolated restore
```

---

# 209. Restore mensal

Após operação real:

```text
monthly isolated restore test
```

---

# 210. Restore nunca começa sobre Production

Primeiro:

```text
isolated temporary target
```

---

# 211. Backup pré-risco

Obrigatório antes de:

```text
Production migration

destructive DB operation

high-risk infrastructure change
```

---

# 212. V0.1 scope final

A V0.1 deverá entregar:

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

API Idempotency

WhatsApp

Summary

CSV Export

Security

Backup

Restore
```

---

# 213. Fora da V0.1

```text
Firefly

Metabase

Own Dashboard

Products

PriceObservations

Receipts

OCR

Fiscal module

Vehicles

OFX

CSV import/reconciliation

Installments

Recurring transactions

Advanced card bills

Advanced AI analytics

Multi-user SaaS

FX
```

---

# 214. Prepare vs Implement

É permitido:

```text
documentar conceito futuro

reservar folder

definir extension point
```

Não significa:

```text
criar tabela futura

subir serviço futuro

implementar feature futura
```

---

# 215. Consumption domain futuro

Poderá incluir:

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

# 216. Product != Category

Produto representa item comprado.

Category representa classificação financeira.

---

# 217. Price Intelligence futuro

Entidade principal:

```text
PriceObservation
```

---

# 218. Transaction != PriceObservation

```text
comprei leite por 5,29
```

poderá futuramente gerar Transaction + item + PriceObservation.

```text
vi leite por 5,29
```

gera apenas PriceObservation.

---

# 219. PriceObservation não altera saldo

---

# 220. Receipts futuro

```text
Attachment

Receipt

ReceiptItem

Tax data
```

---

# 221. Receipt != Transaction

Cada conceito possui lifecycle próprio.

---

# 222. Vehicles futuro

```text
Vehicle

FuelEvent
```

---

# 223. FuelEvent != Transaction

FuelEvent representa detalhes técnicos.

Transaction representa efeito financeiro.

---

# 224. Reconciliation futuro

Objetivo:

```text
manual Transaction
↕
external bank record
```

sem duplicar evento financeiro.

---

# 225. Credit Card

Account type:

```text
credit_card
```

pode existir V0.1.

---

# 226. Regra futura de cartão

Compra:

```text
Expense
```

Pagamento da fatura:

```text
Transfer
```

não segunda Expense.

---

# 227. Installments

Futuro.

Não representar apenas como texto solto quando módulo entrar.

---

# 228. Recurrence

Futuro.

Regra de recorrência será entidade separada das Transactions geradas.

---

# 229. Roadmap

```text
Documentation Freeze
↓
M01 Local Bootstrap
        │
        ├─────────────┐
        │             │
        ▼             ▼
local work          Gate 0
                     VPS safety
        │             │
        └──────┬──────┘
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
             Gate A
               ↓
              M05
       Inbox / Parser / Confirm
               ↓
              M06
      WhatsApp Integration
               ↓
              M07
   Correction / Void / Refund
               ↓
             Gate B
               ↓
              M08
 Reports / Export / Operations
               ↓
              M09
       Backup / Restore
               ↓
             Gate C
               ↓
             v0.1.0
```

---

# 230. Gate A

Finance Core funciona sem:

```text
WhatsApp
Evolution
n8n
Firefly
AI
```

---

# 231. Gate B

Integridade financeira comprovada:

```text
create

read

correct

void

refund

audit

idempotency
```

---

# 232. Gate C

Marca:

```text
REAL DATA READY
```

somente quando segurança, backup e restore estiverem comprovados.

---

# 233. Definition of Done

Feature não está pronta apenas porque “funciona”.

Quando aplicável, deverá possuir:

```text
implementation

validation

tests

migration

audit

logging

documentation

acceptance
```

---

# 234. Test priorities

```text
Money

Book isolation

Accounts

Expense

Income

Transfer

Refund

Correction

Void

Idempotency

Inbox retries

Confirmation

Authorization

Audit

Migrations

Backup

Restore
```

---

# 235. Critical test — Money

Validar precisão decimal.

---

# 236. Critical test — Transfer

```text
source != destination
same Book
same Currency
```

---

# 237. Critical test — Refund

```text
Expense 500

Refund 300

Refund 300
```

segundo Refund é rejeitado.

---

# 238. Critical test — Correction after Refund

```text
Expense 500
Refund 400
Correction Expense → 300
```

rejeitada.

---

# 239. Critical test — Void original after Refund

Expense com Refund posted não pode ser Void até os Refunds serem Void.

---

# 240. Critical test — Duplicate Inbox

Mesma identidade técnica:

```text
1 logical financial effect
```

---

# 241. Critical test — Failed Inbox Retry

Failed Inbox pode reprocessar a mesma mensagem sem criar uma nova Inbox lógica.

---

# 242. Critical test — API Idempotency

Same key + same request:

```text
same logical result
```

Same key + different request:

```text
409
```

---

# 243. Critical test — Authorization

n8n ingest credential não consegue acessar endpoints administrativos/direct financial create.

---

# 244. Critical test — Unauthorized sender

Nenhum `raw_text` persistido no Finance Inbox.

Nenhuma Transaction criada.

---

# 245. Critical test — Inactive master data

Nova Transaction não pode utilizar Account/Category/Book/Merchant inativos quando aplicável.

---

# 246. Critical test — Backup

Backup gerado e validado.

---

# 247. Critical test — Restore

Restore isolado realmente executado.

---

# 248. Recovery

Mesmo após perda completa da VPS, o sistema deverá poder ser reconstruído com:

```text
Git

Finance DB backup

Finance storage backup

recovery secrets

documentation
```

---

# 249. Git como memória durável

O projeto será registrado em:

```text
code

docs

migrations

tests

ADRs

CHANGELOG

PROJECT_STATE

AGENTS
```

---

# 250. Conversas de IA não são Source of Truth

Decisões válidas deverão estar no repositório.

---

# 251. AGENTS.md

Após freeze, será criado como constituição imperativa do agente.

---

# 252. PROJECT_STATE.md

Será o resumo operacional corrente da implementação.

---

# 253. ADR

Mudanças arquitetônicas relevantes futuras deverão seguir:

```text
problem
↓
ADR
↓
decision
↓
canonical docs affected
↓
implementation
```

---

# 254. Regra contra Feature Creep

Se uma nova ideia não for necessária para a milestone atual:

```text
BACKLOG
```

---

# 255. Regra contra abstração prematura

Não criar frameworks genéricos para problemas ainda inexistentes.

---

# 256. Regra contra integração prematura

Não implementar antes da hora:

```text
Firefly

Metabase

OCR

Products

Vehicles
```

---

# 257. Regra contra AI drift

Agente deverá sempre consultar:

```text
AGENTS.md

PROJECT_STATE.md

relevant canonical docs
```

---

# 258. V0.1 Success Scenario — Expense

Entrada:

```text
35 almoço nubank
```

Resultado:

```text
InboxMessage

Interpretation

posted Expense

AuditEvent

reply
```

---

# 259. V0.1 Success Scenario — Income

Entrada:

```text
recebi 2500 cliente empresa inter
```

Resultado:

```text
posted Income
refund_of_transaction_id = null
```

---

# 260. V0.1 Success Scenario — Transfer

Entrada:

```text
transferi 500 nubank para inter
```

Resultado:

```text
posted Transfer
same Book
same Currency
```

---

# 261. V0.1 Success Scenario — Correction

Entrada:

```text
corrige último para 38,90
```

Resultado:

```text
version checked
↓
update
↓
version increment
↓
AuditEvent
```

---

# 262. V0.1 Success Scenario — Void

Entrada:

```text
apaga último
```

Resultado:

```text
ConfirmationSession
↓
confirmation
↓
posted → voided
```

sem DELETE.

---

# 263. V0.1 Success Scenario — Refund

Original:

```text
expense
500
```

Entrada:

```text
estorna 200 da compra A83K2P
```

Após confirmação:

```text
income
200
refund_of_transaction_id = original.id
```

---

# 264. Duplicate Webhook Scenario

Mesma identidade:

```text
source
+
source_instance
+
source_message_id
```

recebida novamente após processamento:

```text
0 additional Transactions
```

---

# 265. Database Failure Scenario

Persistência falha:

```text
nenhuma falsa confirmação de registro
```

---

# 266. Evolution Failure Scenario

WhatsApp indisponível:

```text
Finance API continua funcionando
```

---

# 267. Firefly Failure Scenario

Futuro:

```text
Finance Core continua funcionando
```

---

# 268. Google Drive Failure Scenario

Runtime continua.

Backup externo reporta falha.

---

# 269. Regra do Freeze

Este documento só poderá ser promovido de:

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

# 270. Critério de reabertura futura

Depois do Freeze, uma decisão somente será reaberta por problema capaz de causar:

```text
dinheiro incorreto

duplicação financeira

perda de histórico

acesso não autorizado

restore impossível

schema impossível

milestone impossível
```

---

# 271. Objetivo final da fundação

A V0.1 deverá começar pequena, mas correta.

Prioridades:

```text
dados corretos

regras corretas

segurança

idempotência

auditabilidade

recoverability

portabilidade
```

e não quantidade de features.

---

# 272. Objetivo final do Finance Intelligence Hub

Ao longo do tempo, a plataforma deverá ser capaz de responder:

```text
quanto eu gasto?

onde eu gasto?

com quem eu gasto?

quanto recebo?

como meus gastos mudaram?

quais compras foram estornadas?

quanto cada conta movimenta?

como meus preços mudaram?

o que estou comprando?

quanto pago por unidade?

quanto pago em impostos?

quanto meu veículo custa?

quais gastos estão fora do normal?
```

utilizando dados que permanecem:

```text
próprios

auditáveis

portáveis

recuperáveis

independentes das interfaces utilizadas
```