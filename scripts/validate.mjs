import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const frontendDir = join(repoRoot, "frontend");
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error(
    "npm_execpath is unavailable. Run validation with: npm --prefix frontend run validate",
  );
}

function run(command, args, cwd = repoRoot) {
  console.log(`\n> ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Validation command failed (${result.status}): ${command} ${args.join(" ")}`,
    );
  }
}

function runNpm(args) {
  run(process.execPath, [npmCli, ...args], frontendDir);
}

let buildDir;

try {
  buildDir = mkdtempSync(join(tmpdir(), "librelula-build-"));

  console.log("Librélula validation starting...");

  runNpm(["run", "lint"]);
  runNpm(["run", "test"]);

  runNpm([
    "run",
    "build",
    "--",
    "--outDir",
    buildDir,
  ]);

  run("git", ["diff", "--check", "HEAD"]);
  run("git", ["status", "--short"]);

  console.log("\nLibrélula validation passed.");
} finally {
  if (buildDir) {
    rmSync(buildDir, { recursive: true, force: true });
  }
}
