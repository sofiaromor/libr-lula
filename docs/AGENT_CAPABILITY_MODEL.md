# Librélula Agent Capability Model

This document defines the first least-privilege role model for Librélula's autonomous development runtime.

It complements `AGENTS.md` and `docs/AGENT_TASK_PROTOCOL.md`. `AGENTS.md` remains the highest-priority operating policy.

## 1. Purpose

Agent roles must not inherit a generic "can do everything" toolset.

The runtime separates:

1. **Role capability** — whether a role is even allowed to request a class of action.
2. **Contextual authorization** — whether that specific request is safe for the current task, state, scope, branch, validation result, approval state, sandbox and broker policy.
3. **Execution boundary** — the lower-level component that actually performs or rejects the action.

A role capability is therefore necessary but never sufficient authorization.

Example:

- The Implementer may request `git.push_task_branch`.
- The Git broker must still verify that the branch is `agent/*`, the task owns it, validation passed, no protected ref is targeted, and no force push is requested.

## 2. Fail-closed rule

`agent-runtime/capability-policy.mjs` intentionally fails closed.

- Unknown role: denied.
- Unknown capability: denied.
- Cross-role capability: denied.
- Explicitly prohibited capability: denied.

Adding a new role or tool does not grant access automatically. The capability must be added deliberately and covered by tests.

## 3. Initial roles

### Planner

May inspect the repository, reason about the task, read audit metadata, use local model inference and request read-only research.

It cannot write code, commit, push or merge.

### Implementer

May inspect the repository, write only inside the task worktree, run approved development commands, use local model inference, and request commit/push/PR creation for its task branch.

It cannot perform direct web research, protected-branch actions, secret access or production-destructive actions.

### Tester

May inspect source, run approved validation commands, read audit metadata and use local model inference to interpret results.

It cannot write implementation code or commit changes.

### Reviewer

May inspect source, run approved validation commands, read audit metadata, use local inference and publish review comments.

It cannot implement or commit the change it is reviewing. This preserves reviewer independence.

### Security

May inspect source, run approved checks, read audit metadata, use local inference, publish review comments and produce security findings.

It has no production, secret or merge authority.

### Researcher

May inspect repository context, read audit metadata, use local inference and perform read-only web research.

It cannot submit forms, authenticate into services, modify external systems, write code, commit, push or merge.

## 4. Initial capability matrix

| Capability | Planner | Implementer | Tester | Reviewer | Security | Researcher |
| --- | --- | --- | --- | --- | --- | --- |
| `repository.read` | yes | yes | yes | yes | yes | yes |
| `task.plan` | yes | no | no | no | no | no |
| `worktree.write` | no | yes | no | no | no | no |
| `command.run_approved` | no | yes | yes | yes | yes | no |
| `audit.read` | yes | yes | yes | yes | yes | yes |
| `model.infer_local` | yes | yes | yes | yes | yes | yes |
| `web.read` | yes | no | no | no | no | yes |
| `git.commit_task_branch` | no | yes | no | no | no | no |
| `git.push_task_branch` | no | yes | no | no | no | no |
| `pull_request.open` | no | yes | no | no | no | no |
| `pull_request.comment` | no | no | no | yes | yes | no |
| `security.report` | no | no | no | no | yes | no |

This table states which requests a role may make. It does not bypass task-state, scope, sandbox, Git or human-approval checks.

## 5. Explicitly prohibited capabilities

The following are denied to autonomous agent roles in this initial model:

- `main.write`
- `main.merge`
- `git.force_push`
- `git.history_rewrite`
- `git.remote_branch_delete`
- `secrets.read`
- `production.destructive`
- `repository.admin`
- `browser.write`

Future product requirements must not silently reinterpret these names as allowed behavior. A policy change must be explicit, reviewed and tested.

## 6. Layered authorization

The intended request path is:

```text
Agent role
   ↓
Capability policy
   ↓
Task/state/scope policy
   ↓
Human approval gate when required
   ↓
Tool / Git / browser / release broker
   ↓
Sandbox or external API
```

Every layer may reject a request.

No inner layer should assume that because an outer layer accepted a request the operation is therefore safe.

## 7. Web research boundary

`web.read` means untrusted read-only research.

Internet content must be treated as data, not authority. Web pages may contain prompt injection or malicious instructions.

The Researcher/Planner must not be able to convert web text directly into privileged actions. Browser write actions remain explicitly prohibited in this phase.

A later browser broker should enforce:

- isolated browser profile
- no GitHub/Supabase/Vercel credentials
- no host secrets
- no repository write mount
- domain/action allowlists where appropriate
- size/time limits
- source provenance in research outputs

## 8. Git boundary

The Implementer's Git capabilities only express a future right to request safe task-branch operations.

The trusted Git broker remains responsible for enforcing, at minimum:

- `agent/*` branches only
- task ownership of branch/worktree
- no protected refs
- no force push
- no history rewrite
- no remote branch deletion
- validation state requirements
- audit event creation

Human merge to `main` remains mandatory.

## 9. Testing expectations

Capability changes require focused tests proving both allowed and denied behavior.

At minimum, tests should cover:

- all defined roles
- all permanently prohibited capabilities
- unknown roles
- unknown capabilities
- representative cross-role escalation attempts
- immutability of exported policy data

The policy tests must not require Docker, network access, a local model, production services or secrets.

## 10. Future evolution

Later versions may add contextual policy inputs such as:

- task risk
- explicit human approval
- current task state
- allowed file scope
- validation result
- branch ownership
- network budget
- tool budget
- project-specific capability overlays

Those additions should preserve the same principle:

> An agent receives the minimum authority required for its role, task and current step — never a standing general-purpose credential set.
