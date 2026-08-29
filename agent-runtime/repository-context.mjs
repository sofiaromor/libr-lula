import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || "git command failed").trim());
  }

  return result.stdout.trim();
}

export function resolveRepositoryContext({ cwd = process.cwd() } = {}) {
  const worktreeRoot = resolve(git(["rev-parse", "--show-toplevel"], cwd));
  const commonGitDirRaw = git(["rev-parse", "--git-common-dir"], cwd);
  const commonGitDir = resolve(cwd, commonGitDirRaw);
  const primaryRoot = dirname(commonGitDir);
  const runtimeRoot = join(primaryRoot, ".agent");

  return {
    worktreeRoot,
    commonGitDir,
    primaryRoot,
    runtimeRoot,
    taskStoreDir: join(runtimeRoot, "tasks"),
    worktreesRoot: join(runtimeRoot, "worktrees"),
  };
}
