# 04-DATABASE.md

# Finance Intelligence Hub
## PostgreSQL Database Design — V0.1

**Documento:** `04-DATABASE.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `03-ARCHITECTURE.md`

---

# 1. Objetivo

Este documento transforma o Domain Model V0.1 em desenho físico PostgreSQL.

Define:

```text
databases
tables
columns
data types
foreign keys
CHECK constraints
unique constraints
indexes
idempotency
audit
outbox
migrations
seeds
database roles
```

---

# 2. Source of Truth

```text
PostgreSQL
=
canonical Source of Truth
```

Redis, n8n, Evolution, Firefly e Metabase não são bancos canônicos do Finance Hub.

---

# 3. Target de infraestrutura

Na VPS:

```text
/opt/apps/apps/databases/postgres-products
```

Gate 0 deverá verificar se esse serviço já existe.

---

# 4. Databases

```text
finance_hub_lab
finance_hub_prod
```

Testes podem utilizar PostgreSQL efêmero/local.

---

# 5. Bancos proibidos

Não utilizar:

```text
n8n-postgres
evolution-postgres
```

para dados do Finance Hub.

---

# 6. Convenções

```text
tables       snake_case plural
columns      snake_case
primary IDs  UUID
```

UUIDv7 preferido gerado pela aplicação.

UUIDv4 é fallback via ADR se M01 comprovar necessidade.

---

# 7. Money

```text
NUMERIC(18,2)
```

Nunca:

```text
FLOAT
REAL
DOUBLE PRECISION
```

para valores monetários canônicos.

---

# 8. Currency

```text
VARCHAR(3)
```

Constraint:

```sql
CHECK (currency ~ '^[A-Z]{3}$')
```

Não utilizar `CHAR(3)`.

---

# 9. Financial date

```text
transaction_date DATE NOT NULL
```

A V0.1 não possui coluna própria para horário financeiro da Transaction.

---

# 10. Technical timestamps

Utilizar:

```text
TIMESTAMPTZ
```

para:

```text
created_at
updated_at
received_at
processing_started_at
last_attempt_at
processed_at
resolved_at
voided_at
published_at
etc.
```

---

# 11. V0.1 physical tables

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

# 12. Future tables não criar

Não criar antecipadamente:

```text
merchant_aliases
products
brands
product_variants
product_packages
transaction_items
price_observations
promotions
attachments
receipts
receipt_items
vehicles
fuel_events
installment_groups
recurring_transaction_rules
external_transaction_records
reconciliation_matches
external_mappings
```

---

# 13. Merchant alias recognition

Na V0.1:

```text
ClassificationRule
+
deterministic matching
```

Não exige tabela `merchant_aliases`.

---

# 14. `books`

```text
id                UUID PK
name              VARCHAR(120) NOT NULL
normalized_name   VARCHAR(120) NOT NULL
currency          VARCHAR(3) NOT NULL
timezone          VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo'
active            BOOLEAN NOT NULL DEFAULT TRUE
archived_at       TIMESTAMPTZ NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

---

# 15. Book constraints

```text
UNIQUE(normalized_name)
UNIQUE(id, currency)
```

Archive consistency:

```sql
CHECK (
  (active = TRUE  AND archived_at IS NULL)
  OR
  (active = FALSE AND archived_at IS NOT NULL)
)
```

---

# 16. Book currency mutation

Finance Core bloqueia alteração ordinária depois que existirem dependências relevantes.

---

# 17. `accounts`

