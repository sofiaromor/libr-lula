import process from "node:process";

import {
  listApprovedOperations,
  runApprovedTaskCommand,
  toCommandAuditEvent,
} from "../agent-runtime/command-runner.mjs";
import { resolveRepositoryContext } from "../agent-runtime/repository-context.mjs";
import { loadTaskRecord } from "../agent-runtime/task-store.mjs";

function usage() {
  console.log(`Librélula agent command runner

Usage:
  node scripts/agent-run.mjs operations
  node scripts/agent-run.mjs run <task-id> <operation>

Operations are fixed by the runtime allowlist. Arbitrary executables or arguments are not accepted.`);
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

  switch (command) {
    case "operations":
      print(listApprovedOperations());
      return;

    case "run": {
      const [id, operation] = rest;
      const context = resolveRepositoryContext();
      const record = await loadTaskRecord(required(id, "task id"), {
        storeDir: context.taskStoreDir,
      });
      const result = runApprovedTaskCommand(record, required(operation, "operation"), {
        cwd: context.primaryRoot,
      });
      print({
        result,
        audit: toCommandAuditEvent(result),
      });
      if (!result.ok) process.exitCode = result.exitCode ?? 1;
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
  console.error(`Agent command runner failed: ${error.message}`);
  process.exitCode = 1;
});
