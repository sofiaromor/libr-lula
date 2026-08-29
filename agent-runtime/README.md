# Agent Runtime Core

This directory is the first executable foundation for Librélula's local multi-agent runtime.

The current implementation intentionally starts small: it defines deterministic task state and local persistence that the future orchestrator, coding agents, and Dev Control UI can share.

## What exists now

`task-record.mjs` provides:

- canonical task statuses matching `docs/AGENT_TASK_PROTOCOL.md`
- low / medium / high risk classification
- deterministic `agent/<task-id>-<slug>` branch naming
- local worktree path assignment under `.agent/worktrees/`
- validation state tracking
- explicit allowed task transitions
- a hard gate preventing `review_ready` before validation passes
- blocker recording
- terminal `done` and `cancelled` states

`task-store.mjs` provides:

- UTF-8 JSON persistence under `.agent/tasks/`
- safe task-ID validation to prevent path traversal
- atomic-style temp-file writes followed by rename
- record reload with ID consistency checks
- deterministic task listing

`scripts/agent-task.mjs` is the first local operator CLI. It can create, inspect, start, resume, block, validate, mark review-ready, and cancel active tasks. It intentionally exposes no command for human-only approval, completion, merge, or `main` operations.

Both runtime modules and the CLI behavior are covered by the normal automated test suite.

## Example

```text
node scripts/agent-task.mjs create DEV-0042 "Fix mobile rating control" low
node scripts/agent-task.mjs start DEV-0042
node scripts/agent-task.mjs validation DEV-0042 passed
node scripts/agent-task.mjs review-ready DEV-0042
```

These commands manage task state only. They do not yet create branches, worktrees, run models, execute code changes, push branches, or merge anything.

## Local runtime data

Runtime state lives under:

`.agent/`

That directory is intentionally ignored by Git. It may contain task records, worktree metadata, process state, and local logs. It must never contain secrets or private user data.

## Next runtime layers

Planned layers should build on this core rather than duplicating task lifecycle logic:

1. worktree manager
2. local model/coding-agent adapter
3. command execution sandbox
4. orchestrator queue and scheduler
5. audit/event log
6. local HTTP/WebSocket control API
7. Librélula Dev Control PWA

## Safety boundary

This runtime does not grant additional permissions to agents. `AGENTS.md`, `docs/AGENT_TASK_PROTOCOL.md`, CI policy, GitHub review controls, and human merge authority remain the governing safety boundaries.
