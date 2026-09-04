# ADR-002 — UUID Strategy

**Status:** PROPOSED — Validation required during M01  
**Date:** 2026-09-04  
**Project:** Finance Intelligence Hub  
**Decision scope:** Canonical primary identifier generation

---

# Context

Finance Intelligence Hub entities use UUID identifiers.

The frozen architecture establishes:

```text
UUIDv7 preferred
```

while allowing:

```text
UUIDv4
```

as a fallback if the selected implementation stack does not provide reliable maintained UUIDv7 support.

The UUID choice must not block implementation unnecessarily.

---

# Goals

Identifiers should provide:

```text
global uniqueness

safe distributed generation

no central sequence dependency

good database behavior

simple API representation

stable long-term support
```

---

# Preferred decision

Use:

```text
UUIDv7
```

for new canonical entity IDs when supported reliably by the selected runtime/library.

---

# Why UUIDv7 is preferred

UUIDv7 provides time-ordered characteristics while maintaining UUID semantics.

This can improve database index locality compared with fully random UUID generation.

It also remains suitable for application-generated identifiers.

---

# UUID generation location

Preferred:

```text
application layer
```

rather than depending on a specific PostgreSQL extension unless there is a strong implementation reason.

This keeps identifier generation portable across:

```text
local development

test

Lab

Production
```

---

# Canonical PostgreSQL type

Regardless of UUID version:

```text
UUID
```

should be used for canonical UUID columns in PostgreSQL.

Do not store UUIDs as arbitrary text without a specific reason.

---

# API representation

UUIDs are serialized using their standard textual form.

Example:

```text
019...
```

The API contract should not require clients to understand the UUID version.

---

# Human references

UUIDs are not intended to be manually dictated or typed frequently by the user.

Transactions may additionally expose:

```text
human_ref
```

for human-friendly interaction.

Example:

```text
A83K2P
```

`human_ref` does not replace the canonical UUID primary key.

---

# M01 validation

The chosen stack must verify:

```text
availability of a maintained UUIDv7 implementation

library maintenance status

correct UUIDv7 generation

database compatibility

test-environment compatibility
```

---

# Required tests

At minimum:

```text
generated IDs are valid UUIDs

IDs are unique across large synthetic samples

UUIDv7 values are generated correctly if selected

IDs round-trip through PostgreSQL UUID columns

IDs serialize correctly through the API
```

---

# Fallback

If reliable UUIDv7 support is unavailable in the selected stack:

```text
UUIDv4
```

is an acceptable V0.1 fallback.

---

# Fallback rule

Do not build:

```text
custom home-grown UUIDv7 algorithm
```

merely to preserve UUIDv7 preference.

A mature UUIDv4 implementation is preferable to an unsafe custom UUIDv7 implementation.

---

# Fallback procedure

If UUIDv4 is required:

```text
1. document technical evidence
2. update this ADR
3. mark UUIDv4 as ACCEPTED
4. update PROJECT_STATE.md
```

This does not require reopening the entire architecture.

---

# Schema impact

Both accepted alternatives use:

```text
PostgreSQL UUID
```

Therefore the UUID-version decision should not materially alter:

```text
foreign keys

API identifier types

repository contracts

domain relationships
```

---

# Security consideration

UUIDs must not be treated as authorization mechanisms.

Knowing a resource UUID does not grant permission to access the resource.

Authorization must remain explicit.

---

# Decision

Current preferred baseline:

```text
UUIDv7
```

subject to M01 implementation validation.

Fallback:

```text
UUIDv4
```

only if the selected maintained stack lacks reliable UUIDv7 support.

---

# Decision status transition

If UUIDv7 validation succeeds:

```text
PROPOSED
↓
ACCEPTED — UUIDv7
```

If validation fails:

```text
PROPOSED
↓
ACCEPTED — UUIDv4 fallback
```

with the reason documented here.

---

# Consequences

Positive:

```text
stable UUID-based schema

application-generated identifiers

no central numeric sequence dependency

human_ref remains independent
```

Potential cost:

```text
UUIDv7 library dependency
```

which must be maintained and justified.

---

# Revisit conditions

Revisit only if:

```text
selected UUID implementation becomes unsupported

material database compatibility issue is found

critical security or correctness issue appears
```

Do not revisit solely to change identifier aesthetics.

---

# Current state

```text
STATUS
PROPOSED

PREFERENCE
UUIDv7

FALLBACK
UUIDv4

VALIDATION
PENDING M01
```