```text
id                UUID PK
book_id           UUID NOT NULL
name              VARCHAR(160) NOT NULL
normalized_name   VARCHAR(160) NOT NULL
type              VARCHAR(32) NOT NULL
currency          VARCHAR(3) NOT NULL
institution_name  VARCHAR(160) NULL
notes             TEXT NULL
active            BOOLEAN NOT NULL DEFAULT TRUE
archived_at       TIMESTAMPTZ NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

---

# 18. Account type

```sql
CHECK (
  type IN (
    'checking',
    'savings',
    'cash',
    'credit_card',
    'other'
  )
)
```

---

# 19. Account FKs

```text
book_id
→ books.id
```

e:

```text
(book_id, currency)
→ books(id, currency)
```

garantindo mesma moeda do Book.

---

# 20. Account uniqueness

```text
UNIQUE(book_id, normalized_name)
UNIQUE(id, book_id)
UNIQUE(id, book_id, currency)
```

---

# 21. Account archive

Mesma constraint `active/archived_at` usada por Book.

FKs históricas não incluem `active`.

Finance Core impede uso de Account inativa em novo lançamento.

---

# 22. Account immutability

Finance Core controla:

```text
book_id
currency
type
```

conforme lifecycle definido.

---

# 23. `categories`

```text
id                  UUID PK
book_id             UUID NOT NULL
name                VARCHAR(160) NOT NULL
normalized_name     VARCHAR(160) NOT NULL
parent_category_id  UUID NULL
type                VARCHAR(16) NOT NULL DEFAULT 'both'
active              BOOLEAN NOT NULL DEFAULT TRUE
archived_at         TIMESTAMPTZ NULL
created_at          TIMESTAMPTZ NOT NULL
updated_at          TIMESTAMPTZ NOT NULL
```

---

# 24. Category type

```sql
CHECK (
  type IN (
    'expense',
    'income',
    'both'
  )
)
```

---

# 25. Category parent

```text
UNIQUE(id, book_id)
```

FK:

```text
(parent_category_id, book_id)
→ categories(id, book_id)
```

---

# 26. Category self-parent

```sql
CHECK (
  parent_category_id IS NULL
  OR parent_category_id <> id
)
```

Ciclos maiores ficam no Finance Core.

---

# 27. Category uniqueness

Root:

```sql
CREATE UNIQUE INDEX ...
ON categories(book_id, normalized_name)
WHERE parent_category_id IS NULL;
```

Child:

```sql
CREATE UNIQUE INDEX ...
ON categories(book_id, parent_category_id, normalized_name)
WHERE parent_category_id IS NOT NULL;
```

---

# 28. `merchants`

```text
id                UUID PK
name              VARCHAR(200) NOT NULL
normalized_name   VARCHAR(200) NOT NULL
type              VARCHAR(50) NULL
tax_identifier    VARCHAR(32) NULL
active            BOOLEAN NOT NULL DEFAULT TRUE
archived_at       TIMESTAMPTZ NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL
```

---

# 29. Merchant indexes

```text
INDEX(normalized_name)
```

Optional:

```text
UNIQUE(tax_identifier)
WHERE tax_identifier IS NOT NULL
```

quando normalização do identificador estiver definida.

---

# 30. `classification_rules`

```text
id                    UUID PK
priority              INTEGER NOT NULL DEFAULT 100
active                BOOLEAN NOT NULL DEFAULT TRUE
match_type            VARCHAR(32) NOT NULL
pattern               VARCHAR(500) NOT NULL
normalized_pattern    VARCHAR(500) NOT NULL
target_book_id        UUID NULL
target_account_id     UUID NULL
target_category_id    UUID NULL
target_merchant_id    UUID NULL
source                VARCHAR(32) NOT NULL
created_at            TIMESTAMPTZ NOT NULL
updated_at            TIMESTAMPTZ NOT NULL
```

---

# 31. ClassificationRule match type

```sql
CHECK (
  match_type IN ('exact', 'contains')
)
```

---

# 32. ClassificationRule source

```sql
CHECK (
  source IN ('manual', 'system')
)
```

A coluna é persistida, mas o valor é definido pela camada de aplicação conforme origem da regra.

---

# 33. At least one target

```sql
CHECK (
  target_book_id IS NOT NULL
  OR target_account_id IS NOT NULL
  OR target_category_id IS NOT NULL
  OR target_merchant_id IS NOT NULL
)
```

---

# 34. ClassificationRule target FKs

```text
target_book_id     → books.id
target_account_id  → accounts.id
target_category_id → categories.id
target_merchant_id → merchants.id
```

Compatibilidade cross-row e estado ativo são validados pelo Core.

---

# 35. Rule indexes

```text
(active, priority)
(normalized_pattern)
```

---

# 36. `authorized_senders`

```text
id                    UUID PK
channel               VARCHAR(32) NOT NULL
sender_reference      VARCHAR(255) NOT NULL
name                  VARCHAR(160) NULL
default_book_id       UUID NULL
default_account_id    UUID NULL
active                BOOLEAN NOT NULL DEFAULT TRUE
created_at            TIMESTAMPTZ NOT NULL
updated_at            TIMESTAMPTZ NOT NULL
```

---

# 37. Sender uniqueness

```text
UNIQUE(channel, sender_reference)
```

---

# 38. Default consistency

```sql
CHECK (
  default_account_id IS NULL
  OR default_book_id IS NOT NULL
)
```

FK:

```text
(default_account_id, default_book_id)
→ accounts(id, book_id)
```

Core verifica que Book/Account estão ativos.

---

# 39. `inbox_messages`

```text
id                    UUID PK

