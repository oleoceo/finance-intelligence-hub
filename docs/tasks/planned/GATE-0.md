# Gate 0 — VPS Safety Inspection

**Status:** PLANNED
**Type:** Gate (inspection only, no provisioning)
**Dependencies:** Separate authorization (may execute independently of milestone sequence)
**Blocks:** M06 live acceptance, M09 operational execution, any VPS/Lab/Production activity

> **This document does NOT authorize execution.**
> Gate 0 is planning only here. Actual inspection requires separate explicit authorization.

---

## 1. Objective

Inspect the actual VPS **before** any Finance Hub operational changes. Understand the environment exactly as it exists. No assumptions.

---

## 2. Scope

### Included
Read-only inspection and evidence capture of:

- Host CPU/RAM/disk
- Docker/container runtime version
- Running containers (names, images, ports, networks)
- Docker volumes and their mount points
- Docker networks (especially `apps-backend`)
- Portainer presence and configuration
- NPM (Nginx Proxy Manager) presence and proxy hosts
- n8n instance, version, network membership, credential model
- Evolution API instance, version, network membership
- Redis (`redis-main`) instance, network, exposure
- PostgreSQL services (all instances)
- `postgres-products` specifically: existence, health, volume, network, port exposure, credentials model, backup posture
- UFW firewall rules
- Fail2Ban status and jails
- SSH configuration and recovery access
- Filesystem ownership/UID/GID for `/opt/apps` and relevant subdirectories
- Current backup posture (what exists, what doesn't)
- Codex/agent privilege model (current sudoers, user accounts)

### Excluded
- No destructive mutations
- No broad `chmod -R` or `chown -R`
- No production database changes
- No container creation/destruction
- No network modifications
- No firewall changes
- No provisioning (if `postgres-products` is absent, create a separate future authorized INFRA task)

---

## 3. Expected Evidence Categories

Gate 0 must produce a structured evidence record covering:

### Infrastructure Inventory
- Host resources (CPU cores, RAM GB, disk GB/usage)
- Docker Engine version
- Container list with names, images, status, ports, networks
- Volume list with mount points and sizes
- Network list with driver and connected containers

### Service State
For each service (n8n, Evolution, Redis, PostgreSQL instances, Portainer, NPM):
- Running/stopped
- Container name and image
- Network membership (especially `apps-backend`)
- Port exposure (public/internal only)
- Health check result if available

### `postgres-products` Specific
- Exists: YES/NO
- If YES: health, persistent volume, network, public port (must be none), credentials model, backup posture
- If NO: documented as absent; separate INFRA task required before M06/M09 VPS work

### Security Posture
- UFW rules (active, default policies, allowed ports)
- Fail2Ban jails and status
- SSH configuration (port, key-only, root login)
- Public port scan results for PostgreSQL and Redis (must not be exposed)
- Filesystem ownership model for `/opt/apps` tree

### Agent/Codex Privilege Model
- Current user accounts relevant to agent operation
- Sudoers configuration
- Recommended bounded privilege model for Finance Hub operations

### Backup Posture
- Existing backup mechanisms (if any)
- Backup locations and retention
- Restore capability assessment

---

## 4. Evidence Capture Requirements

Evidence must be captured in a form that M06 and M09 Activation Reviews can rely on:

- Exact container names and IDs
- Exact network names and memberships
- Exact volume names and mount paths
- Exact port mappings
- Exact UFW rules
- Exact filesystem ownership (UID/GID) for relevant directories
- Screenshots or command output preserved as artifacts

Evidence should be stored as a Gate 0 closure artifact (location TBD at execution time).

---

## 5. PASS/FAIL Criteria

### PASS
All evidence categories captured. No destructive uncertainty remains. `postgres-products` state definitively known. Security posture understood. Agent privilege model decided.

### FAIL
Critical evidence missing. Destructive uncertainty unresolved. Cannot determine whether VPS changes are safe.

PASS does NOT itself authorize provisioning or deployment. It authorizes subsequent milestones to reference Gate 0 evidence during their own Activation Reviews.

---

## 6. Relationship to Other Milestones

- **M05**: Does NOT require Gate 0. M05 is local/domain work.
- **M06**: Live VPS integration acceptance REQUIRES Gate 0 PASS. Local/static workflow planning may proceed without it.
- **M09**: Operational backup/restore execution REQUIRES Gate 0 evidence. Script/layout design may proceed without it.
- **Gate A**: Independent of Gate 0. Gate A proves Core independence locally.
- **INFRA-T01**: If `postgres-products` is absent, a separate authorized infrastructure task is required before M06/M09 VPS work.

---

## 7. Known Risks

- `postgres-products` may not exist, requiring a separate infrastructure task.
- n8n may not be on `apps-backend`, affecting M06 connectivity approach.
- Current backup posture may be insufficient, affecting M09 baseline.
- Agent privilege model may need refinement before safe operational access.

These are inspection findings, not blockers to planning. They become actionable during Activation Review of dependent milestones.

---

## 8. Frozen Document Routing

Per AGENTS.md §6:
- `03-ARCHITECTURE.md`
- `07-SECURITY.md`
- `08-BACKUP-RESTORE.md`
- `09-ROADMAP-TESTS.md`