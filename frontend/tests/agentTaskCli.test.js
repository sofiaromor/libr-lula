import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");
const cli = join(repoRoot, "scripts", "agent-task.mjs");

async function withRuntime(run) {
  const cwd = await mkdtemp(join(tmpdir(), "librelula-agent-cli-"));
  try {
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function command(cwd, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
}

test("agent task CLI creates and shows a local task", async () => {
  await withRuntime(async (cwd) => {
    const created = command(cwd, ["create", "DEV-300", "CLI smoke task"]);
    assert.equal(created.status, 0, created.stderr);

    const createdRecord = JSON.parse(created.stdout);
    assert.equal(createdRecord.id, "DEV-300");
    assert.equal(createdRecord.status, "queued");

    const shown = command(cwd, ["show", "DEV-300"]);
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(JSON.parse(shown.stdout).branch, "agent/DEV-300-cli-smoke-task");
  });
});

test("agent task CLI enforces validation before review-ready", async () => {
  await withRuntime(async (cwd) => {
    assert.equal(command(cwd, ["create", "DEV-301", "Review gate"]).status, 0);
    assert.equal(command(cwd, ["start", "DEV-301"]).status, 0);

    const premature = command(cwd, ["review-ready", "DEV-301"]);
    assert.notEqual(premature.status, 0);
    assert.match(premature.stderr, /until validation passes/u);

    assert.equal(command(cwd, ["validation", "DEV-301", "passed"]).status, 0);
    const ready = command(cwd, ["review-ready", "DEV-301"]);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(JSON.parse(ready.stdout).status, "review_ready");
  });
});

test("agent task CLI exposes no approve or done command", async () => {
  await withRuntime(async (cwd) => {
    const approve = command(cwd, ["approve", "DEV-999"]);
    const done = command(cwd, ["done", "DEV-999"]);

    assert.notEqual(approve.status, 0);
    assert.notEqual(done.status, 0);
    assert.match(approve.stderr, /Unknown command/u);
    assert.match(done.stderr, /Unknown command/u);
  });
});
