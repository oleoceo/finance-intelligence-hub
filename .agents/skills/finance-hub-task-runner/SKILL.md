---
name: finance-hub-task-runner
description: Execute an authorized Finance Intelligence Hub implementation task end-to-end with repository authority routing, strict scope control, self-healing validation, Git branch/PR workflow, GitHub Actions CI, human review gates, and closure discipline. Use when asked to implement, continue, correct, validate, finalize, or close a Finance Hub task such as M03-T04, M03-T05, or later milestone tasks.
---

# Finance Hub Task Runner

Use this skill for implementation work in the Finance Intelligence Hub repository.

The objective is high engineering quality with low human operational overhead.

Normal code, build, test, formatting, dependency, fixture, PostgreSQL, Docker, Testcontainers, Git, or CI failures are the agent's responsibility to investigate and fix autonomously.

Do not return ordinary intermediate failures to the human.

---

## 1. Establish authority before editing

Read repository authority in this order:

1. explicit human-authorized task or correction
2. `AGENTS.md`
3. frozen decision ledger
4. relevant frozen canonical documents
5. `PROJECT_STATE.md`
6. accepted ADRs
7. selected active task contract
8. milestone overview
9. current code and tests

If the selected task provides a bounded implementation decision that is permitted by higher authority, follow the task.

Never silently override frozen decisions.

If a genuine contradiction exists between the authorized task and higher frozen authority, stop with a human blocker before implementation.

Do not reopen already accepted tasks unless the current task exposes an objective regression.

---

## 2. Confirm task boundary

Before implementation, identify:

- current milestone
- selected task ID
- prerequisites
- allowed implementation surface
- explicitly excluded future behavior
- expected tests
- state after successful implementation

Implement only the selected authorized task.

Do not opportunistically implement later tasks.

Examples:

- do not implement API routes before the API task
- do not implement runtime rule matching during configuration work
- do not access Lab/Production before Gate 0 authorization
- do not introduce migrations when existing accepted schema already supports the task
- do not invent business rules absent from authority

Avoid speculative abstractions.

Prefer explicit domain/application code over generic CRUD/BaseRepository/BaseUseCase frameworks unless existing demonstrated duplication justifies an abstraction.

---

## 3. Preserve architecture direction

The accepted dependency direction is:

`API -> Core`

`API composition -> Database`

`Database -> Core contracts`

Core must not depend on:

- Database package
- Kysely
- pg
- Fastify
- infrastructure-specific transaction objects

Core owns:

- domain behavior
- application behavior
- validation policy
- domain/application errors
- repository/read/transaction ports

Database owns:

- PostgreSQL
- Kysely implementations
- SQL persistence
- PostgreSQL locking mechanics
- infrastructure error translation

Do not use deep `/src/...` imports across packages.

Expose legitimate shared behavior through package public APIs.

---

## 4. PostgreSQL and concurrency discipline

PostgreSQL is canonical Source of Truth.

For configuration concurrency, preserve the repository's accepted lock protocol.

Total lock rank:

1. Books
2. Accounts
3. Categories
4. Merchants
5. Classification Rules
6. Authorized Senders

Within each entity kind, lock UUIDs in ascending deterministic order.

Preliminary reads may discover reference IDs only.

After locking:

- re-read authoritative state
- merge effective PATCH state
- validate invariants
- write

If reference discovery changes and the current lock set is incomplete:

- roll back the whole transaction
- restart with the corrected ordered lock set
- never acquire an earlier-ranked lock after a later-ranked lock
- bound retries
- surface the accepted concurrency error after exhaustion

Do not use Redis, process-local mutexes, sleeps, or higher isolation as substitutes for the accepted PostgreSQL locking protocol.

When the task requires concurrency proof, use real PostgreSQL with independent connections and deterministic barriers.

Do not claim concurrency correctness from `Promise.all()` alone.

---

## 5. Environment authority

Primary development repository on Windows may be authoritative for Git state when established by project documentation.

The accepted runtime/test environment is native WSL2 Ubuntu unless project state changes.

Current established toolchain must be read from repository/project state before assuming versions.

Do not copy generated `dist` artifacts between Windows and Linux.

If incremental build state appears stale:

- remove generated `dist`
- remove relevant `*.tsbuildinfo`
- rebuild inside the authoritative runtime

Do not treat Docker absence in a Windows-side shell as a blocker before attempting the established WSL environment.

---

## 6. Dependency and lockfile hygiene

Use existing approved dependencies whenever possible.

Do not upgrade unrelated packages.

When adding a dependency:

- use the exact project-approved version when one already exists
- declare it in the package that directly imports it
- update only required lockfile semantic metadata

Thousands of formatting-only `pnpm-lock.yaml` changes are unacceptable.

Never run Prettier over `pnpm-lock.yaml`.

A regenerated lockfile must not be accepted merely because frozen install passes if most of the diff is serialization churn.

---

## 7. Test ownership

Tests must prove the task contract, not merely exercise code paths.

Use:

- Core unit tests for domain/application policy
- real PostgreSQL integration tests for persistence, constraints, transactions, locks and concurrency
- existing canonical Testcontainers/migration infrastructure

Do not create a second integration framework.

Inspect accepted migrations and existing passing fixtures before writing synthetic SQL.

Do not weaken database constraints to make tests pass.

Do not change production behavior solely to accommodate an incorrect fixture.

Never accept:

- skipped required task tests
- a required suite reporting `0 test`
- mocked concurrency when the contract requires PostgreSQL concurrency
- sleep-based race correctness
- loss of previous accepted regression suites

