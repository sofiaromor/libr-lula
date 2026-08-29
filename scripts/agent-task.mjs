import process from "node:process";

import {
  createTaskRecord,
  markTaskValidation,
  transitionTask,
} from "../agent-runtime/task-record.mjs";
import {
  listTaskRecords,
  loadTaskRecord,
  saveTaskRecord,
} from "../agent-runtime/task-store.mjs";
import { resolveRepositoryContext } from "../agent-runtime/repository-context.mjs";

function usage() {
  console.log(`Librélula agent task CLI

Usage:
  node scripts/agent-task.mjs create <id> <title> [risk]
  node scripts/agent-task.mjs list
  node scripts/agent-task.mjs show <id>
  node scripts/agent-task.mjs start <id>
  node scripts/agent-task.mjs resume <id>
  node scripts/agent-task.mjs block <id> <reason>
  node scripts/agent-task.mjs validation <id> <passed|failed>
  node scripts/agent-task.mjs review-ready <id>
  node scripts/agent-task.mjs cancel <id>

This CLI intentionally cannot approve tasks, mark them done, merge PRs, or modify main.`);
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function resolveTaskStoreDir() {
  try {
    return resolveRepositoryContext().taskStoreDir;
  } catch {
    return ".agent/tasks";
  }
}

const storeDir = resolveTaskStoreDir();

async function mutate(id, operation) {
  const record = await loadTaskRecord(required(id, "id"), { storeDir });
  const next = await operation(record);
  await saveTaskRecord(next, { storeDir });
  print(next);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;

  switch (command) {
    case "create": {
      const [id, title, risk = "low"] = rest;
      const record = createTaskRecord({
        id: required(id, "id"),
        title: required(title, "title"),
        risk,
        scope: [],
        acceptance_criteria: [],
      });
      await saveTaskRecord(record, { storeDir });
      print(record);
      return;
    }

    case "list":
      print(await listTaskRecords({ storeDir }));
      return;

    case "show":
      print(await loadTaskRecord(required(rest[0], "id"), { storeDir }));
      return;

    case "start":
      await mutate(rest[0], (record) => transitionTask(record, "running"));
      return;

    case "resume":
      await mutate(rest[0], (record) => transitionTask(record, "running"));
      return;

    case "block": {
      const [id, ...reasonParts] = rest;
      const blocker = required(reasonParts.join(" "), "reason");
      await mutate(id, (record) => transitionTask(record, "blocked", { blocker }));
      return;
    }

    case "validation": {
      const [id, status] = rest;
      if (!new Set(["passed", "failed"]).has(status)) {
        throw new Error("validation status must be passed or failed");
      }
      await mutate(id, (record) => markTaskValidation(record, status));
      return;
    }

    case "review-ready":
      await mutate(rest[0], (record) => transitionTask(record, "review_ready"));
      return;

    case "cancel":
      await mutate(rest[0], (record) => {
        if (record.status === "approved" || record.status === "done") {
          throw new Error("The agent CLI cannot alter an approved or completed task");
        }
        return transitionTask(record, "cancelled");
      });
      return;

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
  console.error(`Agent task command failed: ${error.message}`);
  process.exitCode = 1;
});
