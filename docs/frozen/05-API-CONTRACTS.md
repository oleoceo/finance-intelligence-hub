# 05-API-CONTRACTS.md

# Finance Intelligence Hub
## API Contracts — V0.1

**Documento:** `05-API-CONTRACTS.md`  
**Versão:** 0.3.1  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- documentos canônicos `00` a `04`

---

# 1. Base

```text
/api/v1
```

JSON:

```text
snake_case
UTF-8
```

Money:

```text
decimal strings
```

Financial date:

```text
YYYY-MM-DD
```

---

# 2. Authentication

Bearer credential ou mecanismo service-to-service equivalente.

Scopes mínimos:

```text
finance:ingest
finance:admin
```

---

# 3. `finance:ingest`

Principal client:

```text
n8n
```

Permissão principal:

```text
POST /api/v1/inbox/messages
```

Não possui por padrão:

```text
/admin/*
POST /transactions
PATCH /transactions/*
POST /transactions/*/void
POST /transactions/*/refunds
```

---

# 4. `finance:admin`

Para:

```text
direct API
trusted administration
future trusted backend
```

---

# 5. Strict schemas

Writes rejeitam campos desconhecidos.

Objetivo:

```text
no mass assignment
```

---

# 6. Server-controlled fields

Clients normais não controlam:

```text
id
human_ref
initial status
source
created_at
updated_at
voided_at
refund_of_transaction_id in generic create
arbitrary initial version
```

---

# 7. Request tracing

Finance API gera:

```text
request_id
```

e aceita/gera:

```text
X-Correlation-ID
```

---

# 8. Success envelope

```json
{
  "data": {},
  "meta": {
    "request_id": "019...",
    "correlation_id": "019..."
  }
}
```

---

# 9. Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  },
  "meta": {
    "request_id": "019...",
    "correlation_id": "019..."
  }
}
```

---

# 10. Error codes mínimos

```text
VALIDATION_ERROR
UNAUTHORIZED
INSUFFICIENT_SCOPE
SENDER_NOT_AUTHORIZED

BOOK_NOT_FOUND
BOOK_INACTIVE

ACCOUNT_NOT_FOUND
ACCOUNT_INACTIVE

CATEGORY_NOT_FOUND
CATEGORY_INACTIVE
CATEGORY_CYCLE

MERCHANT_NOT_FOUND
MERCHANT_INACTIVE

TRANSACTION_NOT_FOUND
TRANSACTION_ALREADY_VOIDED
TRANSACTION_HAS_POSTED_REFUNDS
TRANSACTION_DATE_IN_FUTURE

VERSION_CONFLICT
IDEMPOTENCY_CONFLICT

TRANSFER_SAME_ACCOUNT
CROSS_BOOK_TRANSFER_NOT_SUPPORTED
CURRENCY_MISMATCH

REFUND_INVALID_TARGET
REFUND_IMMUTABLE
REFUND_AMOUNT_EXCEEDED
REFUND_DATE_INVALID

DEFAULT_ACCOUNT_BOOK_MISMATCH
DEFAULT_ACCOUNT_REQUIRED_BOOK
DEFAULT_ACCOUNT_IN_USE
DEFAULT_BOOK_IN_USE

