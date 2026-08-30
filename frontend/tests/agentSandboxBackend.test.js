import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createTaskRecord } from "../../agent-runtime/task-record.mjs";
import { prepareTaskWorktree } from "../../agent-runtime/worktree-manager.mjs";
import {
  buildSandboxCommand,
  createSandboxPolicy,
  inspectSandboxEngine,
  runSandboxedTaskOperation,
  toSandboxAuditEvent,
} from "../../agent-runtime/sandbox-backend.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function withTask(run) {
  const root = await mkdtemp(join(tmpdir(), "librelula-sandbox-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.name", "Librélula Test"]);
    git(root, ["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, ".gitignore"), ".agent/\n", "utf8");
    await writeFile(join(root, "README.md"), "fixture\n", "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "fixture"]);

    const record = {
      ...createTaskRecord({ id: "DEV-800", title: "Sandbox task", risk: "medium" }),
      status: "running",
    };
    prepareTaskWorktree(record, { cwd: root });
    await run(root, record);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const policy = () =>
  createSandboxPolicy({
    allowedImages: ["node:24-bookworm-slim"],
    limits: { cpus: 2, memoryMb: 2048, pids: 64, tmpfsMb: 128 },
  });

test("sandbox policy requires explicit human image allowlisting", async () => {
  await withTask(async (root, record) => {
    assert.throws(
      () =>
        buildSandboxCommand(record, "lint", {
          cwd: root,
          policy: createSandboxPolicy(),
          image: "node:24-bookworm-slim",
        }),
      /human-allowlisted/u,
    );
  });
});

test("sandbox install requires explicit network approval", async () => {
  await withTask(async (root, record) => {
    assert.throws(
      () =>
        buildSandboxCommand(record, "install", {
          cwd: root,
          policy: policy(),
          image: "node:24-bookworm-slim",
        }),
      /network approval/u,
    );
  });
});

test("sandbox lint plan is fail-closed and host-isolated by construction", async () => {
  await withTask(async (root, record) => {
    const plan = buildSandboxCommand(record, "lint", {
      cwd: root,
      policy: policy(),
      image: "node:24-bookworm-slim",
    });

    assert.equal(plan.command, "docker");
    assert.equal(plan.network, "none");
    assert.ok(plan.args.includes("--pull=never"));
    assert.ok(plan.args.includes("--read-only"));
    assert.ok(plan.args.includes("--cap-drop=ALL"));
    assert.ok(plan.args.includes("--security-opt=no-new-privileges:true"));
    assert.ok(plan.args.includes("--network=none"));
    assert.equal(plan.args.includes("--privileged"), false);
    assert.equal(plan.args.some((arg) => /docker\.sock/iu.test(arg)), false);
    assert.equal(plan.args.some((arg) => /\.ssh/iu.test(arg)), false);
    assert.equal(plan.args.some((arg) => /USERPROFILE|APPDATA|HOME=/u.test(arg) && !arg.includes("HOME=/tmp/home")), false);
    assert.ok(plan.args.some((arg) => arg.includes("dst=/workspace,readonly")));
    assert.ok(plan.args.some((arg) => arg.includes("dst=/workspace/frontend/node_modules")));
  });
});

test("sandbox engine inspection reports unavailable engines without falling through", () => {
  const result = inspectSandboxEngine({
    spawn: () => ({
      status: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("missing"), { code: "ENOENT" }),
    }),
  });
  assert.deepEqual(result, {
    engine: "docker",
    available: false,
    version: null,
    errorCode: "ENOENT",
  });
});

test("sandbox execution fails closed when the approved engine is unavailable", async () => {
  await withTask(async (root, record) => {
    assert.throws(
      () =>
        runSandboxedTaskOperation(record, "lint", {
          cwd: root,
          policy: policy(),
          image: "node:24-bookworm-slim",
          spawn: () => ({
            status: null,
            stdout: "",
            stderr: "",
            error: Object.assign(new Error("missing"), { code: "ENOENT" }),
          }),
        }),
      /engine is unavailable/u,
    );
  });
});

test("sandbox execution returns bounded audit-safe metadata", async () => {
  await withTask(async (root, record) => {
    const calls = [];
    const fakeSpawn = (command, args) => {
      calls.push({ command, args });
      if (args[0] === "version") {
        return { status: 0, stdout: "28.0.0\n", stderr: "", error: undefined };
      }
      return {
        status: 0,
        stdout: "lint output that must not enter audit metadata",
        stderr: "",
        signal: null,
        error: undefined,
      };
    };

    const result = runSandboxedTaskOperation(record, "lint", {
      cwd: root,
      policy: policy(),
      image: "node:24-bookworm-slim",
      spawn: fakeSpawn,
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);

    const event = toSandboxAuditEvent(result);
    assert.equal(event.type, "agent.sandbox.completed");
    assert.equal(event.taskId, "DEV-800");
    assert.equal(event.details.operation, "lint");
    assert.equal(event.details.network, "none");
    assert.equal(JSON.stringify(event).includes("lint output"), false);
    assert.equal(JSON.stringify(event).includes(root), false);
  });
});
