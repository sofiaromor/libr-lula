import process from "node:process";

import { resolveRepositoryContext } from "../agent-runtime/repository-context.mjs";
import { planAgentSchedule } from "../agent-runtime/scheduler.mjs";
import { listTaskRecords } from "../agent-runtime/task-store.mjs";

function usage() {
  console.log(`Librélula agent orchestrator planner

Usage:
  node scripts/agent-orchestrator.mjs plan [max-parallel]

This command is read-only. It plans deterministic task starts but does not mutate task state, create worktrees, run models, execute commands, approve work, or merge anything.`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;

  switch (command) {
    case "plan": {
      const context = resolveRepositoryContext();
      const tasks = await listTaskRecords({ storeDir: context.taskStoreDir });
      const maxParallel = rest[0] == null ? 2 : Number(rest[0]);
      print(planAgentSchedule(tasks, { maxParallel }));
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
  console.error(`Agent orchestrator planner failed: ${error.message}`);
  process.exitCode = 1;
});