CONFIRMATION_EXPIRED
RATE_LIMITED
DATABASE_UNAVAILABLE
INTERNAL_ERROR
```

---

# 11. Idempotency-Key

Obrigatória em:

```text
POST /transactions
POST /transactions/{id}/void
POST /transactions/{id}/refunds
```

---

# 12. API idempotency semantics

```text
same scoped key + same fingerprint
→ prior logical result
```

```text
same scoped key + different fingerprint
→ 409 IDEMPOTENCY_CONFLICT
```

Persistência:

```text
PostgreSQL
```

Sem expiração automática V0.1.

---

# 13. PATCH concurrency

PATCH usa:

```text
version
```

para optimistic locking.

---

# 14. Books

```text
GET   /api/v1/books
POST  /api/v1/books
GET   /api/v1/books/{id}
PATCH /api/v1/books/{id}
```

Scope:

```text
finance:admin
```

---

# 15. Create Book

```json
{
  "name": "Pessoal",
  "currency": "BRL",
  "timezone": "America/Sao_Paulo"
}
```

---

# 16. Accounts

```text
GET   /api/v1/accounts
POST  /api/v1/accounts
GET   /api/v1/accounts/{id}
PATCH /api/v1/accounts/{id}
```

---

# 17. Create Account

```json
{
  "book_id": "019...",
  "name": "Nubank",
  "type": "checking"
}
```

Currency será derivada/validada pelo Book.

---

# 18. Categories

```text
GET   /api/v1/categories
POST  /api/v1/categories
GET   /api/v1/categories/{id}
PATCH /api/v1/categories/{id}
```

---

# 19. Create Category

```json
{
  "book_id": "019...",
  "name": "Tráfego Pago",
  "parent_category_id": "019...",
  "type": "expense"
}
```

---

# 20. Merchants

```text
GET   /api/v1/merchants
POST  /api/v1/merchants
GET   /api/v1/merchants/{id}
PATCH /api/v1/merchants/{id}
```

---

# 21. Merchant aliases

Não há CRUD obrigatório V0.1 para entidade dedicada de alias.

Matching inicial usa ClassificationRules/deterministic matching.

---

# 22. Classification Rules

```text
GET   /api/v1/admin/classification-rules
POST  /api/v1/admin/classification-rules
GET   /api/v1/admin/classification-rules/{id}
PATCH /api/v1/admin/classification-rules/{id}
```

Scope:

```text
finance:admin
```

---

# 23. Create ClassificationRule

Request:

```json
{
  "priority": 10,
  "match_type": "contains",
  "pattern": "google ads",
  "target_book_id": "019...",
  "target_account_id": null,
  "target_category_id": "019...",
  "target_merchant_id": "019..."
}
```

O request administrativo **não controla `source`**.

---

# 24. ClassificationRule source

Regra criada por endpoint administrativo:

```text
source = manual
```

definido pelo servidor.

Valor:

```text
system
```

somente por fluxo interno autorizado.

---

# 25. ClassificationRule response

Pode expor:

```json
{
  "data": {
    "id": "019...",
    "priority": 10,
    "match_type": "contains",
    "pattern": "google ads",
    "source": "manual",
    "active": true
  }
}
```

---

# 26. Authorized Senders

```text
GET   /api/v1/admin/authorized-senders
POST  /api/v1/admin/authorized-senders
GET   /api/v1/admin/authorized-senders/{id}
PATCH /api/v1/admin/authorized-senders/{id}
```

---

# 27. Create AuthorizedSender

```json
{
  "channel": "whatsapp",
  "sender_reference": "5511999999999",
  "name": "Principal",
  "default_book_id": "019...",
  "default_account_id": "019...",
  "active": true
}
```

---

# 28. Inbox

```text
POST /api/v1/inbox/messages
```

Scope:

```text
finance:ingest
```

---

# 29. Inbox request

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

# 30. Inbox authorization order

Finance API deverá validar antes de persistir `raw_text`:

```text
service authentication
↓
technical/group/fromMe validation
↓
sender normalization
↓
AuthorizedSender
↓
persist Inbox
```

---

# 31. Inbox identity

```text
source
+
source_instance
+
source_message_id
```

---

# 32. Unauthorized sender

```text
403 SENDER_NOT_AUTHORIZED
```

e:

```text
0 Finance Inbox raw_text
0 Transaction
```

---

# 33. Duplicate processed Inbox

Não reexecuta ação.

Pode retornar:

```json
{
  "data": {
    "result": {
      "type": "duplicate_message"
    },
    "reply": {
      "should_send": false
    }
  },
  "meta": {
    "duplicate": true
  }
}
```

---

# 34. Failed Inbox retry

Mesma identidade poderá reprocessar a mesma InboxMessage.

---

# 35. Confirmation response

```json
{
  "data": {
    "inbox_message": {
      "id": "019...",
      "status": "needs_confirmation"
    },
    "result": {
      "type": "confirmation_required",
      "confirmation": {
        "id": "019...",
        "action": "select_account",
        "expires_at": "2026-09-04T18:30:00-03:00"
      }
    }
  }
}
```

---

# 36. Transactions routes

```text
GET  /api/v1/transactions
POST /api/v1/transactions

