# Librélula Agent Task Protocol

This document defines the lifecycle of work performed by autonomous or semi-autonomous coding agents in Librélula.

`AGENTS.md` remains the highest-priority operating policy. This protocol describes how an individual task moves from intake to human-reviewed completion.

## 1. Goals

Every agent task should be:

- isolated
- traceable
- reproducible
- validated
- reversible
- reviewable by a human

Agents optimize for safe completion, not maximum speed.

## 2. Task identity

Every task must have a unique task ID before implementation begins.

Recommended IDs:

- GitHub issue number, for example `42`
- orchestrator-generated ID, for example `DEV-0042`

The task ID must be reused in the branch name, task record, logs, and pull request.

## 3. Required task record

The orchestrator should maintain a machine-readable record with at least:

- `id`
- `title`
- `status`
- `risk`
- `requested_by`
- `branch`
- `worktree`
- `scope`
- `acceptance_criteria`
- `files_changed`
- `validation`
- `commit_sha`
- `pull_request`
- `blockers`
- `created_at`
- `updated_at`

Suggested shape:

```json
{
  "id": "DEV-0042",
  "title": "Fix mobile rating control",
  "status": "running",
  "risk": "low",
  "branch": "agent/DEV-0042-fix-mobile-rating",
  "worktree": "worktrees/DEV-0042",
  "scope": ["frontend/src/components/RatingControl.jsx"],
  "acceptance_criteria": [
    "Rating can be changed on mobile",
    "Existing desktop behavior is unchanged"
  ],
  "files_changed": [],
  "validation": {
    "command": "npm --prefix frontend run validate",
    "status": "pending"
  },
  "commit_sha": null,
  "pull_request": null,
  "blockers": []
}
```

Do not store credentials, tokens, user data, or other secrets in task records or logs.

## 4. Task states

Use a small deterministic state machine:

- `queued` — accepted but not started
- `running` — agent is actively working
- `blocked` — human/orchestrator input is required
- `validation_failed` — implementation exists but validation is failing
- `review_ready` — validated branch and PR are ready for review
- `changes_requested` — reviewer requested additional work
- `approved` — human approval has been granted
- `done` — human-approved work has been merged or otherwise completed
- `cancelled` — task intentionally stopped

Agents must never silently convert a blocked or failed task into `done`.

## 5. Risk levels

### Low

Examples:

- scoped UI bug fix
- copy change
- test addition
- small internal refactor with unchanged behavior

May be implemented autonomously within the rules in `AGENTS.md`.

### Medium

Examples:

- meaningful behavior change
- multi-module refactor
- performance-sensitive change
- deployment-related configuration that is non-destructive

Implementation may proceed only when the task scope is explicit. Human review is mandatory before merge.

### High

Examples:

- authentication changes
- authorization or RLS changes
- Supabase migrations
- dependency changes
- destructive operations
- production infrastructure changes
- handling of sensitive data

Requires explicit human approval before the risky action is performed.

### Prohibited

Anything forbidden by `AGENTS.md` remains prohibited regardless of task risk label.

## 6. Task lifecycle

### Step 1 — Intake

Before editing code, resolve:

- task ID
- goal
- acceptance criteria
- allowed scope
- risk level
- dependencies or blockers

If requirements are too ambiguous to implement safely, set the task to `blocked`.

### Step 2 — Preflight

The agent must:

1. read `AGENTS.md`
2. read this protocol
3. confirm it is not on `main`
4. confirm the working tree/worktree belongs to this task
5. inspect relevant code before changing it
6. identify whether secrets, production infrastructure, Supabase migrations, or generated artifacts are involved

### Step 3 — Isolation

Each active task gets its own branch.

Recommended branch pattern:

`agent/<task-id>-<short-description>`

When multiple agents operate concurrently, each task should also use its own worktree or container. Two agents must not modify the same working directory concurrently.

### Step 4 — Implementation

Agents should make the smallest change that satisfies the acceptance criteria.

Avoid:

- unrelated formatting
- unrelated refactors
- dependency upgrades not required by the task
- generated asset churn
- speculative architecture changes

Record material decisions that a reviewer would need to understand.

### Step 5 — Validation

Before a task can become `review_ready`, run:

`npm --prefix frontend run validate`

The task record must capture whether validation passed or failed.

If validation fails:

- do not claim completion
- set status to `validation_failed`
- diagnose within task scope
- rerun the complete gate after fixes

### Step 6 — Diff review

Before commit, inspect the complete diff and status.

Verify:

- only intended files changed
- no secrets or local data were added
- no unintended `catalogo/` artifacts were included
- no unrelated dependency or lockfile changes appeared
- the diff matches the acceptance criteria

### Step 7 — Commit

Commit only task-scoped, validated work.

Use a concise commit message describing the change.

Do not rewrite shared history or force-push.

### Step 8 — Push and pull request

Agents may push validated `agent/*` branches and open or update pull requests.

Pull requests should use `.github/pull_request_template.md` and include:

- task ID
- concise summary
- files/behavior changed
- validation evidence
- risk assessment
- rollback or recovery notes when relevant
- items requiring human approval

A pull request does not grant permission to merge.

### Step 9 — CI and review

A task cannot be considered review-ready until required CI checks pass.

If CI disagrees with local validation, CI is treated as unresolved and must be investigated.

After requested changes, rerun the complete validation gate and update the PR.

### Step 10 — Human merge gate

Only a human may authorize merge to `main`.

Agents must not:

- merge their own PR
- bypass required checks
- bypass branch protection
- push directly to `main`

### Step 11 — Completion

After human-approved completion, record:

- final status
- final commit/merge SHA when available
- PR number
- validation result
- relevant follow-up work

Branch deletion is not an autonomous agent responsibility unless explicitly authorized.

## 7. Concurrency rules

For parallel agents:

- one task = one branch
- one task = one isolated worktree/container
- one writer per worktree
- shared resources are read-only unless the orchestrator explicitly owns coordination
- tasks touching the same files should be serialized or explicitly coordinated

If two tasks conflict, the orchestrator should block or rebase one task rather than letting agents race.

## 8. Human approval gates

Human approval is mandatory for the categories already defined in `AGENTS.md`, including destructive, security-sensitive, production, authentication, authorization, migration, and merge operations.

The orchestrator should represent pending approval explicitly instead of asking an agent to infer consent.

Recommended approval record:

```json
{
  "required": true,
  "reason": "Supabase migration changes production schema",
  "status": "pending",
  "approved_by": null,
  "approved_at": null
}
```

## 9. Logging expectations

Agent logs should capture actions useful for audit and debugging without leaking secrets.

Useful events include:

- task state changes
- commands executed
- command exit status
- files modified
- validation results
- commit SHA
- pushed branch
- PR number
- blocker reason
- human approval request/result

Do not dump full environment variables, credentials, tokens, private database contents, or unrelated user data into logs.

## 10. Definition of review-ready

A task is `review_ready` only when all of the following are true:

- acceptance criteria have been addressed
- task scope has not expanded unexpectedly
- the complete validation gate passes
- the diff has been reviewed for accidental changes
- no unresolved secret/security issue exists
- the branch has been pushed
- the pull request is up to date
- CI is passing
- human-review items are clearly disclosed

## 11. Definition of done

For agent-driven development, `done` does not mean "the agent finished coding."

It means the requested work completed the required human-controlled workflow and has a recorded final outcome.

SAFE + AUDITABLE + REVERSIBLE + REVIEWABLE AUTONOMY remains the governing principle.