source                VARCHAR(32) NOT NULL
source_instance       VARCHAR(255) NOT NULL
source_message_id     VARCHAR(255) NOT NULL

sender_reference      VARCHAR(255) NOT NULL
authorized_sender_id  UUID NOT NULL

raw_text              TEXT NOT NULL
raw_payload           JSONB NULL

received_at           TIMESTAMPTZ NOT NULL
processing_status     VARCHAR(32) NOT NULL

attempt_count         INTEGER NOT NULL DEFAULT 0
processing_started_at TIMESTAMPTZ NULL
last_attempt_at       TIMESTAMPTZ NULL
processed_at          TIMESTAMPTZ NULL

correlation_id        UUID NOT NULL

failure_code          VARCHAR(64) NULL
failure_message       TEXT NULL

created_at            TIMESTAMPTZ NOT NULL
updated_at            TIMESTAMPTZ NOT NULL
```

---

# 40. Inbox uniqueness

```text
UNIQUE(
  source,
  source_instance,
  source_message_id
)
```

---

# 41. Inbox sender FK

```text
authorized_sender_id
→ authorized_senders.id
```

Como autorização acontece antes da persistência:

```text
authorized_sender_id NOT NULL
```

é correto.

---

# 42. Inbox statuses

```sql
CHECK (
  processing_status IN (
    'received',
    'processing',
    'needs_confirmation',
    'processed',
    'failed',
    'ignored'
  )
)
```

---

# 43. Inbox attempts

```sql
CHECK (attempt_count >= 0)
```

---

# 44. Inbox indexes

```text
(processing_status, last_attempt_at)
(authorized_sender_id, received_at DESC)
(sender_reference, received_at DESC)
(correlation_id)
```

---

# 45. `interpretations`

```text
id                  UUID PK
inbox_message_id    UUID NOT NULL
attempt_number      INTEGER NOT NULL
intent              VARCHAR(64) NOT NULL
confidence          NUMERIC(5,4) NULL
parsed_data         JSONB NOT NULL
parser_type         VARCHAR(32) NOT NULL
parser_version      VARCHAR(64) NULL
ai_provider         VARCHAR(64) NULL
ai_model            VARCHAR(128) NULL
prompt_version      VARCHAR(64) NULL
status              VARCHAR(32) NOT NULL
created_at          TIMESTAMPTZ NOT NULL
```

---

# 46. Interpretation constraints

```text
UNIQUE(inbox_message_id, attempt_number)
```

```sql
CHECK (attempt_number >= 1)
```

```sql
CHECK (
  confidence IS NULL
  OR (confidence >= 0 AND confidence <= 1)
)
```

---

# 47. Intents

Baseline:

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

# 48. `confirmation_sessions`

```text
id                            UUID PK
channel                       VARCHAR(32) NOT NULL
sender_reference              VARCHAR(255) NOT NULL
authorized_sender_id          UUID NOT NULL

inbox_message_id              UUID NOT NULL
resolved_by_inbox_message_id  UUID NULL

action                        VARCHAR(64) NOT NULL

target_entity_type            VARCHAR(64) NULL
target_entity_id              UUID NULL
target_version                INTEGER NULL

payload                       JSONB NOT NULL

status                        VARCHAR(24) NOT NULL
resolution_reason             VARCHAR(64) NULL

expires_at                    TIMESTAMPTZ NOT NULL

