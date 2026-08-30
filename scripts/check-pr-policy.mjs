import { spawnSync } from "node:child_process";

const [baseSha, headSha, headRef = ""] = process.argv.slice(2);

if (!baseSha || !headSha) {
  console.error("Usage: node scripts/check-pr-policy.mjs <base-sha> <head-sha> [head-ref]");
  process.exit(2);
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "git command failed\n");
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

const files = git([
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  `${baseSha}...${headSha}`,
])
  .split(/\r?\n/u)
  .map((file) => file.trim().replaceAll("\\", "/"))
  .filter(Boolean);

const isAgentBranch = headRef.startsWith("agent/");

const forbiddenPatterns = [
  /(^|\/)\.env(?:\.|$)/iu,
  /^database\/librelula\.db$/iu,
  /\.bak$/iu,
  /\.(?:sqlite|sqlite3)$/iu,
  /(^|\/)(?:id_rsa|id_ed25519)$/iu,
  /\.(?:pem|p12|pfx)$/iu,
];

const governancePatterns = [
  /^AGENTS\.md$/u,
  /^docs\/AGENT_TASK_PROTOCOL\.md$/u,
  /^docs\/REPOSITORY_PROTECTION\.md$/u,
  /^\.github\//u,
  /^scripts\/check-pr-policy\.mjs$/u,
];

const reviewSensitivePatterns = [
  /^supabase\//u,
  /^vercel\.json$/u,
  /^frontend\/package(?:-lock)?\.json$/u,
  /(^|\/)(?:auth|login|permissions?|rls)(?:\/|\.|$)/iu,
];

const forbidden = files.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);

const governance = files.filter((file) =>
  governancePatterns.some((pattern) => pattern.test(file)),
);

const reviewSensitive = files.filter((file) =>
  reviewSensitivePatterns.some((pattern) => pattern.test(file)),
);

let failed = false;

for (const file of forbidden) {
  console.error(
    `::error file=${file}::PR policy blocks sensitive/local file from being committed: ${file}`,
  );
  failed = true;
}

if (isAgentBranch) {
  for (const file of governance) {
    console.error(
      `::error file=${file}::agent/* branches may not modify repository governance or CI controls: ${file}`,
    );
    failed = true;
  }
}

for (const file of reviewSensitive) {
  console.warn(
    `::warning file=${file}::Sensitive review area changed; explicit human review is required: ${file}`,
  );
}

console.log(
  `PR policy checked ${files.length} changed file(s) on ${headRef || "unknown branch"}.`,
);

if (failed) {
  console.error("PR policy failed.");
  process.exit(1);
}

console.log("PR policy passed.");
