# ADR-001 — Application Implementation Stack

**Status:** ACCEPTED
**Date:** 2026-09-04
**Decision Date:** 2026-10-15
**Project:** Finance Intelligence Hub  
**Decision scope:** Application runtime, web framework, database access, migrations, validation and testing baseline

---

# Context

The Finance Intelligence Hub canonical architecture is already frozen.

The initial application architecture is:

```text
MODULAR MONOLITH
```

with the core runtime composed of:

```text
Finance API
+
Finance Core
+
PostgreSQL
```

The implementation stack itself has intentionally not been frozen yet.

This decision belongs to:

```text
M01 — Local Bootstrap
```

and must not redefine the financial domain.

---

# Architectural constraints

Any selected stack must preserve the frozen requirements defined in:

```text
FINAL-FREEZE-DECISIONS.md
03-ARCHITECTURE.md
04-DATABASE.md
05-API-CONTRACTS.md
07-SECURITY.md
09-ROADMAP-TESTS.md
```

---

# Required capabilities

The selected stack must provide strong support for:

```text
PostgreSQL

database transactions

row locking

NUMERIC/decimal values

migrations

strict request validation

API contracts

optimistic locking

structured logging

integration testing

Docker deployment
```

---

# Financial requirements

The stack must safely support:

```text
NUMERIC(18,2)

transactional idempotency

SELECT ... FOR UPDATE
or equivalent row locking

atomic:
domain mutation
+
Audit
+
Idempotency
+
Outbox when applicable
```

---

# PostgreSQL fidelity

The implementation must not require SQLite as a substitute for PostgreSQL behavior.

Integration tests must be able to exercise real PostgreSQL semantics including:

```text
foreign keys

CHECK constraints

partial unique indexes

transactions

locking

concurrency

NUMERIC precision
```

---

# Validation requirements

The application layer must support strict input validation.

Write APIs must reject:

```text
unknown fields

invalid enum values

mass-assignment attempts

invalid money representations

invalid identifiers
```

---

# API requirements

The stack must support implementation of:

```text
/api/v1
```

with:

```text
service authentication

finance:ingest

finance:admin

structured errors

request IDs

correlation IDs

Idempotency-Key

OpenAPI or equivalent executable contract
```

---

# Testing requirements

The selected stack must support:

```text
unit tests

PostgreSQL integration tests

API contract tests

concurrency tests

security tests

migration tests
```

CI execution must be practical.

---

# Logging requirements

Must support structured logging with fields such as:

```text
request_id

correlation_id

route

duration

status

error_code
```

while allowing sensitive-value redaction.

---

# Configuration requirements

Must support validated environment configuration.

Examples:

```text
DATABASE_URL

service credentials

environment

logging configuration

application settings
```

Invalid required configuration should fail fast.

---

# Deployment requirements

Must be practical to run using:

```text
Docker
```

inside the existing VPS architecture.

The stack must not require introducing:

```text
Kubernetes

service mesh

distributed microservices

mandatory external cloud platform
```

for V0.1.

---

# Maintainability criteria

Evaluation should consider:

```text
ecosystem maturity

maintained dependencies

documentation quality

security maintenance

developer ergonomics

testability

migration reliability

operational simplicity

long-term maintainability
```

---

# Dependency policy

Prefer a small number of well-maintained dependencies.

Do not select a stack mainly because:

```text
it is fashionable

it generates more code automatically

it removes the need to understand database transactions
```

Financial correctness has priority.

---

# Candidate evaluation

M01 should compare practical candidates based on the frozen requirements.

The comparison should include at least:

```text
runtime/framework

PostgreSQL access layer

migration system

schema validation

testing framework

logging solution

configuration validation
```

---

# Decision method

The final M01 decision should document:

```text
selected runtime

selected framework

database access strategy

migration tooling

validation tooling

testing tooling

logging tooling

reason for selection
```

---

# Decision

**Status:** ACCEPTED
**Decision Date:** 2026-10-15

## Selected Stack