GET /api/v1/transactions/last

GET   /api/v1/transactions/{id}
PATCH /api/v1/transactions/{id}

POST /api/v1/transactions/{id}/void

POST /api/v1/transactions/{id}/refunds
GET  /api/v1/transactions/{id}/refunds

GET /api/v1/transactions/{id}/audit
```

Scope:

```text
finance:admin
```

---

# 37. Generic create types

Somente:

```text
expense
income
transfer
```

---

# 38. Generic create status

Client não envia status.

Successful create resulta em:

```text
posted
```

---

# 39. Expense create

```http
POST /api/v1/transactions
Idempotency-Key: <key>
```

```json
{
  "book_id": "019...",
  "type": "expense",
  "amount": "35.00",
  "account_id": "019...",
  "category_id": "019...",
  "merchant_id": null,
  "description": "Almoço",
  "notes": null,
  "transaction_date": "2026-09-04",
  "source_reference": null
}
```

---

# 40. Expense response

```json
{
  "data": {
    "id": "019...",
    "human_ref": "A83K2P",
    "book_id": "019...",
    "type": "expense",
    "status": "posted",
    "amount": "35.00",
    "currency": "BRL",
    "account_id": "019...",
    "destination_account_id": null,
    "category_id": "019...",
    "merchant_id": null,
    "description": "Almoço",
    "transaction_date": "2026-09-04",
    "version": 1,
    "created_at": "2026-09-04T18:15:00-03:00"
  }
}
```

---

# 41. Income create

```json
{
  "book_id": "019...",
  "type": "income",
  "amount": "2500.00",
  "account_id": "019...",
  "description": "Pagamento cliente",
  "transaction_date": "2026-09-04"
}
```

Generic Income sempre possui:

```text
refund_of_transaction_id = null
```

---

# 42. Refund bypass blocked

Generic create rejeita:

```text
refund_of_transaction_id
```

e rejeita `type=refund`.

---

# 43. Transfer create

```json
{
  "book_id": "019...",
  "type": "transfer",
  "amount": "500.00",
  "account_id": "019...",
  "destination_account_id": "019...",
  "description": "Nubank para Inter",
  "transaction_date": "2026-09-04"
}
```

---

# 44. Transfer errors

Same Account:

```text
422 TRANSFER_SAME_ACCOUNT
```

Cross-Book:

```text
422 CROSS_BOOK_TRANSFER_NOT_SUPPORTED
```

Currency mismatch:

```text
422 CURRENCY_MISMATCH
```

---

# 45. Future financial date

Rejeitar:

```text
transaction_date > current Book-local date
```

Código:

```text
TRANSACTION_DATE_IN_FUTURE
```

---

# 46. Transaction representation

```json
{
  "data": {
    "id": "019...",
    "human_ref": "R91BX4",
    "book_id": "019...",
    "type": "income",
    "status": "posted",
    "amount": "200.00",
    "currency": "BRL",
    "account_id": "019...",
    "destination_account_id": null,
    "category_id": null,
    "merchant_id": "019...",
    "description": "Estorno Amazon",
    "transaction_date": "2026-09-04",
    "source": "whatsapp",
    "source_reference": "3EB...",
    "refund_of_transaction_id": "019...",
    "is_refund": true,
    "version": 1,
    "created_at": "...",
    "updated_at": "...",
    "voided_at": null
  }
}
```

---

# 47. `is_refund`

Campo derivado:

```text
refund_of_transaction_id != null
```

---

# 48. List filters

```text
book_id
type
status
account_id
category_id
merchant_id
date_from
date_to
search
```

---

# 49. Pagination

```text
page default = 1
page_size default = 50
page_size max = 100
```

---

# 50. Last Transaction

```text
GET /api/v1/transactions/last?book_id=<uuid>
```

`book_id` obrigatório.

Semântica:

```text
status = posted
ORDER BY created_at DESC, id DESC
```

---

# 51. PATCH Transaction

```json
{
  "version": 2,
  "amount": "38.90"
}
```

---

# 52. Mutable fields

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

# 53. Immutable fields

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

# 54. Refund PATCH

Quando:

```text
refund_of_transaction_id != null
```

retornar:

```text
REFUND_IMMUTABLE
```

---

# 55. Void

```http
POST /api/v1/transactions/{id}/void
Idempotency-Key: <key>
```

```json
{
  "version": 2,
  "reason": "Lançamento duplicado"
}
```

---

# 56. Void posted Refund rule

Se Expense original possuir Refunds `posted`:

```text
409 TRANSACTION_HAS_POSTED_REFUNDS
```

---

# 57. Void idempotent retry

Mesma key + mesmo request retorna mesmo resultado lógico.

---

# 58. Void Refund

Permitido utilizando o mesmo endpoint sobre o ID da Refund Transaction.

---

# 59. Refund endpoint

```http
POST /api/v1/transactions/{expense_id}/refunds
Idempotency-Key: <key>
```

---

# 60. Refund request

```json
{
  "version": 2,
  "amount": "200.00",
  "account_id": "019...",
  "transaction_date": "2026-09-04",
  "description": "Estorno Amazon",
  "notes": null
}
```

---

# 61. Refund server-controlled fields

Client não envia:

```text
book_id
currency
type
refund_of_transaction_id
```

---

# 62. Refund result

Servidor cria:

```text
type = income
status = posted
book_id = original.book_id
currency = original.currency
refund_of_transaction_id = original.id
```

---

# 63. Refund amount

```text
amount > 0
amount <= refundable_remaining
```

Erro:

```text
REFUND_AMOUNT_EXCEEDED
```

---

# 64. Refund date

```text
refund transaction_date
>=
original transaction_date
```

Erro:

```text
REFUND_DATE_INVALID
```

---

# 65. Refund target

Precisa ser:

```text
posted Expense
```

Caso contrário:

```text
REFUND_INVALID_TARGET
```

---

# 66. Refund concurrency

API/Core deverá impedir over-refund concorrente sob lock/transaction.

---

# 67. Summary

```text
GET /api/v1/reports/summary
```

`book_id` obrigatório.

Optional:

```text
date_from
date_to
```

---

# 68. Summary response

```json
{
  "data": {
    "book_id": "019...",
    "currency": "BRL",
    "ordinary_income": "5000.00",
    "gross_expenses": "3400.00",
    "refunds": "200.00",
    "net_expenses": "3200.00",
    "net": "1800.00"
  }
}
```

---

# 69. Summary semantics

Transfers e Transactions `voided` são excluídos.

Refund não compõe ordinary income.

---

# 70. CSV

```text
GET /api/v1/exports/transactions.csv
```

`book_id` obrigatório.

Sanitizar spreadsheet formulas.

---

# 71. Health

```text
GET /health
```

---

# 72. Readiness

```text
GET /ready
```

PostgreSQL indisponível:

```text
503 DATABASE_UNAVAILABLE
```

---

# 73. OpenAPI

Manter contrato executável.

Pode expor:

```text
/openapi.json
/docs
```

conforme configuração segura.

---

# 74. Critical contract tests

```text
finance:ingest cannot use admin routes

strict unknown-field rejection

generic types only expense/income/transfer

statuses only posted/voided

generic Refund bypass rejected

Refund result is linked Income

ClassificationRule source cannot be client-forged

Void requires Idempotency-Key

Refund requires Idempotency-Key

create requires Idempotency-Key

Last requires book_id

Summary requires book_id

Transaction PATCH uses version

posted Refunds block original Expense Void

unauthorized sender leaves no Finance raw Inbox
```

---

# 75. Correções específicas desta v0.3.1

O contrato V0.1 utiliza somente:

```text
transaction_date
```

para a data financeira.

A terminologia de bloqueio de Void é:

```text
TRANSACTION_HAS_POSTED_REFUNDS
```

E:

```text
ClassificationRule.source
```

é controlado pelo servidor.

---

# 76. Condição para Freeze

Promover para:

```text
FROZEN — Baseline for Implementation
```

após PASS mecânico contra o ledger.

---
