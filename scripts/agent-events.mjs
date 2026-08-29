import process from "node:process";

import { readAuditEvents } from "../agent-runtime/audit-log.mjs";

function usage() {
  console.log(`Librélula agent audit log

Usage:
  node scripts/agent-events.mjs list [task-id] [limit]

This CLI is read-only. Runtime modules own event creation and persistence.`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;

  switch (command) {
    case "list": {
      const [taskId, limit] = rest;
      const events = await readAuditEvents({
        taskId: taskId || undefined,
        limit: limit == null ? 100 : Number(limit),
      });
      print(events);
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
  console.error(`Agent audit log failed: ${error.message}`);
  process.exitCode = 1;
});
