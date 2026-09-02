import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_CAPABILITIES,
  AGENT_PROHIBITED_CAPABILITIES,
  AGENT_ROLE_CAPABILITIES,
  AGENT_ROLES,
  assertAgentCanRequestCapability,
  canAgentRequestCapability,
  evaluateAgentCapability,
  getRoleCapabilities,
  isProhibitedCapability,
} from "../../agent-runtime/capability-policy.mjs";

test("exported capability definitions are immutable", () => {
  assert.equal(Object.isFrozen(AGENT_ROLES), true);
  assert.equal(Object.isFrozen(AGENT_CAPABILITIES), true);
  assert.equal(Object.isFrozen(AGENT_PROHIBITED_CAPABILITIES), true);
  assert.equal(Object.isFrozen(AGENT_ROLE_CAPABILITIES), true);
  assert.equal(Object.isFrozen(AGENT_ROLE_CAPABILITIES.implementer), true);
});

test("planner can plan and research but cannot mutate a worktree", () => {
  assert.equal(canAgentRequestCapability("planner", "task.plan"), true);
  assert.equal(canAgentRequestCapability("planner", "web.read"), true);
  assert.equal(canAgentRequestCapability("planner", "worktree.write"), false);
});

test("implementer can change its task workspace but cannot use web research directly", () => {
  assert.equal(canAgentRequestCapability("implementer", "worktree.write"), true);
  assert.equal(canAgentRequestCapability("implementer", "git.commit_task_branch"), true);
  assert.equal(canAgentRequestCapability("implementer", "web.read"), false);
});

test("reviewer is read/validation oriented and cannot commit implementation changes", () => {
  assert.equal(canAgentRequestCapability("reviewer", "repository.read"), true);
  assert.equal(canAgentRequestCapability("reviewer", "command.run_approved"), true);
  assert.equal(canAgentRequestCapability("reviewer", "pull_request.comment"), true);
  assert.equal(canAgentRequestCapability("reviewer", "git.commit_task_branch"), false);
});

test("researcher web capability is read-only", () => {
  assert.equal(canAgentRequestCapability("researcher", "web.read"), true);
  assert.equal(canAgentRequestCapability("researcher", "browser.write"), false);
  assert.equal(isProhibitedCapability("browser.write"), true);
});

test("prohibited capabilities are denied for every defined role", () => {
  for (const role of AGENT_ROLES) {
    for (const capability of AGENT_PROHIBITED_CAPABILITIES) {
      const decision = evaluateAgentCapability(role, capability);
      assert.deepEqual(decision, { allowed: false, reason: "prohibited" });
    }
  }
});

test("unknown roles and capabilities fail closed", () => {
  assert.deepEqual(evaluateAgentCapability("admin", "repository.read"), {
    allowed: false,
    reason: "unknown_role",
  });
  assert.deepEqual(evaluateAgentCapability("planner", "anything.execute"), {
    allowed: false,
    reason: "unknown_capability",
  });
  assert.deepEqual(getRoleCapabilities("admin"), []);
});

test("assertion helper rejects cross-role privilege escalation", () => {
  assert.equal(
    assertAgentCanRequestCapability("security", "security.report"),
    true,
  );

  assert.throws(
    () => assertAgentCanRequestCapability("tester", "worktree.write"),
    /role_not_permitted/u,
  );

  assert.throws(
    () => assertAgentCanRequestCapability("implementer", "main.merge"),
    /prohibited/u,
  );
});
