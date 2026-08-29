import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { inspectTaskWorktree } from "./worktree-manager.mjs";

const ACTIVE_STATUSES = new Set(["running", "validation_failed"]);
const SAFE_ENV_KEYS = [
  "PATH",
  "Path",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "CI",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
];

const OPERATION_NAMES = Object.freeze([
  "preflight",
  "git-status",
  "git-diff-check",
  "install",
  "lint",
  "test",
  "validate",
]);

function normalizedText(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

export function buildSafeEnvironment(source = process.env, { worktreeRoot } = {}) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (source[key] != null && source[key] !== "") env[key] = String(source[key]);
  }

  if (worktreeRoot) {
    const disabledUserConfig = join(resolve(worktreeRoot), ".agent-npmrc-disabled");
    env.NPM_CONFIG_USERCONFIG = disabledUserConfig;
    env.npm_config_userconfig = disabledUserConfig;
  }

  env.NO_COLOR = "1";
  env.NPM_CONFIG_AUDIT = "false";
  env.NPM_CONFIG_FUND = "false";
  env.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  return env;
}

export function listApprovedOperations() {
  return [...OPERATION_NAMES];
}

function resolveNpmCliPath() {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];

  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (!npmCli) {
    throw new Error("Unable to locate npm CLI beside the active Node.js installation");
  }
  return npmCli;
}

function npmSpec(args, cwd, timeoutMs) {
  return {
    command: process.execPath,
    args: [resolveNpmCliPath(), ...args],
    cwd,
    timeoutMs,
  };
}

export function buildApprovedCommand(operation, worktreeRoot) {
  const name = normalizedText(operation, "operation");
  if (!OPERATION_NAMES.includes(name)) {
    throw new Error(`Unsupported agent command operation: ${name}`);
  }

  const root = resolve(worktreeRoot);
  const frontend = join(root, "frontend");

  switch (name) {
    case "preflight":
      return {
        command: process.execPath,
        args: [join(root, "scripts", "agent-preflight.mjs")],
        cwd: root,
        timeoutMs: 60_000,
      };
    case "git-status":
      return {
        command: "git",
        args: ["status", "--short"],
        cwd: root,
        timeoutMs: 60_000,
      };
    case "git-diff-check":
      return {
        command: "git",
        args: ["diff", "--check", "HEAD"],
        cwd: root,
        timeoutMs: 60_000,
      };
    case "install":
      return npmSpec(["ci", "--ignore-scripts"], frontend, 600_000);
    case "lint":
      return npmSpec(["run", "lint"], frontend, 300_000);
    case "test":
      return npmSpec(["run", "test"], frontend, 300_000);
    case "validate":
      return npmSpec(["run", "validate"], frontend, 600_000);
    default:
      throw new Error(`Unsupported agent command operation: ${name}`);
  }
}

function assertRunnableRecord(record) {
  if (!record || typeof record !== "object") throw new Error("task record is required");
  if (!ACTIVE_STATUSES.has(record.status)) {
    throw new Error(
      `Agent commands require a running or validation_failed task, found: ${record.status}`,
    );
  }
}

export function runApprovedTaskCommand(record, operation, { cwd = process.cwd() } = {}) {
  assertRunnableRecord(record);
  const inspected = inspectTaskWorktree(record, { cwd });
  if (!inspected.registered || !inspected.matches) {
    throw new Error("Task worktree is not registered on the expected agent branch");
  }

  const spec = buildApprovedCommand(operation, inspected.path);
  const startedAt = new Date();
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd,
    encoding: "utf8",
    shell: false,
    timeout: spec.timeoutMs,
    maxBuffer: 1024 * 1024,
    env: buildSafeEnvironment(process.env, { worktreeRoot: inspected.path }),
  });
  const finishedAt = new Date();
  const errorCode = result.error?.code ? String(result.error.code) : null;
  const outputLimitExceeded = errorCode === "ENOBUFS";

  return {
    taskId: normalizedText(record.id, "task id"),
    operation: normalizedText(operation, "operation"),
    ok: !result.error && result.status === 0,
    exitCode: result.status,
    signal: result.signal ?? null,
    timedOut: errorCode === "ETIMEDOUT",
    outputLimitExceeded,
    error: result.error ? { code: errorCode, message: result.error.message } : null,
    cwd: spec.cwd,
    command: spec.command,
    args: [...spec.args],
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}

export function toCommandAuditEvent(result) {
  if (!result || typeof result !== "object") throw new Error("command result is required");
  return {
    type: "agent.command.completed",
    taskId: normalizedText(result.taskId, "task id"),
    operation: normalizedText(result.operation, "operation"),
    ok: Boolean(result.ok),
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    timedOut: Boolean(result.timedOut),
    outputLimitExceeded: Boolean(result.outputLimitExceeded),
    durationMs: Number(result.durationMs ?? 0),
    startedAt: result.startedAt ?? null,
    finishedAt: result.finishedAt ?? null,
  };
}
