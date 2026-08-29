import test from "node:test";
import assert from "node:assert/strict";

import {
  createTaskRecord,
  markTaskValidation,
  transitionTask,
} from "../../agent-runtime/task-record.mjs";

const FIXED_TIME = new Date("2026-08-29T12:00:00.000Z");

function task(overrides = {}) {
  return createTaskRecord(
    {
      id: "DEV-0042",
      title: "Fix mobile rating control",
      risk: "low",
      scope: ["frontend/src/components/RatingControl.jsx"],
      acceptance_criteria: ["Rating can be changed on mobile"],
      ...overrides,
    },
    FIXED_TIME,
  );
}

test("createTaskRecord creates an isolated queued agent task", () => {
  const record = task();

  assert.equal(record.status, "queued");
  assert.equal(record.risk, "low");
  assert.equal(record.branch, "agent/DEV-0042-fix-mobile-rating-control");
  assert.equal(record.worktree, ".agent/worktrees/DEV-0042");
  assert.equal(record.validation.status, "pending");
  assert.equal(record.created_at, FIXED_TIME.toISOString());
});

test("createTaskRecord rejects unsupported risk levels", () => {
  assert.throws(
    () => task({ risk: "critical" }),
    /risk must be one of/u,
  );
});

test("createTaskRecord rejects non-agent task branches", () => {
  assert.throws(
    () => task({ branch: "main" }),
    /must start with agent\//u,
  );
});

test("task lifecycle rejects skipping directly to review_ready", () => {
  assert.throws(
    () => transitionTask(task(), "review_ready", { now: FIXED_TIME }),
    /Invalid task transition/u,
  );
});

test("review_ready requires a passing validation result", () => {
  const running = transitionTask(task(), "running", { now: FIXED_TIME });

  assert.throws(
    () => transitionTask(running, "review_ready", { now: FIXED_TIME }),
    /until validation passes/u,
  );
});

test("validated task can advance to review_ready", () => {
  const running = transitionTask(task(), "running", { now: FIXED_TIME });
  const validated = markTaskValidation(running, "passed", FIXED_TIME);
  const reviewReady = transitionTask(validated, "review_ready", { now: FIXED_TIME });

  assert.equal(reviewReady.status, "review_ready");
  assert.equal(reviewReady.validation.status, "passed");
});

test("failed validation moves a running task to validation_failed", () => {
  const running = transitionTask(task(), "running", { now: FIXED_TIME });
  const failed = markTaskValidation(running, "failed", FIXED_TIME);

  assert.equal(failed.status, "validation_failed");
  assert.equal(failed.validation.status, "failed");
});

test("blocked tasks require a recorded blocker", () => {
  const running = transitionTask(task(), "running", { now: FIXED_TIME });

  assert.throws(
    () => transitionTask(running, "blocked", { now: FIXED_TIME }),
    /blocker is required/u,
  );

  const blocked = transitionTask(running, "blocked", {
    blocker: "Human approval required",
    now: FIXED_TIME,
  });

  assert.deepEqual(blocked.blockers, ["Human approval required"]);
});