created_at                    TIMESTAMPTZ NOT NULL
resolved_at                   TIMESTAMPTZ NULL
```

---

# 49. Confirmation statuses

```sql
CHECK (
  status IN (
    'pending',
    'confirmed',
    'cancelled',
    'expired'
  )
)
```

---

# 50. Confirmation resolved consistency

```sql
CHECK (
  (status = 'pending' AND resolved_at IS NULL)
  OR
  (status <> 'pending' AND resolved_at IS NOT NULL)
)
```

---

# 51. One pending Confirmation

```sql
CREATE UNIQUE INDEX ...
ON confirmation_sessions(channel, sender_reference)
WHERE status = 'pending';
```

---

# 52. Confirmation target version

```sql
CHECK (
  target_version IS NULL
  OR target_version >= 1
)
```

---

# 53. Superseded

Não criar status próprio.

Usar:

```text
status = cancelled
resolution_reason = superseded_by_new_command
```

---

# 54. Confirmation TTL

Persistir:

```text
expires_at
```

Default de aplicação:

```text
15 minutes
```

---

# 55. `transactions`

```text
id                        UUID PK
human_ref                 VARCHAR(16) NOT NULL

book_id                   UUID NOT NULL

type                      VARCHAR(16) NOT NULL
status                    VARCHAR(16) NOT NULL

amount                    NUMERIC(18,2) NOT NULL
currency                  VARCHAR(3) NOT NULL

account_id                UUID NOT NULL
destination_account_id    UUID NULL

category_id               UUID NULL
merchant_id               UUID NULL

description               VARCHAR(500) NOT NULL
notes                     TEXT NULL

transaction_date          DATE NOT NULL

source                    VARCHAR(32) NOT NULL
source_reference          VARCHAR(255) NULL
inbox_message_id          UUID NULL

refund_of_transaction_id  UUID NULL

version                   INTEGER NOT NULL DEFAULT 1

voided_at                 TIMESTAMPTZ NULL
void_reason               TEXT NULL

created_at                TIMESTAMPTZ NOT NULL
updated_at                TIMESTAMPTZ NOT NULL
```

---

# 56. Transaction human reference

```text
UNIQUE(human_ref)
```

---

# 57. Transaction type

```sql
CHECK (
  type IN (
    'expense',
    'income',
    'transfer'
  )
)
```

---

# 58. Transaction status

```sql
CHECK (
  status IN (
    'posted',
    'voided'
  )
)
```

---

# 59. Amount

```sql
CHECK (amount > 0)
```

---

# 60. Version

```sql
CHECK (version >= 1)
```

---

# 61. Transaction → Book

```text
book_id
→ books.id
```

---

# 62. Currency = Book

```text
(book_id, currency)
→ books(id, currency)
```

---

# 63. Source Account same Book/currency

```text
(account_id, book_id, currency)
→ accounts(id, book_id, currency)
```

---

# 64. Destination same Book/currency

```text
(destination_account_id, book_id, currency)
→ accounts(id, book_id, currency)
```

quando presente.

Consequência:

```text
cross-Book Transfer impossible
cross-currency Transfer impossible
```

na mesma Transaction.

---

# 65. Category same Book

```text
(category_id, book_id)
→ categories(id, book_id)
```

quando Category existir.

---

# 66. Merchant FK

```text
merchant_id
→ merchants.id
```

---

# 67. Inbox FK

```text
inbox_message_id
→ inbox_messages.id
```

---

# 68. One financial Transaction per origin Inbox

```sql
CREATE UNIQUE INDEX ...
ON transactions(inbox_message_id)
WHERE inbox_message_id IS NOT NULL;
```

---

# 69. Refund relationship

```text
refund_of_transaction_id
→ transactions.id
```

Adicionar:

```text
UNIQUE(id, book_id, currency)
```

e FK composta:

```text
(
  refund_of_transaction_id,
  book_id,
  currency
)
→
transactions(
  id,
  book_id,
  currency
)
```

garantindo mesmo Book/currency.

---

# 70. Refund local shape

```sql
CHECK (
  refund_of_transaction_id IS NULL
  OR type = 'income'
)
```

---

# 71. Expense structure

Quando `type = expense`:

```text
destination_account_id IS NULL
refund_of_transaction_id IS NULL
```

---

# 72. Income structure

Quando `type = income`:

```text
destination_account_id IS NULL
```

Refund é distinguido pela relação.

---

# 73. Transfer structure

Quando `type = transfer`:

```text
destination_account_id IS NOT NULL
account_id <> destination_account_id
refund_of_transaction_id IS NULL
```

---

# 74. Structural CHECK

Conceitualmente:

```sql
CHECK (
  (
    type IN ('expense', 'income')
    AND destination_account_id IS NULL
  )
  OR
  (
    type = 'transfer'
    AND destination_account_id IS NOT NULL
    AND account_id <> destination_account_id
    AND refund_of_transaction_id IS NULL
  )
)
```

em conjunto com a regra de Refund apenas em `income`.

---

# 75. Refund invariants Core-enforced

O banco não tentará implementar via CHECK cross-row:

```text
target must be posted Expense

