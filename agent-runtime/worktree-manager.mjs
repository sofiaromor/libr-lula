import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { resolveRepositoryContext } from "./repository-context.mjs";

function runGit(args, cwd, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error((result.stderr || "git command failed").trim());
  }

  return result;
}

function git(args, cwd) {
  return runGit(args, cwd).stdout.trim();
}

function assertTaskRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("task record is required");
  }

  const branch = String(record.branch ?? "").trim();
  const worktree = String(record.worktree ?? "").trim();

  if (!branch.startsWith("agent/")) {
    throw new Error("Agent worktree branches must start with agent/");
  }
  if (!worktree) {
    throw new Error("task worktree path is required");
  }
  if (new Set(["done", "cancelled"]).has(record.status)) {
    throw new Error(`Cannot prepare a worktree for terminal task status: ${record.status}`);
  }

  return { branch, worktree };
}

function isInside(root, target) {
  const rel = relative(root, target);
  return Boolean(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function normalizeBranch(value) {
  return String(value ?? "").replace(/^refs\/heads\//u, "");
}

export function parseWorktreePorcelain(output) {
  const text = String(output ?? "").trim();
  if (!text) return [];

  return text.split(/\r?\n\r?\n/u).map((block) => {
    const entry = {
      path: null,
      head: null,
      branch: null,
      detached: false,
    };

    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith("worktree ")) entry.path = line.slice(9);
      else if (line.startsWith("HEAD ")) entry.head = line.slice(5);
      else if (line.startsWith("branch ")) entry.branch = normalizeBranch(line.slice(7));
      else if (line === "detached") entry.detached = true;
    }

    return entry;
  });
}

export function listRegisteredWorktrees({ cwd = process.cwd() } = {}) {
  return parseWorktreePorcelain(git(["worktree", "list", "--porcelain"], cwd));
}

function resolveTaskPath(record, context) {
  const { worktree } = assertTaskRecord(record);
  const target = resolve(context.primaryRoot, worktree);

  if (!isInside(context.worktreesRoot, target)) {
    throw new Error("Task worktree must stay inside .agent/worktrees/");
  }

  return target;
}

export function inspectTaskWorktree(record, { cwd = process.cwd() } = {}) {
  const { branch } = assertTaskRecord(record);
  const context = resolveRepositoryContext({ cwd });
  const target = resolveTaskPath(record, context);
  const registered = listRegisteredWorktrees({ cwd });
  const entry = registered.find(
    (item) => item.path && resolve(context.primaryRoot, item.path) === target,
  );

  return {
    registered: Boolean(entry),
    path: target,
    expectedBranch: branch,
    actualBranch: entry?.branch ?? null,
    matches: Boolean(entry) && entry.branch === branch,
  };
}

export function listManagedWorktrees({ cwd = process.cwd() } = {}) {
  const context = resolveRepositoryContext({ cwd });
  return listRegisteredWorktrees({ cwd }).filter((entry) => {
    if (!entry.path) return false;
    const target = resolve(context.primaryRoot, entry.path);
    return isInside(context.worktreesRoot, target);
  });
}

export function prepareTaskWorktree(
  record,
  { cwd = process.cwd(), baseRef = "HEAD" } = {},
) {
  const { branch } = assertTaskRecord(record);
  const context = resolveRepositoryContext({ cwd });
  const target = resolveTaskPath(record, context);
  const registered = listRegisteredWorktrees({ cwd });

  const byPath = registered.find(
    (entry) => entry.path && resolve(context.primaryRoot, entry.path) === target,
  );

  if (byPath) {
    if (byPath.branch !== branch) {
      throw new Error(
        `Worktree path is already registered to ${byPath.branch ?? "detached HEAD"}`,
      );
    }

    return {
      created: false,
      path: target,
      branch,
      reason: "already-registered",
    };
  }

  const byBranch = registered.find((entry) => entry.branch === branch);
  if (byBranch) {
    throw new Error(`Task branch is already checked out at ${byBranch.path}`);
  }

  if (existsSync(target)) {
    throw new Error("Worktree target exists but is not registered with Git");
  }

  mkdirSync(dirname(target), { recursive: true });

  const branchCheck = runGit(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    cwd,
    { allowFailure: true },
  );

  const args = branchCheck.status === 0
    ? ["worktree", "add", target, branch]
    : ["worktree", "add", target, "-b", branch, baseRef];

  runGit(args, cwd);

  const inspected = inspectTaskWorktree(record, { cwd });
  if (!inspected.matches) {
    throw new Error("Git created the worktree but branch verification failed");
  }

  return {
    created: true,
    path: target,
    branch,
    baseRef,
  };
}
