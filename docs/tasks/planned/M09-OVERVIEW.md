# M09 — Backup / Restore

**Status:** PLANNED
**Dependencies:** M08 accepted; Gate 0 evidence required for operational execution
**Blocks:** Gate C

**Activation Review:** [Draft for independent review](M09-ACTIVATION-REVIEW.md). M09 remains PLANNED; P01–P04 local/CI eligibility is proposed only. P05–P06 require formal Gate 0 PASS and separate operational authorization. No M09 implementation is authorized by this documentary review.

> **This document does NOT authorize implementation.**
> Provisional task decomposition and scope are defined here. Execution-ready
> contracts are finalized during Activation Review.

---

## 1. Objective

Make Finance Hub recoverable:

- Daily encrypted backups of Finance Hub application data only
- Off-site copy via Restic + rclone to Google Drive
- Retention policy enforced
- Restore runbook validated by actual isolated restore
- Production untouched during restore validation

---

## 2. Stable Requirements

### Backup Scope
- `finance_hub_prod` custom-format pg_dump ONLY
- Finance Hub application data only
- Do NOT routinely pg_dumpall shared postgres-products
- Roles/grants recreatable through versioned bootstrap/infrastructure scripts with externally injected secrets; normal `finance_hub_app` runtime role remains non-superuser and least privilege

### Storage Layout
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

### Local Retention
- 2–3 recent dumps kept locally

### Off-Site
- Encrypted Restic repository
- rclone to Google Drive
- Google Drive is NOT a runtime dependency

### Scheduler
- Prefers systemd timer
- Daily execution
- RPO <= 24h
- Same-day RTO target

### Retention Policy
- 14 daily
- 8 weekly
- 12 monthly

### Integrity
- Weekly repository check
- Backup failures visible (logging/alerting)

### Restore
- Restore runbook documented
- Isolated restore environment (e.g., `finance_hub_restore_test`)
- Production untouched during restore validation
- Recovery secrets stored outside VPS
- Monthly isolated restore after go-live

### Restore Validation Must Verify
- Roles/bootstrap scripts work under an explicitly authorized, appropriately privileged recovery/bootstrap identity; resulting roles/grants match the accepted model without elevating the normal runtime application role
- API connects to restored database
- Books present and correct
- Accounts present and correct
- Transactions present with correct amounts/statuses
- Refund relationships intact
- Audit trail complete
- Summary produces correct values from restored data

---

## 3. Exclusions

- Shared postgres-products pg_dumpall (not routine)
- Production mutations during restore validation
- Dashboard/Metabase backup (post-V0.1)
- Firefly adapter backup (post-V0.1)
- Real-time replication or streaming backup

---

## 4. Operational Conditionality

### Design Phase (No Gate 0 Required)
- Backup script structure and layout contract
- Restic/rclone configuration template
- Scheduler unit file template
- Restore runbook documentation
- Retention policy implementation logic

### Execution Phase (Gate 0 Evidence Required)
- Actual container names for postgres-products
- Actual network names and connectivity
- Host UID/GID for filesystem ownership
- Real secrets injection mechanism
- Actual Google Drive rclone remote configuration
- Systemd timer installation on real host

Do NOT freeze concrete container names, network names, host UID/GID, filesystem ownership, real secrets, or postgres-products runtime details until Gate 0 evidence and M09 Activation Review.

---

## 5. Provisional Task Decomposition

| Task ID | Goal | Key Deliverables |
|---------|------|-----------------|
| **M09-P01** | Backup scripts/layout/bootstrap contract | pg_dump wrapper, directory structure, bootstrap role recreation scripts, secret injection interface |
| **M09-P02** | Restic/rclone encrypted off-site flow | Restic init/backup/forget commands, rclone sync, encryption key management, Google Drive remote config template |
| **M09-P03** | Scheduler/retention/check/failure visibility | systemd timer unit, retention enforcement, weekly repo check, failure logging/notification |
| **M09-P04** | Restore runbook and isolated environment procedure | Step-by-step restore instructions, isolated DB creation, bootstrap execution, validation checklist |
| **M09-P05** | Executed isolated restore + validation | Actual restore performed, all validation items verified, evidence captured |
| **M09-P06** | M09 milestone verification | Daily backup running, off-site copy confirmed, retention verified, restore evidence recorded |

Execution-ready proposed contracts: [P01](M09-P01.md), [P02](M09-P02.md), [P03](M09-P03.md), [P04](M09-P04.md), [P05](M09-P05.md), [P06](M09-P06.md). These remain PLANNED pending independent acceptance and task-specific activation.

---

## 6. Required Test Categories

### Script/Unit Tests
- Backup script produces valid pg_dump custom format
- Retention policy correctly prunes old snapshots
- Restore/bootstrap uses an explicitly authorized, appropriately privileged recovery/bootstrap identity; resulting roles/grants match the accepted model and normal `finance_hub_app` remains non-superuser/least privilege
- CSV/validation scripts detect missing data

### Integration / Operational Tests
- Backup completes within expected window
- Restic repository check passes
- rclone sync succeeds to Google Drive
- Isolated restore produces functional database
- Restore/bootstrap grants no privilege escalation to the normal runtime application role
- API connects to restored database and returns correct data
- Summary on restored data matches expected values

### Acceptance Scenarios
- Daily backup executes and produces artifact
- Off-site copy exists and is encrypted
- Retention policy enforced (correct snapshot count)
- Weekly repo check passes
- Backup failure produces visible log/alert
- Isolated restore completes successfully
- Restored environment passes all validation items
- Production database untouched during restore validation

---

## 7. Gate Dependencies

| Gate | Required? | Notes |
|------|-----------|-------|
| Gate A | YES | Indirectly (via full milestone chain) |
| Gate 0 | YES | Required for operational execution; design may proceed without it |
| Gate B | YES | Indirectly (via M08 dependency) |
| Gate C | THIS milestone leads to Gate C | Gate C validates M09 output including actual restore |

---

## 8. Known Risks Deferred to Activation Review

- Actual postgres-products container name and connection string
- Host UID/GID for `/opt/apps/backups/` ownership
- Whether systemd is available and preferred over cron on target host
- Google Drive rclone remote provisioning mechanism
- Restic encryption key storage and recovery procedure
- Whether existing backup posture (Gate 0 finding) affects baseline
- Appropriate recovery/bootstrap identity and privileges in the actual PostgreSQL environment (Gate 0/M09 Activation Review)
- Actual network path from backup location to postgres-products

---

## 9. Frozen Document Routing

Per AGENTS.md §6:
- `07-SECURITY.md`
- `08-BACKUP-RESTORE.md`
- `09-ROADMAP-TESTS.md`
