import process from "node:process";

import { loadTaskRecord } from "../agent-runtime/task-store.mjs";
import { resolveRepositoryContext } from "../agent-runtime/repository-context.mjs";
import {
  inspectTaskWorktree,
  listManagedWorktrees,
  prepareTaskWorktree,
} from "../agent-runtime/worktree-manager.mjs";

function usage() {
  console.log(`Librélula agent worktree CLI

Usage:
  node scripts/agent-worktree.mjs list
  node scripts/agent-worktree.mjs status <task-id>
  node scripts/agent-worktree.mjs prepare <task-id> [base-ref]

This CLI can create or inspect task worktrees. It intentionally cannot remove worktrees, delete branches, merge PRs, or modify main.`);
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  const context = resolveRepositoryContext();

  switch (command) {
    case "list":
      print(listManagedWorktrees());
      return;

    case "status": {
      const id = required(rest[0], "task id");
      const record = await loadTaskRecord(id, { storeDir: context.taskStoreDir });
      print(inspectTaskWorktree(record));
      return;
    }

    case "prepare": {
      const id = required(rest[0], "task id");
      const baseRef = String(rest[1] ?? "HEAD").trim() || "HEAD";
      const record = await loadTaskRecord(id, { storeDir: context.taskStoreDir });
      print(prepareTaskWorktree(record, { baseRef }));
      return;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      return;

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Agent worktree command failed: ${error.message}`);
  process.exitCode = 1;
});