- **Runtime:** Node.js 24 LTS
- **Language:** TypeScript, strict mode
- **Module system:** ESM
- **Package/workspace manager:** pnpm
- **HTTP framework:** Fastify
- **Runtime/API schema validation:** TypeBox + Fastify/Ajv
- **Fastify type provider:** @fastify/type-provider-typebox
- **API/OpenAPI schema strategy:** JSON Schema + @fastify/swagger
- **PostgreSQL driver:** pg
- **Database query layer:** Kysely
- **Migration tooling:** Kysely Migrator
- **Testing:** Vitest
- **PostgreSQL integration testing:** Testcontainers for Node.js (when a container runtime is available)
- **Structured logging:** Pino through Fastify
- **Architecture:** Modular Monolith

## Important Implementation Rules

1. **Kysely is the selected database layer.** Do not use Prisma or any other ORM as an alternative.
2. **PostgreSQL NUMERIC(18,2) must never be converted to JavaScript Number for financial calculations.** Floating-point arithmetic is forbidden for monetary values.
3. **Monetary persistence uses PostgreSQL NUMERIC(18,2).** This is the canonical storage format.
4. **Monetary API representation uses decimal strings.** All money values in API requests/responses must be serialized as strings (e.g., `"35.00"`).
5. **PostgreSQL/pg boundaries should preserve monetary values without floating-point conversion.** The `pg` driver must be configured to return NUMERIC columns as strings.
6. **A dedicated decimal arithmetic strategy/library will be selected when the Money Value Object is implemented;** do not add one yet.
7. **Runtime validation is not provided by TypeScript alone.** TypeBox + Ajv must enforce schema validation at runtime.
8. **Unknown request fields must be rejected according to the frozen API contract, not silently stripped.** This behavior must later have explicit tests.
9. **Node.js support target is Node 24 LTS,** not an unrestricted ">=24".
10. **The stack must preserve explicit PostgreSQL transactions, row locking and SELECT ... FOR UPDATE capabilities.** Kysely must be used in a way that does not abstract away these critical financial features.

## Rationale

This stack was selected because it satisfies all frozen architectural requirements:

- **PostgreSQL Fidelity:** Kysely provides type-safe SQL access while preserving full control over transactions, row locking (`SELECT ... FOR UPDATE`), and NUMERIC precision.
- **Strict Validation:** TypeBox + Ajv ensures runtime schema validation, rejecting unknown fields and invalid types before they reach the domain layer.
- **Financial Correctness:** By keeping NUMERIC values as strings through the pg driver boundary and using decimal-string API representation, floating-point errors are avoided.
- **Testability:** Vitest provides fast unit testing; Testcontainers enables real PostgreSQL integration tests with proper concurrency and locking semantics.
- **Maintainability:** TypeScript strict mode + ESM + pnpm workspace provides a clean, modern development experience with strong compile-time safety.
- **Performance:** Fastify + Pino offers high-throughput HTTP handling with structured, performant logging.
- **Deployment:** Node.js applications containerize easily within the existing VPS Docker architecture without requiring Kubernetes or service mesh.

---

# Forbidden consequence

The stack decision must not change:

```text
Transaction model

Refund semantics

Book model

Inbox model

Confirmation model

API security model

backup requirements

VPS shared-infrastructure architecture
```

simply because a framework prefers another structure.

---

# Acceptance criteria for closing ADR

This ADR may move to:

```text
ACCEPTED
```

when M01 demonstrates that the selected stack can satisfy:

```text
[ ] PostgreSQL transactions

[ ] row locking

[ ] NUMERIC money

[ ] migrations

[ ] strict schemas

[ ] API authentication/scopes

[ ] optimistic locking

[ ] structured logging

[ ] unit tests

[ ] PostgreSQL integration tests

[ ] Docker execution

[ ] maintained dependency ecosystem
```

---

# Required updates after decision

When accepted, update:

```text
ADR-001
PROJECT_STATE.md
README.md
```

and implementation bootstrap files.

Canonical frozen architecture documents should only be changed if the stack exposes a genuine blocker under the Freeze rules.

---

# Revisit conditions

Revisit only if:

```text
selected stack becomes unmaintained

critical PostgreSQL behavior cannot be implemented safely

security maintenance becomes unacceptable

deployment becomes technically impossible

testing critical financial invariants becomes impossible
```

Preference alone is not sufficient.

---

# Current state

```text
STATUS
ACCEPTED

OWNER MILESTONE
M01 — Local Bootstrap

BLOCKING M01?
No, this decision is part of M01 and is now complete.

BLOCKING M02?
No. Stack/database tooling is now established.
```