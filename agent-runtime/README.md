# Agent Runtime Core

This directory is the first executable foundation for Librélula's local multi-agent runtime.

The current implementation intentionally starts small: it defines a deterministic task-record state machine that the future orchestrator, local coding agents, and Dev Control UI can share.

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

The module has no external dependencies and is covered by the normal Node test suite.

## Local runtime data

Runtime state will live under:

`.agent/`

That directory is intentionally ignored by Git. It may eventually contain task records, worktree metadata, process state, and local logs. It must never contain secrets or private user data.

## Next runtime layers

Planned layers should build on this core rather than duplicating task lifecycle logic:

1. task persistence (`.agent/tasks/*.json`)
2. worktree manager
3. local model/coding-agent adapter
4. command execution sandbox
5. orchestrator queue and scheduler
6. audit/event log
7. local HTTP/WebSocket control API
8. Librélula Dev Control PWA

## Safety boundary

This runtime does not grant additional permissions to agents. `AGENTS.md`, `docs/AGENT_TASK_PROTOCOL.md`, CI policy, GitHub review controls, and human merge authority remain the governing safety boundaries.
