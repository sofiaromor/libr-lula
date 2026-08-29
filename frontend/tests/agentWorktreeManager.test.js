import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { createTaskRecord } from "../../agent-runtime/task-record.mjs";
import { resolveRepositoryContext } from "../../agent-runtime/repository-context.mjs";
import {
  inspectTaskWorktree,
  parseWorktreePorcelain,
  prepareTaskWorktree,
} from "../../agent-runtime/worktree-manager.mjs";

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
  const root = await mkdtemp(join(tmpdir(), "librelula-worktree-manager-"));

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

test("parseWorktreePorcelain parses branches and detached worktrees", () => {
  const parsed = parseWorktreePorcelain(`worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/task\nHEAD def456\ndetached\n`);

  assert.deepEqual(parsed, [
    { path: "/repo", head: "abc123", branch: "main", detached: false },
    { path: "/repo/task", head: "def456", branch: null, detached: true },
  ]);
});

test("prepareTaskWorktree creates and verifies an isolated task worktree", async () => {
  await withRepository(async (root) => {
    const record = createTaskRecord({
      id: "DEV-700",
      title: "Create isolated worktree",
      risk: "medium",
    });

    const created = prepareTaskWorktree(record, { cwd: root });
    assert.equal(created.created, true);
    assert.equal(created.branch, record.branch);
    assert.equal(git(created.path, ["branch", "--show-current"]), record.branch);

    const inspected = inspectTaskWorktree(record, { cwd: root });
    assert.equal(inspected.registered, true);
    assert.equal(inspected.matches, true);

    const repeated = prepareTaskWorktree(record, { cwd: root });
    assert.equal(repeated.created, false);
    assert.equal(repeated.reason, "already-registered");
  });
});

test("repository context keeps runtime storage anchored to the primary worktree", async () => {
  await withRepository(async (root) => {
    const record = createTaskRecord({
      id: "DEV-701",
      title: "Central runtime storage",
    });
    const created = prepareTaskWorktree(record, { cwd: root });

    const primary = resolveRepositoryContext({ cwd: root });
    const linked = resolveRepositoryContext({ cwd: created.path });

    assert.equal(linked.primaryRoot, resolve(root));
    assert.equal(linked.taskStoreDir, primary.taskStoreDir);
    assert.equal(linked.worktreesRoot, primary.worktreesRoot);
  });
});

test("prepareTaskWorktree rejects paths outside the managed worktree root", async () => {
  await withRepository(async (root) => {
    const record = {
      ...createTaskRecord({ id: "DEV-702", title: "Unsafe path" }),
      worktree: ".agent/elsewhere/DEV-702",
    };

    assert.throws(
      () => prepareTaskWorktree(record, { cwd: root }),
      /inside \.agent\/worktrees/u,
    );
  });
});

test("prepareTaskWorktree rejects non-agent branches", async () => {
  await withRepository(async (root) => {
    const record = {
      ...createTaskRecord({ id: "DEV-703", title: "Unsafe branch" }),
      branch: "feature/unsafe",
    };

    assert.throws(
      () => prepareTaskWorktree(record, { cwd: root }),
      /must start with agent\//u,
    );
  });
});
