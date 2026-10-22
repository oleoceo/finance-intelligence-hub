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

### Remote state + Sync Gate

The GitHub remote (`origin/main`) is the authority for the already-integrated state of the repository.

Before starting a new task:

1. `git fetch origin --prune`
2. inspect all relevant workspaces before synchronizing;
3. preserve unique local work;
4. never use `reset --hard` on an unknown/dirty tree;
5. fast-forward local main when possible;
6. align Windows workspace and WSL worktree to the remote baseline;
7. re-read PROJECT_STATE/overview/task after synchronization;
8. only then create the task branch.

A local working tree that is behind does not redefine the project's canonical state.

### Standing workflow authorization

The human may establish continuous operational authorization.

When standing authorization exists:

- normal corrections;
- self-healing;
- validations;
- documentary closure;
- PR creation;
- CI inspection;
- bookkeeping;
- activation of the next task already selected by handoff;

may proceed without a new human checkpoint, provided they:

- are within already-approved scope;
- do not introduce new architectural/business/security decisions;
- are not destructive;
- do not involve Lab/Production/VPS;
- are not merges.

Explicit authorization continues to be required for:

- merge;
- irreversible actions;
- live infrastructure;
- architectural change;
- new business decisions;
- unfrozen security decisions;
- destructive data changes.

Never interpret standing authorization as generic authorization for future unselected tasks.

The handoff must explicitly name the task being started.

### Remote closure permitted

After technical/human acceptance and CI GREEN, documentary closure may be executed:

- by the local agent;
- or by an authenticated coordinator directly on GitHub.

If remote closure has already been validated, do not require an artificial roundtrip to the agent just to repeat the same edits locally.

The local workspace absorbs the closure at the next task's Sync Gate.

### Post-merge bookkeeping efficient

Avoid creating an independent PR solely to replace:

`PR open/unmerged`

with:

`PR merged`

when no implementation or decision depends on it immediately.

Prefer pre-merge stable wording when possible.

After merge:

- verify squash SHA;
- verify post-merge CI;
- provide this in the handoff;
- record the updated state in the first operational edit of the next task before implementation.

Exception:

if obsolete state blocks or makes an immediate operation ambiguous, perform a narrow post-merge correction before proceeding.

### Mandatory handoff

Add to the workflow that each new task receives a minimal handoff containing:

- previous task;
- merge PR;
- squash SHA;
- post-merge CI;
- current `origin/main` SHA;
- regression test totals;
- selected next task;
- authorization state;
- explicit Sync Gate.

This reduces dependence on agent/conversation memory.

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

Only ACTIVE tasks (under `docs/tasks/active/`) may authorize implementation.
PLANNED documents (under `docs/tasks/planned/`) define stable scope but do NOT authorize implementation.
If a task exists only in PLANNED status, it must pass Activation Review before work begins.
See `docs/tasks/planned/ACTIVATION-REVIEW.md` for the reusable activation contract.

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

Before the first implementation push, mirror the repository CI locally whenever the established environment supports it. Treat the repository workflow as the source of truth for exact commands and ordering. For the current Finance Hub baseline, the expected validation sequence is:

1. frozen dependency install
2. lint
3. format check
4. build
5. typecheck
6. unit tests
7. PostgreSQL integration tests
8. any stricter task-specific checks

Do not skip formatting merely because lint/typecheck pass. Do not claim CI-equivalent validation if one required stage was not actually executed. If a local stage is genuinely unavailable, record that narrowly and let GitHub Actions remain the independent validator instead of presenting the task as fully locally green.

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
- absence of one particular GitHub client when another authenticated GitHub path is available

Do not return after fixing only the first failure.

### Push discipline during self-healing

Do not push speculative or partial corrections while a correction batch is still evolving.

For a normal review/CI correction cycle:

1. inspect the exact failure and current working diff
2. batch all known related corrections locally
3. finish the last edit
4. run the required validation sequence after that last edit
5. inspect `git diff --check`, changed files, test-count/suite deltas, and scope
6. create one coherent correction commit
7. push once
8. evaluate CI for that exact pushed SHA

If the exact-head CI is RED, inspect that exact failing stage/log before editing again. Do not create a chain of speculative pushes that each starts another CI run.

