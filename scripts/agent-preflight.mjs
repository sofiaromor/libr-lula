import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { evaluateAgentPreflight } from "../agent-runtime/preflight.mjs";

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || "git command failed").trim());
  }

  return result.stdout.trim();
}

const allowNonAgentBranch = process.argv.includes("--allow-non-agent-branch");
const branch = git(["branch", "--show-current"]);
const dirty = Boolean(git(["status", "--porcelain"]));
const nodeMajor = Number(process.versions.node.split(".")[0]);

const requiredFiles = [
  "AGENTS.md",
  "docs/AGENT_TASK_PROTOCOL.md",
  "frontend/package.json",
].map((path) => ({
  path,
  exists: existsSync(path),
}));

const result = evaluateAgentPreflight({
  branch,
  dirty,
  nodeMajor,
  requiredFiles,
  allowNonAgentBranch,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}