no refund-of-refund

refund date >= original date

sum(posted Refunds) <= original amount

original Expense with posted Refund cannot be voided

original corrected amount >= posted Refund total

original corrected date <= Refund dates
```

Essas regras pertencem ao Finance Core.

---

# 76. Refund concurrency

Core deverá proteger a Expense original.

Estratégia válida:

```text
SELECT ... FOR UPDATE
```

ou equivalente transacional.

---

# 77. Master data active state

FKs preservam referências históricas.

Finance Core bloqueia novo uso de:

```text
inactive Book
inactive Account
inactive Category
inactive Merchant
```

---

# 78. Future financial date

A regra:

```text
transaction_date
<=
today in Book timezone
```

fica no Core, não em CHECK dependente do relógio.

---

# 79. Void consistency

```sql
CHECK (
  (
    status = 'posted'
    AND voided_at IS NULL
    AND void_reason IS NULL
  )
  OR
  (
    status = 'voided'
    AND voided_at IS NOT NULL
    AND void_reason IS NOT NULL
  )
)
```

---

# 80. Transaction indexes

```text
(book_id, transaction_date DESC)
(book_id, status, transaction_date DESC)
(account_id, transaction_date DESC)
(destination_account_id, transaction_date DESC)
(category_id, transaction_date DESC)
(merchant_id, transaction_date DESC)
(refund_of_transaction_id, status)
```

---

# 81. Last Transaction index

```sql
CREATE INDEX ...
ON transactions(book_id, created_at DESC, id DESC)
WHERE status = 'posted';
```

---

# 82. Summary index

```text
(book_id, transaction_date, type, status)
```

---

# 83. `audit_events`

```text
id                UUID PK
entity_type       VARCHAR(64) NOT NULL
entity_id         UUID NOT NULL
action            VARCHAR(64) NOT NULL
source            VARCHAR(32) NOT NULL
actor_reference   VARCHAR(255) NULL
old_data          JSONB NULL
new_data          JSONB NULL
correlation_id    UUID NULL
created_at        TIMESTAMPTZ NOT NULL
```

---

# 84. Audit

Sem FK genérica para `entity_id`.

Runtime normal não deverá editar/apagar eventos antigos.

---

# 85. Audit indexes

```text
(entity_type, entity_id, created_at DESC)
(correlation_id)
(action, created_at DESC)
```

---

# 86. `idempotency_keys`

```text
id                UUID PK
scope             VARCHAR(100) NOT NULL
idempotency_key   VARCHAR(255) NOT NULL
request_hash      VARCHAR(64) NOT NULL
status            VARCHAR(24) NOT NULL

resource_type     VARCHAR(64) NULL
resource_id       UUID NULL

response_status   INTEGER NULL
response_body     JSONB NULL

created_at        TIMESTAMPTZ NOT NULL
completed_at      TIMESTAMPTZ NULL
```

---

# 87. Idempotency states

```sql
CHECK (
  status IN (
    'in_progress',
    'completed'
  )
)
```

---

# 88. Idempotency uniqueness

```text
UNIQUE(scope, idempotency_key)
```

---

# 89. Idempotency completion consistency

```sql
CHECK (
  (
    status = 'in_progress'
    AND completed_at IS NULL
  )
  OR
  (
    status = 'completed'
    AND completed_at IS NOT NULL
  )
)
```

---

# 90. No automatic idempotency expiry

Não criar coluna/rotina de expiração automática na V0.1.

---

# 91. Atomic financial operation

Quando aplicável:

```text
IdempotencyKey
+
Transaction/domain mutation
+
Audit
+
OutboxEvent
```

participam da mesma transaction PostgreSQL.

Falha pré-COMMIT reverte tudo.

---

# 92. `outbox_events`

```text
id                UUID PK
event_type        VARCHAR(80) NOT NULL
aggregate_type    VARCHAR(64) NOT NULL
aggregate_id      UUID NOT NULL
payload           JSONB NOT NULL

