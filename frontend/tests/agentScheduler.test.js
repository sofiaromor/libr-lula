import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTaskScope,
  planAgentSchedule,
  schedulerAuditEvents,
  scopesConflict,
} from "../../agent-runtime/scheduler.mjs";

function task(id, overrides = {}) {
  return {
    id,
    status: "queued",
    risk: "low",
    scope: [`frontend/src/${id}.jsx`],
    created_at: `2026-01-01T00:00:${String(
      Number(id.replace(/\D/gu, "") || 0),
    ).padStart(2, "0")}Z`,
    ...overrides,
  };
}

test("scope normalization is repository-relative and deterministic", () => {
  assert.deepEqual(
    normalizeTaskScope(
      task("DEV-1", {
        scope: ["./frontend\\src\\A.jsx", "frontend/src/A.jsx"],
      }),
    ),
    ["frontend/src/A.jsx"],
  );
  assert.throws(
    () => normalizeTaskScope(task("DEV-1", { scope: ["../outside"] })),
    /repository-relative/u,
  );
});

test("scope conflict detects parent and child paths", () => {
  assert.equal(
    scopesConflict(["frontend/src"], ["frontend/src/App.jsx"]),
    true,
  );
  assert.equal(
    scopesConflict(["frontend/src/A.jsx"], ["frontend/src/B.jsx"]),
    false,
  );
});

test("scheduler selects deterministic queued work up to capacity", () => {
  const plan = planAgentSchedule(
    [task("DEV-2"), task("DEV-1"), task("DEV-3")],
    { maxParallel: 2 },
  );
  assert.deepEqual(plan.start, ["DEV-1", "DEV-2"]);
  assert.deepEqual(plan.deferred, [{ id: "DEV-3", reason: "capacity" }]);
});

test("active tasks consume scheduler capacity", () => {
  const plan = planAgentSchedule(
    [
      task("DEV-1", { status: "running" }),
      task("DEV-2"),
      task("DEV-3"),
    ],
    { maxParallel: 2 },
  );
  assert.deepEqual(plan.active, ["DEV-1"]);
  assert.deepEqual(plan.start, ["DEV-2"]);
  assert.equal(plan.availableSlots, 1);
});

test("scheduler defers overlapping scopes", () => {
  const plan = planAgentSchedule([
    task("DEV-1", {
      status: "running",
      scope: ["frontend/src/profile"],
    }),
    task("DEV-2", { scope: ["frontend/src/profile/Profile.jsx"] }),
  ]);
  assert.deepEqual(plan.start, []);
  assert.deepEqual(plan.deferred, [
    {
      id: "DEV-2",
      reason: "scope_conflict",
      conflictsWith: ["DEV-1"],
    },
  ]);
});

test("scheduler refuses high-risk and unscoped autonomous starts", () => {
  const plan = planAgentSchedule([
    task("DEV-1", { risk: "high" }),
    task("DEV-2", { scope: [] }),
  ]);
  assert.deepEqual(plan.start, []);
  assert.deepEqual(plan.deferred, [
    { id: "DEV-1", reason: "requires_human_approval" },
    { id: "DEV-2", reason: "scope_required" },
  ]);
});

test("unknown active scope fails closed for new work", () => {
  const plan = planAgentSchedule([
    task("DEV-1", { status: "running", scope: [] }),
    task("DEV-2"),
  ]);
  assert.deepEqual(plan.start, []);
  assert.deepEqual(plan.deferred, [
    {
      id: "DEV-2",
      reason: "unknown_active_scope",
      conflictsWith: ["DEV-1"],
    },
  ]);
});

test("scheduler selection creates audit-safe event envelopes", () => {
  const plan = planAgentSchedule([task("DEV-1")], { maxParallel: 2 });
  assert.deepEqual(schedulerAuditEvents(plan), [
    {
      type: "scheduler.task.selected",
      taskId: "DEV-1",
      details: { maxParallel: 2, activeCount: 0 },
    },
  ]);
});