---

## 8. Self-healing implementation loop

Own the complete implementation cycle.

After implementation, run focused checks.

If any normal failure appears:

1. inspect the failure
2. determine whether implementation, fixture, environment, dependency ownership, formatting, or stale generated output is wrong
3. correct it within the selected task scope
4. rerun the focused failing check
5. rerun broader validation
6. continue until green

Normal failures are NOT human blockers.

Examples:

- TypeScript errors
- lint failures
- Prettier failures
- unit failures
- integration failures
- PostgreSQL constraint failures from bad fixtures
- Testcontainers issues that can be resolved using the established environment
- stale build artifacts
- lockfile consistency
- race-test failures
- CI failures
- Git branch/worktree issues that can be resolved safely

Do not return after fixing only the first failure.

---

## 9. Human blocker definition

Stop early only when progress requires something the agent genuinely cannot decide or obtain safely.

Examples:

- architecture/frozen-authority contradiction
- missing human business decision
- credential or permission unavailable to the agent
- destructive live-infrastructure operation requiring explicit approval
- access to Lab/Production not authorized
- irreversible data action
- ambiguous security decision not bounded by existing authority

When blocked, return:

- exact blocker
- investigation already performed
- why repository/environment cannot resolve it
- one specific human decision or action required

Do not label an ordinary failing test as a blocker.

---

## 10. Git workflow for implementation tasks

Unless the human explicitly authorizes direct-main work, use a feature branch.

Recommended branch form:

`<task-id-lowercase>-<short-description>`

Example:

`m03-t04-rules-senders`

Do not push directly to `main`.

After the implementation is locally coherent:

1. commit to the feature branch
2. push the feature branch
3. create a Draft PR targeting `main`
4. keep task state `REVIEW REQUIRED`
5. run CI
6. inspect CI failures
7. self-heal and push corrections to the same branch
8. repeat until CI GREEN

Use the authenticated GitHub CLI or available GitHub tooling.

A detached local validation worktree is not by itself a blocker; use explicit repository/head/base arguments where appropriate.

Do not merge without explicit human authorization.

---

## 11. GitHub CI is an authoritative independent validator

When the repository workflow executes the required Linux/PostgreSQL/Testcontainers suite, treat its result as the independent final execution proof for the exact PR head.

CI GREEN does not automatically mean human acceptance.

The sequence is:

implementation
-> self-healing
-> Draft PR
-> CI GREEN
-> REVIEW REQUIRED
-> human review
-> corrections if required
-> CI GREEN
-> human acceptance

Do not mark a task DONE before human acceptance.

---

## 12. Human review correction loop

When human review identifies concrete defects:

- preserve the existing feature branch and PR
- fix all listed issues in one consolidated pass where possible
- do not reopen unrelated architecture
- add regression coverage for each defect
- rerun CI
- remain REVIEW REQUIRED

Do not respond to each normal correction with another human-operated diagnostic cycle.

Use repository and CI evidence directly.

---

## 13. Closure after human acceptance

Only after explicit human acceptance:

- move the task from `docs/tasks/active/` to `docs/tasks/completed/`
- mark the task DONE
- update `PROJECT_STATE.md`
- update milestone overview
- set the next allowed task
- remove stale REVIEW REQUIRED statements
- record exact accepted evidence
- keep documentation concise and current rather than appending diary-style history

Closure must not alter implementation unless explicitly requested.

If closure changes documentation only, do not waste resources rerunning the entire local application suite solely for documentation.

Push closure to the existing feature branch/PR and allow CI to validate the final PR head.

Do not merge yet unless explicitly authorized.

---

## 14. Merge policy

After:

- implementation accepted by human
- closure accepted
- final PR CI GREEN
- explicit merge authorization

prefer Squash Merge unless repository/task instructions say otherwise.

Use a concise task-level commit title.

When tooling supports it, provide the expected PR head SHA so the merge fails safely if the branch changed after review.

After merge:

- verify `main` points to the expected merge/squash commit
- verify post-merge `main` CI
- only then consider the task fully integrated

Do not start the next implementation task before the previous merge/state transition is coherent unless explicitly authorized.

---

## 15. Scope verification before returning

Inspect:

- complete Git status
- changed-file list
- frozen-doc changes
- migrations
- package manifests
- lockfile
- completed prior task records
- future task contracts
- unexpected API or future-milestone implementation
- Core infrastructure imports

Run repository hygiene checks appropriate to the task, including `git diff --check`.

Never claim protected paths are unchanged without checking them.

---

## 16. Final implementation report

When implementation is ready for human review, return one compact report containing:

- task ID
- branch
- Draft PR
- PR head SHA
- implementation summary
- exact changed files or concise grouped surface
- exact unit test files/test totals
- exact integration files/test totals
- task-specific test totals
- critical concurrency/invariant evidence
- lint/format/build/typecheck status
- lockfile status
- migration/frozen/security impact
- scope verification
- remaining nonblocking warnings

End with:

`Status: REVIEW REQUIRED`

Do not mark DONE.

---

## 17. Efficiency rule

Optimize for fewer human round trips, not fewer safeguards.

Efficiency means:

- investigate failures yourself
- batch related corrections
- reuse repository authority
- use CI directly
- avoid redundant full reviews
- avoid rerunning expensive suites when only documentation changed
- preserve rigorous tests for financial, concurrency, authorization and persistence behavior

Never interpret efficiency as permission to skip a required invariant, test, security boundary, or acceptance gate.
