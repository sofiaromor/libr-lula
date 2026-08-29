# Agent Runtime Core

This directory is the executable foundation for Librélula's local multi-agent runtime.

The runtime is intentionally layered: task state, shared local persistence, startup policy, isolated Git worktrees, constrained command execution, append-only audit metadata, deterministic scheduling, and local-model access are built separately so later orchestration does not bypass safety controls.

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

`preflight.mjs` provides a reusable, side-effect-free startup policy evaluator for:

- refusing `main`
- requiring an `agent/*` task branch for agent runtime work
- requiring a clean working tree
- requiring Node 24+
- requiring core repository policy files

`repository-context.mjs` resolves the primary repository root even when code is running from a linked worktree. Runtime task records and managed worktrees therefore remain anchored to the primary checkout rather than being duplicated inside each linked workspace.

`worktree-manager.mjs` provides:

- one isolated Git worktree per task
- enforced `agent/*` branches
- worktree paths constrained to `.agent/worktrees/`
- detection of path and branch conflicts
- post-create branch verification
- read-only worktree inspection/listing
- no worktree deletion or branch deletion capability

`command-runner.mjs` provides a constrained process-policy layer for agents:

- `shell: false` process execution
- a fixed operation allowlist instead of arbitrary commands/arguments
- execution only inside the registered worktree for the expected agent branch
- task-state gating (`running` / `validation_failed`)
- fixed timeouts
- a 1 MiB stdout/stderr capture limit
- a small inherited environment allowlist rather than forwarding the complete host environment
- npm user configuration disabled for automated npm operations
- `npm ci --ignore-scripts` as the conservative automated dependency-install operation
- output-free audit summaries compatible with the persistent audit log

Initial approved operations are:

- `preflight`
- `git-status`
- `git-diff-check`
- `install`
- `lint`
- `test`
- `validate`

`audit-log.mjs` provides local append-only runtime audit metadata:

- JSONL persistence under `.agent/audit/events.jsonl`
- stable event IDs, timestamps, event type, task ID, actor, and bounded details
- rejection of raw command output and obvious secret-bearing keys such as tokens, passwords, authorization data, cookies, full environments, and private keys
- a 16 KiB maximum serialized event size plus bounded strings/collections
- newest-N reads and optional task filtering
- visible failure on malformed stored events instead of silently skipping corrupt lines
- no external transmission or production telemetry

`scheduler.mjs` provides the first deterministic orchestrator planning layer:

- bounded maximum parallelism
- running / validation-failed tasks consume capacity
- deterministic queued-task ordering
- high-risk queued tasks are never selected autonomously
- tasks without explicit scope are never selected autonomously
- unknown scope on an active task blocks new starts
- repository-relative scope normalization rejects traversal and absolute paths
- case-insensitive scope comparison for the Windows development host
- `.` represents repository-wide scope and conflicts with all scoped work
- parent/child file-directory scope overlap is treated as a conflict
- selected tasks can be represented as audit-safe scheduler events
- planning is side-effect free and does not mutate task state

`ollama-adapter.mjs` provides a deliberately local-only model boundary:

- default endpoint `http://127.0.0.1:11434`
- only loopback hosts (`127.0.0.1`, `localhost`, `::1`) over plain local HTTP are permitted
- URL credentials, remote hosts, HTTPS/cloud endpoints, and base URLs containing API paths are rejected
- read-only Ollama version and local-model listing support
- chat uses `/api/chat` with `stream: false`
- no Authorization/API-key handling
- no model pull, create, copy, push, or delete capability
- model inference is disabled until a human supplies an explicit `allowedModels` list
- cloud-like model names are rejected to avoid accidental remote execution through a locally authenticated Ollama installation
- bounded messages, generation options, request timeout, and response size
- model `thinking` fields are intentionally not returned or persisted by the adapter
- inference returns compact metadata suitable for later orchestration/audit