status            VARCHAR(24) NOT NULL DEFAULT 'pending'
attempts          INTEGER NOT NULL DEFAULT 0

available_at      TIMESTAMPTZ NOT NULL
locked_at         TIMESTAMPTZ NULL
locked_by         VARCHAR(128) NULL
published_at      TIMESTAMPTZ NULL

last_error        TEXT NULL
created_at        TIMESTAMPTZ NOT NULL
```

---

# 93. Outbox statuses

```sql
CHECK (
  status IN (
    'pending',
    'processing',
    'published',
    'failed'
  )
)
```

---

# 94. Outbox use

A tabela pode existir vazia.

Emitir evento apenas quando houver consumidor/integrador real.

---

# 95. Database roles

Modelo:

```text
finance_hub_app
finance_hub_migrations
finance_hub_readonly
```

Runtime nunca superuser.

---

# 96. Delete policy

Preferir:

```text
ON DELETE RESTRICT
```

para entidades financeiras/históricas.

Evitar cascades destrutivos.

---

# 97. Business triggers

Não criar triggers para:

```text
automatic Refund
automatic classification
automatic external sync
financial business decisions
```

---

# 98. Migrations

Versionadas em:

```text
database/migrations/
```

Devem funcionar em database vazio.

---

# 99. Production migrations

Mudanças destrutivas exigem:

```text
review
backup
Lab validation
recovery plan
approval
```

---

# 100. Seeds

Lab pode usar fixtures.

Production migrations não hardcode:

```text
Pessoal
Empresa
real sender
real credentials
```

---

# 101. Production bootstrap

Books e sender reais serão criados por processo explícito de setup/admin.

---

# 102. DB tests obrigatórios

```text
money precision

Book currency

Account currency = Book

Category hierarchy

Category self-parent

same-Book Transaction

same-currency Transaction

Transfer source != destination

Refund relation shape

Refund same Book/Currency

Inbox uniqueness

Inbox retry lifecycle

Confirmation pending uniqueness

Transaction statuses

Void consistency

Idempotency uniqueness

Audit atomicity

Outbox atomicity
```

---

# 103. Core tests complementares

```text
inactive master-data use

Category long cycles

Refund target type/status

Refund overflow

Refund concurrency

Refund date

Correction after Refund

Void original with Refund

future transaction date

ClassificationRule target compatibility
```

---

# 104. Backup scope

Finance application backup:

```text
finance_hub_prod
```

Não:

```text
pg_dumpall of postgres-products
```

---

# 105. Official backup paths

```text
/opt/apps/backups/
├── databases/
│   └── finance-hub/
│       ├── lab/
│       └── production/
└── files/
    └── finance-hub/
        ├── lab/
        └── production/
```

---

# 106. Schema Definition of Done

```text
[ ] physical V0.1 tables only

[ ] no merchant_aliases table required

[ ] only expense/income/transfer

[ ] only posted/voided

[ ] Money NUMERIC(18,2)

[ ] transaction_date DATE NOT NULL

[ ] no separate financial time field

[ ] same Book/currency reinforced

[ ] Refund = linked Income

[ ] over-refund protected by Core transaction

[ ] Inbox source identity unique

[ ] Confirmation persistent

[ ] Idempotency persistent

[ ] Audit append-only logical

[ ] Outbox selective

[ ] migrations from empty DB pass
```

---

# 107. Correção específica desta v0.3.1

O schema físico V0.1 possui:

```text
transaction_date DATE NOT NULL
```

e nenhum campo adicional para horário financeiro da Transaction.

---

# 108. Condição para Freeze

Promover para:

```text
FROZEN — Baseline for Implementation
```

após PASS na checagem mecânica final contra o ledger.