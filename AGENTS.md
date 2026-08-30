# AGENTS.md — Librélula Agent Operating Manual

## 1. Purpose

This file defines the mandatory operating rules for any AI coding agent working on Librélula.

Agents must read this file before inspecting, modifying, testing, committing, or proposing code.

If older project documentation conflicts with this file, this file takes precedence for agent behavior.

---

## 2. Current architecture

Librélula is currently treated as:

- Frontend: React 19
- Build tool: Vite 8
- Main frontend source: `frontend/src/`
- Current data/auth platform: Supabase
- Production hosting/build integration: Vercel
- Generated production frontend output: `catalogo/`
- Legacy code still exists in PHP/API/SQLite-related areas.

The legacy SQLite database is NOT the current source of truth.

Never recreate, commit, restore, or replace:

`database/librelula.db`

The file is intentionally excluded from Git.

---

## 3. Source-of-truth rules

Prefer modifying source files instead of generated files.

Primary frontend source:

`frontend/src/`

Supabase schema and migrations:

`supabase/`

Generated build output:

`catalogo/`

Do not manually edit hashed files inside:

`catalogo/assets/`

unless a task explicitly requires working with generated deployment artifacts.

Older files and documentation may describe previous PHP + SQLite architecture.
Do not assume legacy architecture is authoritative.

---

## 4. Installation

From repository root:

`npm --prefix frontend ci`

Do not replace `npm ci` with `npm install` unless dependency changes are intentionally required.

Do not update dependencies without an explicit task requiring it.

---

## 5. Development

Frontend development:

`npm --prefix frontend run dev`

Production build:

`npm --prefix frontend run build`

Lint:

`npm --prefix frontend run lint`

Tests:

`npm --prefix frontend run test`

The automated test suite uses Node's built-in test runner.

---

## 6. Mandatory validation

Before declaring a code task complete, agents must run:

`npm --prefix frontend run validate`

This is the canonical validation gate. It currently runs:

1. ESLint.
2. The automated test suite.
3. A production Vite build into a temporary directory.
4. `git diff --check HEAD`.
5. `git status --short`.

Agents may run the individual commands while debugging, but the complete validation gate must pass before a task is declared complete.

A task is not complete when lint, tests, build, or diff validation fails.

---

## 7. Generated build artifacts

Vite currently writes production output into:

`catalogo/`

The build can delete old hashed assets and create new hashed assets.

Agents must distinguish between:

- source-code changes
- generated build artifacts

Do not accidentally commit generated `catalogo/assets/*` changes merely because a validation build produced them.

Until the repository deployment policy is changed, generated artifacts must be reviewed explicitly before inclusion in a commit.

Never treat `catalogo/` as the source implementation of a feature.

---

## 8. Git safety

Agents MUST NOT work directly on `main`.

Each task must use its own branch.

Recommended pattern:

`agent/<task-id>-<short-description>`

Examples:

`agent/42-fix-book-rating`
`agent/57-mobile-profile-spacing`

Agents may:

- inspect files
- modify files within task scope
- run approved local commands
- create commits on their task branch

Agents must NOT automatically:

- force-push
- rewrite Git history
- delete remote branches
- push directly to `main`
- merge into `main`
- bypass branch protections
- change GitHub repository visibility
- delete the repository

Human approval is required before merge to `main`.

---

## 9. Secrets and sensitive data

Never read, print, commit, transmit, or expose secrets unnecessarily.

Never commit:

- `.env`
- `.env.*`
- API secrets
- service-role credentials
- database dumps
- user exports
- private keys
- authentication tokens
- local databases
- backup files containing user information

Public frontend Supabase configuration must be treated separately from privileged credentials.

Never introduce Supabase `service_role` credentials into frontend code.

If sensitive information is discovered:

STOP the task and report it.

Do not copy it into logs or task summaries.

---

## 10. Supabase safety

Supabase is treated as production-sensitive infrastructure.

Agents may inspect versioned schema and migrations.

Agents must NOT autonomously:

- delete production data
- truncate tables
- disable RLS
- weaken access policies
- execute destructive migrations
- alter authentication configuration
- rotate credentials
- modify production secrets

Any potentially destructive database operation requires explicit human approval.

Prefer additive, reversible migrations.

---

## 11. Scope discipline

Agents must modify only what is required for the assigned task.

Avoid unrelated refactors.

Do not:

- rename unrelated files
- reformat the entire project
- upgrade unrelated dependencies
- redesign unrelated components
- rewrite working modules without justification

Keep diffs small and reviewable.

---

## 12. Legacy code

PHP, legacy API files and old local database-oriented code still exist in the repository.

Do not delete or migrate legacy code merely because it appears unused.

Legacy cleanup must be a dedicated task with explicit approval.

If uncertain whether code is current or legacy:

STOP and ask the orchestrator/reviewer.

---

## 13. Backups

Do not create `.bak` files inside the repository.

Git is the version-control mechanism.

Temporary agent backups must live outside the repository workspace or inside an isolated disposable sandbox.

---

## 14. Encoding

Preserve UTF-8.

Librélula contains Spanish text and accented characters.

Never introduce encoding corruption such as broken:

- á
- é
- í
- ó
- ú
- ñ
- ¿
- ¡

---

## 15. Agent decision levels

### Safe — autonomous

Agents may perform without human approval:

- read repository files
- search code
- create task branches
- edit scoped source code
- run lint
- run build
- run tests
- inspect Git diff/status
- create local commits on agent branches
- push validated agent task branches to the remote repository
- open or update pull requests from agent branches

### Review required

Human approval is required before:

- pushing a major architectural change
- adding or removing dependencies
- modifying Supabase migrations
- changing authentication behavior
- changing permissions/RLS
- modifying deployment configuration
- deleting significant code
- modifying generated deployment strategy

### Forbidden without explicit instruction

- force push
- history rewrite
- production database deletion
- exposing secrets
- merging directly to main
- disabling security controls
- deleting the repository

---

## 16. Completion report

Every completed agent task must report:

### Task
What was requested.

### Changes
Files and behavior changed.

### Validation
Commands executed and results.

### Risks
Any unresolved risks or assumptions.

### Git
Branch name and commit SHA.

### Human review
Anything requiring approval before merge.

---

## 17. Stop conditions

An agent must stop and request human/orchestrator input when:

- requirements are ambiguous enough to risk incorrect behavior
- sensitive credentials are encountered
- destructive database work is required
- production infrastructure would be changed
- architecture is unclear
- a validation command repeatedly fails
- the task would require force-pushing or rewriting history
- required information is unavailable

Never hide uncertainty by guessing.

---

## 18. Core principle

The goal is not maximum autonomy.

The goal is:

SAFE + AUDITABLE + REVERSIBLE + REVIEWABLE AUTONOMY.

Every agent action should leave enough evidence for another developer or reviewer to understand what happened and undo it safely.
