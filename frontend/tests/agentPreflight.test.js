import test from "node:test";
import assert from "node:assert/strict";

import { evaluateAgentPreflight } from "../../agent-runtime/preflight.mjs";

function base(overrides = {}) {
  return evaluateAgentPreflight({
    branch: "agent/DEV-500-preflight",
    dirty: false,
    nodeMajor: 24,
    requiredFiles: [
      { path: "AGENTS.md", exists: true },
      { path: "docs/AGENT_TASK_PROTOCOL.md", exists: true },
      { path: "frontend/package.json", exists: true },
    ],
    ...overrides,
  });
}

test("agent preflight passes for a clean agent task branch", () => {
  const result = base();
  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test("agent preflight rejects main", () => {
  const result = base({ branch: "main" });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.name === "not-main").ok, false);
});

test("agent preflight rejects a dirty working tree", () => {
  const result = base({ dirty: true });
  assert.equal(result.ok, false);
  assert.equal(
    result.checks.find((check) => check.name === "working-tree-clean").ok,
    false,
  );
});

test("agent preflight rejects missing required policy files", () => {
  const result = base({
    requiredFiles: [{ path: "AGENTS.md", exists: false }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.name === "required:AGENTS.md").ok, false);
});

test("agent preflight can inspect a human-controlled non-agent branch explicitly", () => {
  const result = base({
    branch: "chore/agent-runtime-foundation",
    allowNonAgentBranch: true,
  });
  assert.equal(result.ok, true);
});