When resuming after an interrupted or long-running agent session, inspect branch, HEAD, status and file diffs before editing. Preserve valid uncommitted work, avoid duplicating already-applied changes, and recover deliberately rather than reapplying the whole correction prompt blindly.

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

Missing `gh` by itself is not a human blocker. Before stopping, inspect whether another authenticated GitHub mechanism is available in the current environment or orchestration layer. Prefer any available provider-neutral GitHub integration/tooling over asking the human to recreate routine PR operations manually.

If no authenticated PR-creation mechanism truly exists after checking available tooling, push the authorized feature branch, report the limitation narrowly, and distinguish "PR creation handoff required" from an implementation blocker. Do not ask the human to repeat diagnostics the agent can already perform.

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

Use authenticated GitHub tooling available in the environment. The workflow must not depend specifically on GitHub CLI; `gh` is one option, not a requirement.

Project skills are vendor-neutral repository assets. The canonical project skill lives only under:

`.agents/skills/<skill-name>/`

Never create, copy, sync, or commit provider-native duplicates under locations such as:

- `.claude/skills/`
- `.codex/skills/`
- `.gemini/skills/`
- other provider-specific skill directories

If an editor/provider materializes a local compatibility copy, treat it as a local artifact and keep it out of the Git diff. Do not add broad ignore rules unless the repository actually needs them and the current authorization permits that change.

A detached local validation worktree is not by itself a blocker; use explicit repository/head/base arguments where appropriate.

Do not merge without explicit human authorization.

---

## 11. GitHub CI is an authoritative independent validator

When the repository workflow executes the required Linux/PostgreSQL/Testcontainers suite, treat its result as the independent final execution proof for the exact PR head.

Record test totals and final evidence from the exact accepted PR head/run. Do not carry forward stale counts from an earlier local run or earlier CI head after tests changed.

Never report CI GREEN from an older commit when the PR head has moved. Verify the reported run's `head_sha` equals the current PR head SHA.

Treat previously accepted GREEN test coverage as a regression baseline. Before pushing test-file rewrites or cleanup:

- compare against the latest relevant GREEN head
- inspect deleted/renamed tests, not only the final pass/fail result
- treat an unexplained drop in discovered test count as a regression signal
- preserve accepted regression scenarios unless a deliberate replacement proves the same contract
- do not target test counts mechanically; explain any intentional reduction before accepting it

A GREEN CI with silently reduced accepted coverage is not sufficient evidence.

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

Regression tests added for review findings must prove the intended success/failure condition precisely. Prefer exact status/code/state/round-trip assertions. Avoid weak assertions such as “not 422” when an unrelated 500 would also pass.

---

## 13. Closure after human acceptance

Only after explicit human acceptance:

- move the task from `docs/tasks/active/` to `docs/tasks/completed/`
- mark the task DONE
- update `PROJECT_STATE.md`
- update milestone overview
- set the next allowed task
- remove stale REVIEW REQUIRED statements
- record exact accepted evidence from the accepted implementation head/run
- keep documentation concise and current rather than appending diary-style history

Before returning closure, perform a semantic stale-state sweep across the closure documents:

- search the current task ID and status words such as `REVIEW REQUIRED`, `PLANNED`, `DONE`, `PARTIAL`
- search old test totals and superseded PR/CI wording
- verify the completed task record says `DONE`
- verify milestone overview header, tables, narrative sections and links agree
- verify moved task links point to `docs/tasks/completed/` where appropriate
- verify `PROJECT_STATE.md` current-state sections consistently name the next allowed task
- preserve genuinely historical evidence, but do not leave historical wording presented as current state

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
- if closure documents were intentionally written before merge and still say the PR is Draft/unmerged, perform a narrow post-merge state correction recording the squash commit and post-merge CI while preserving the accepted implementation head/run
- distinguish “no external dependency upgrade” from authorized workspace/package wiring, and describe security impact precisely rather than using overly broad “no security change” wording
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
- provider-specific duplicate skill files
- stale task status, stale test totals and broken active/completed task links when closing work

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
- exact final GitHub Actions run ID/status for the reported PR head
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