`scripts/agent-task.mjs` manages task state. It can create, inspect, start, resume, block, validate, mark review-ready, and cancel active tasks. It intentionally exposes no command for human-only approval, completion, merge, or `main` operations.

`scripts/agent-preflight.mjs` gathers the current Git/Node/repository state and runs the preflight evaluator without modifying the repository.

`scripts/agent-worktree.mjs` can prepare or inspect the isolated worktree assigned to a task. It intentionally cannot remove worktrees, delete branches, merge PRs, or modify `main`.

`scripts/agent-run.mjs` exposes only the approved command-runner operations for an existing local task record. It does not accept arbitrary executable names or free-form arguments.

`scripts/agent-events.mjs` is a read-only operator view over recent audit events. Runtime modules, not the operator CLI, own event creation.

`scripts/agent-orchestrator.mjs` currently exposes a read-only schedule planner. It does not start models, execute commands, transition task state, approve work, or merge branches.

`scripts/agent-model.mjs` is a read-only Ollama inspector. It can check the local Ollama version and list locally installed models, but it deliberately cannot chat, pull, create, push, copy, or delete models.

The runtime modules and CLI behavior are covered by the normal automated test suite.

## Example

```text
node scripts/agent-preflight.mjs --allow-non-agent-branch
node scripts/agent-task.mjs create DEV-0042 "Fix mobile rating control" low
node scripts/agent-worktree.mjs prepare DEV-0042 HEAD
node scripts/agent-task.mjs start DEV-0042
node scripts/agent-run.mjs run DEV-0042 preflight
node scripts/agent-run.mjs run DEV-0042 install
node scripts/agent-run.mjs run DEV-0042 validate
node scripts/agent-task.mjs validation DEV-0042 passed
node scripts/agent-task.mjs review-ready DEV-0042
node scripts/agent-events.mjs list DEV-0042 50
node scripts/agent-orchestrator.mjs plan 2
node scripts/agent-model.mjs status
node scripts/agent-model.mjs models
```

## Local runtime data

Runtime state lives under:

`.agent/`

That directory is intentionally ignored by Git. It may contain task records, worktree metadata, process state, caches, and local audit logs. It must never contain secrets or private user data.

Audit events intentionally store small structured metadata rather than command stdout/stderr or complete host environments.

## Model boundary

The Ollama adapter is intentionally local-only and zero-cost by design. It does not automatically download a model. The actual coding model must be selected by a human after checking the host's RAM, GPU/VRAM, and available local storage.

Even though Ollama can support remote/cloud-backed models in some configurations, this runtime does not authorize them. Model names that look cloud-backed are rejected, and the runtime has no API-key or Authorization-header mechanism.

## Important sandbox limitation

The command runner is an **accidental-safety and policy boundary**, not an operating-system security sandbox.

Commands such as lint, test, and validate execute versioned repository code. A malicious or compromised codebase could therefore still execute code with the permissions of the host user. A local model also receives whatever repository context the future orchestrator chooses to send to it.

The runtime must not claim host isolation until a later layer executes agents/commands in a container, restricted OS account, VM, or equivalent low-privilege boundary.

Until that layer exists:

- do not treat arbitrary third-party code as trusted
- keep sensitive credentials out of the process environment
- keep production credentials out of agent workspaces
- keep model prompts free of secrets and unrelated private data
- preserve the human approval gates in `AGENTS.md`

## Next runtime layers

Planned layers should build on this core rather than duplicating lifecycle or safety logic:

1. operating-system/container execution sandbox
2. human selection/installation of the local coding model
3. orchestrator executor / queue loop built on scheduler + model + command runner + audit log
4. GitHub push/PR integration for the orchestrator
5. local HTTP/WebSocket control API
6. Librélula Dev Control PWA

## Safety boundary

This runtime does not grant additional permissions to agents. `AGENTS.md`, `docs/AGENT_TASK_PROTOCOL.md`, CI policy, GitHub review controls, and human merge authority remain the governing safety boundaries.
