import process from "node:process";

import { resolveRepositoryContext } from "../agent-runtime/repository-context.mjs";
import { loadTaskRecord } from "../agent-runtime/task-store.mjs";
import {
  buildSandboxCommand,
  createSandboxPolicy,
  inspectSandboxEngine,
  listSandboxOperations,
} from "../agent-runtime/sandbox-backend.mjs";

function usage() {
  console.log(`Librélula agent sandbox inspector\n\nUsage:\n  node scripts/agent-sandbox.mjs status\n  node scripts/agent-sandbox.mjs operations\n  node scripts/agent-sandbox.mjs plan <task-id> <operation> <human-approved-image> [--network-approved]\n\nThis CLI inspects/plans only. It does not install Docker, pull/build/delete images, execute containers, or modify task state.`);
}

function required(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  switch (command) {
    case "status":
      print(inspectSandboxEngine());
      return;
    case "operations":
      print(listSandboxOperations());
      return;
    case "plan": {
      const [id, operation, image, ...flags] = rest;
      const context = resolveRepositoryContext();
      const record = await loadTaskRecord(required(id, "task id"), {
        storeDir: context.taskStoreDir,
      });
      const approvedImage = required(image, "human-approved image");
      const policy = createSandboxPolicy({ allowedImages: [approvedImage] });
      const plan = buildSandboxCommand(record, required(operation, "operation"), {
        policy,
        image: approvedImage,
        networkApproved: flags.includes("--network-approved"),
      });
      print({
        taskId: plan.taskId,
        operation: plan.operation,
        engine: plan.engine,
        image: plan.image,
        network: plan.network,
        limits: plan.limits,
        command: plan.command,
        args: plan.args,
      });
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
  console.error(`Agent sandbox command failed: ${error.message}`);
  process.exitCode = 1;
});
