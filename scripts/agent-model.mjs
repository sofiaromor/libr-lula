import process from "node:process";

import { createOllamaAdapter } from "../agent-runtime/ollama-adapter.mjs";

function usage() {
  console.log(`Librélula local model inspector

Usage:
  node scripts/agent-model.mjs status [base-url]
  node scripts/agent-model.mjs models [base-url]

This CLI is read-only. It cannot pull, create, delete, or run models.`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(args = process.argv.slice(2)) {
  const [command, baseUrl] = args;
  const adapter = createOllamaAdapter({
    baseUrl: baseUrl || undefined,
  });

  switch (command) {
    case "status":
      print({ baseUrl: adapter.baseUrl, ...(await adapter.version()) });
      return;

    case "models":
      print(await adapter.listModels());
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
  console.error(`Local model inspector failed: ${error.message}`);
  process.exitCode = 1;
});
