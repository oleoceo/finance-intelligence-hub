# ADR-001 — Application Implementation Stack

**Status:** OPEN — Decision required during M01  
**Date:** 2026-09-04  
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

```text
NOT YET DECIDED
```

Do not select an implementation stack before M01 evaluation.

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
OPEN

OWNER MILESTONE
M01 — Local Bootstrap

BLOCKING M01?
No, this decision is part of M01.

BLOCKING M02?
Yes. Stack/database tooling must be established before database implementation proceeds.
```