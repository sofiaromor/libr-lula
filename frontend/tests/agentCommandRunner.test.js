import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildApprovedCommand,
  buildSafeEnvironment,
  listApprovedOperations,
  runApprovedTaskCommand,
  toCommandAuditEvent,
} from "../../agent-runtime/command-runner.mjs";
import { prepareTaskWorktree } from "../../agent-runtime/worktree-manager.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function withRepository(run) {
  const root = await mkdtemp(join(tmpdir(), "librelula-command-runner-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.name", "Librélula Test"]);
    git(root, ["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, ".gitignore"), ".agent/\n", "utf8");
    await writeFile(join(root, "README.md"), "fixture\n", "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "fixture"]);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runningRecord(id = "DEV-800") {
  return {
    id,
    title: "Command runner fixture",
    status: "running",
    branch: `agent/${id}-command-runner-fixture`,
    worktree: `.agent/worktrees/${id}`,
  };
}

test("safe environment does not inherit arbitrary secrets", () => {
  const env = buildSafeEnvironment(
    {
      PATH: "/bin",
      GITHUB_TOKEN: "secret",
      PASSWORD: "secret",
      LANG: "C",
    },
    { worktreeRoot: "/tmp/worktree" },
  );

  assert.equal(env.PATH, "/bin");
  assert.equal(env.LANG, "C");
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.PASSWORD, undefined);
  assert.match(env.NPM_CONFIG_USERCONFIG, /\.agent-npmrc-disabled$/u);
});

test("command runner exposes only the fixed initial operations", () => {
  assert.deepEqual(listApprovedOperations(), [
    "preflight",
    "git-status",
    "git-diff-check",
    "install",
    "lint",
    "test",
    "validate",
  ]);
  assert.throws(
    () => buildApprovedCommand("git-push", "/tmp/worktree"),
    /Unsupported/u,
  );
});

test("git-status executes inside the registered task worktree", async () => {
  await withRepository(async (root) => {
    const record = runningRecord();
    const created = prepareTaskWorktree(record, { cwd: root });
    const result = runApprovedTaskCommand(record, "git-status", { cwd: root });

    assert.equal(result.ok, true, result.stderr);
    assert.equal(result.exitCode, 0);
    assert.equal(result.cwd, created.path);
    assert.equal(result.stdout, "");
  });
});

test("command runner rejects tasks that are not active", async () => {
  await withRepository(async (root) => {
    const record = { ...runningRecord("DEV-801"), status: "queued" };
    prepareTaskWorktree(record, { cwd: root });
    assert.throws(
      () => runApprovedTaskCommand(record, "git-status", { cwd: root }),
      /running or validation_failed/u,
    );
  });
});

test("command runner rejects a task record whose branch no longer matches its worktree", async () => {
  await withRepository(async (root) => {
    const record = runningRecord("DEV-802");
    prepareTaskWorktree(record, { cwd: root });
    const mismatched = { ...record, branch: "agent/DEV-802-other" };
    assert.throws(
      () => runApprovedTaskCommand(mismatched, "git-status", { cwd: root }),
      /expected agent branch/u,
    );
  });
});

test("audit event excludes command output and local filesystem paths", () => {
  const event = toCommandAuditEvent({
    taskId: "DEV-899",
    operation: "validate",
    ok: true,
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    durationMs: 25,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.025Z",
    stdout: "potentially sensitive output",
    cwd: "C:/Users/example/private/path",
  });

  assert.equal(event.type, "agent.command.completed");
  assert.equal(event.taskId, "DEV-899");
  assert.equal(event.stdout, undefined);
  assert.equal(event.cwd, undefined);
});
