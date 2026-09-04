# ADR-003 — VPS Internal Connectivity

**Status:** OPEN — Gate 0 evidence required  
**Date:** 2026-09-04  
**Project:** Finance Intelligence Hub  
**Decision scope:** Internal connectivity between Finance Hub and existing VPS services

---

# Context

The Finance Intelligence Hub will coexist with existing VPS infrastructure including components such as:

```text
n8n
Evolution API
Redis
PostgreSQL
Nginx Proxy Manager
Portainer
```

The preferred architectural direction is internal service communication.

However, the frozen documentation explicitly requires:

```text
DO NOT ASSUME CURRENT NETWORK MEMBERSHIP
```

before Gate 0 inspection.

---

# Current known architecture preference

Where practical, internal application communication should use:

```text
apps-backend
```

rather than unnecessary public routes.

---

# Unknowns

Before Gate 0, the following must be treated as unknown:

```text
actual n8n Docker networks

actual Evolution Docker networks

actual redis-main network

postgres-products existence

postgres-products network

container DNS reachability

Finance Hub future network attachment

NPM routing requirements
```

---

# Why this ADR remains open

Selecting internal connectivity before inspecting the real VPS could require:

```text
changing shared networks unnecessarily

disconnecting existing services

creating duplicate proxy routes

introducing public exposure

causing downtime
```

Therefore no final connectivity decision will be invented from documentation alone.

---

# Gate 0 evidence required

Inspect:

```text
docker network ls

docker network inspect apps-backend

docker network inspect proxy

docker inspect relevant containers
```

and record only the necessary information.

---

# Services to inspect

At minimum:

```text
n8n

Evolution API

redis-main

postgres-products if present

Nginx Proxy Manager
```

---

# PostgreSQL requirement

PostgreSQL must remain:

```text
internal only
```

No public PostgreSQL port is required for Finance Hub.

---

# Redis requirement

Redis must remain:

```text
internal only
```

No public Redis port is allowed.

---

# Finance API connectivity

Preferred final model if supported by Gate 0 evidence:

```text
n8n
↓
apps-backend
↓
Finance API
```

using Docker DNS/service naming where practical.

---

# Alternative

If existing topology prevents clean internal n8n access, a controlled HTTP route may be considered.

Example conceptual fallback:

```text
n8n
↓
authenticated HTTPS endpoint
↓
NPM
↓
Finance API
```

This is a fallback, not the default assumption.

---

# Public route security

If an HTTP proxy route becomes necessary, it must still require:

```text
service authentication
finance:ingest scope
strict schemas
AuthorizedSender validation
rate limiting where appropriate
```

NPM or Cloudflare must not be treated as the application's authentication system.

---

# Evolution connectivity

Evolution remains a transport integration.

Possible flow:

```text
Evolution
↓
n8n
↓
Finance API
```

Finance Hub does not need direct Evolution access for the normal inbound pipeline unless implementation later proves otherwise.

---

# Redis connectivity

If Finance Hub eventually needs Redis:

```text
Finance Hub
↓
apps-backend
↓
redis-main
```

with namespace:

```text
finance-hub:
```

No separate Finance Redis should be created casually.

---

# PostgreSQL connectivity

Expected:

```text
Finance Hub
↓
apps-backend
↓
postgres-products
↓
finance_hub_lab / finance_hub_prod
```

subject to Gate 0 proving the service exists and is correctly configured.

---

# `postgres-products` absent scenario

If Gate 0 finds that:

```text
postgres-products
=
ABSENT
```

this ADR does not authorize automatic creation.

Required:

```text
INFRA-T01
Provision postgres-products
```

with explicit human approval.

---

# Shared network protection

Do not:

```text
recreate apps-backend

recreate proxy

disconnect existing containers

rename existing networks

attach every container to every network
```

to simplify the Finance Hub deployment.

---

# Least connectivity principle

Each service should join only the networks needed for its responsibilities.

Example intended separation:

```text
HTTP public service
→ proxy when public exposure is required

internal application communication
→ apps-backend

database/cache
→ apps-backend only
```

subject to actual VPS topology.

---

# NPM

Nginx Proxy Manager should only be involved when external HTTP exposure is genuinely required.

Do not put PostgreSQL or Redis behind NPM.

---

# Gate 0 safety

Inspection should be:

```text
read-only first
```

Do not modify networks during the discovery phase.

---

# Decision options after Gate 0

## Option A — Internal Docker connectivity

```text
n8n
+
Finance Hub
+
required internal services
↓
apps-backend
```

Preferred if current topology permits it safely.

---

## Option B — Controlled authenticated HTTP route

Used only if direct internal connectivity is impractical or conflicts with existing architecture.

Requires documented reason.

---

# Decision

```text
NOT YET DECIDED
```

Final selection requires Gate 0 evidence.

---

# Acceptance criteria for closing ADR

Before changing status to `ACCEPTED`:

```text
[ ] actual Docker networks inspected

[ ] n8n network membership known

[ ] Evolution network membership known

[ ] redis-main network membership known

[ ] postgres-products existence known

[ ] postgres-products network membership known if present

[ ] no public PostgreSQL exposure

[ ] no public Redis exposure

[ ] chosen connectivity tested in Lab

[ ] no existing production service disrupted
```

---

# Required decision record

When closed, update this ADR with:

```text
selected option

actual network names

Finance Hub network membership

n8n-to-Finance route

database route

Redis route if used

whether NPM is involved

reason
```

Do not record secrets.

---

# Consequences

The final decision affects:

```text
Docker Compose

deployment configuration

service hostnames

NPM configuration if needed

firewall exposure

Lab deployment
```

It must not alter financial-domain semantics.

---

# Revisit conditions

Revisit if:

```text
VPS topology materially changes

n8n deployment changes

Finance API exposure requirements change

network security requirements change
```

Do not revisit merely for cosmetic network restructuring.

---

# Current state

```text
STATUS
OPEN

REQUIRED EVIDENCE
Gate 0

PREFERRED DIRECTION
internal apps-backend connectivity

FINAL DECISION
pending
```