import { existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { resolveRepositoryContext } from "./repository-context.mjs";
import { inspectTaskWorktree } from "./worktree-manager.mjs";

const ENGINES = new Set(["docker"]);
const OPERATIONS = Object.freeze(["install", "lint", "test", "build"]);
const DEFAULT_LIMITS = Object.freeze({
  cpus: 4,
  memoryMb: 6144,
  pids: 128,
  timeoutMs: 600_000,
  outputBytes: 1024 * 1024,
  tmpfsMb: 512,
});

function nonEmpty(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function safeTaskId(value) {
  const id = nonEmpty(value, "task id");
  if (!/^[A-Za-z0-9._-]+$/u.test(id) || id === "." || id === "..") {
    throw new Error("task id contains unsupported characters");
  }
  return id;
}

function positiveInteger(value, field, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return number;
}

function positiveNumber(value, field, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) {
    throw new Error(`${field} must be greater than 0 and at most ${max}`);
  }
  return number;
}

function normalizeLimits(input = {}) {
  return {
    cpus: positiveNumber(input.cpus ?? DEFAULT_LIMITS.cpus, "cpus", 16),
    memoryMb: positiveInteger(
      input.memoryMb ?? DEFAULT_LIMITS.memoryMb,
      "memoryMb",
      32768,
    ),
    pids: positiveInteger(input.pids ?? DEFAULT_LIMITS.pids, "pids", 1024),
    timeoutMs: positiveInteger(
      input.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
      "timeoutMs",
      1_800_000,
    ),
    outputBytes: positiveInteger(
      input.outputBytes ?? DEFAULT_LIMITS.outputBytes,
      "outputBytes",
      8 * 1024 * 1024,
    ),
    tmpfsMb: positiveInteger(
      input.tmpfsMb ?? DEFAULT_LIMITS.tmpfsMb,
      "tmpfsMb",
      4096,
    ),
  };
}

function normalizeAllowedImages(values) {
  if (!Array.isArray(values)) throw new Error("allowedImages must be an array");
  return new Set(
    values.map((value) => {
      const image = nonEmpty(value, "sandbox image");
      if (image.length > 256 || /\s/u.test(image)) {
        throw new Error("sandbox image contains unsupported characters");
      }
      return image;
    }),
  );
}

function normalizeEngine(value) {
  const engine = nonEmpty(value, "sandbox engine").toLowerCase();
  if (!ENGINES.has(engine)) {
    throw new Error(`unsupported sandbox engine: ${engine}`);
  }
  return engine;
}

function normalizeOperation(value) {
  const operation = nonEmpty(value, "sandbox operation");
  if (!OPERATIONS.includes(operation)) {
    throw new Error(`unsupported sandbox operation: ${operation}`);
  }
  return operation;
}

function commandFor(operation) {
  switch (operation) {
    case "install":
      return ["npm", "ci", "--ignore-scripts", "--cache", "/tmp/npm-cache"];
    case "lint":
      return ["npm", "run", "lint"];
    case "test":
      return ["npm", "run", "test"];
    case "build":
      return ["npm", "run", "build", "--", "--outDir", "/tmp/librelula-build"];
    default:
      throw new Error(`unsupported sandbox operation: ${operation}`);
  }
}

function needsNetwork(operation) {
  return operation === "install";
}

function assertActiveTask(record) {
  if (!record || typeof record !== "object") throw new Error("task record is required");
  if (!new Set(["running", "validation_failed"]).has(record.status)) {
    throw new Error(`sandbox execution requires an active task, found: ${record.status}`);
  }
  if (!String(record.branch ?? "").startsWith("agent/")) {
    throw new Error("sandbox execution requires an agent/* task branch");
  }
}

export function listSandboxOperations() {
  return [...OPERATIONS];
}

export function inspectSandboxEngine({
  engine = "docker",
  spawn = spawnSync,
} = {}) {
  const normalizedEngine = normalizeEngine(engine);
  const result = spawn(normalizedEngine, ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    windowsHide: true,
  });

  return {
    engine: normalizedEngine,
    available: !result.error && result.status === 0,
    version:
      !result.error && result.status === 0 ? String(result.stdout ?? "").trim() || null : null,
    errorCode: result.error?.code ? String(result.error.code) : null,
  };
}

export function createSandboxPolicy({
  engine = "docker",
  allowedImages = [],
  limits = {},
  containerUser = "1000:1000",
} = {}) {
  const normalizedEngine = normalizeEngine(engine);
  const images = normalizeAllowedImages(allowedImages);
  const normalizedLimits = normalizeLimits(limits);
  const user = nonEmpty(containerUser, "containerUser");

  return Object.freeze({
    engine: normalizedEngine,
    allowedImages: Object.freeze([...images]),
    limits: Object.freeze({ ...normalizedLimits }),
    containerUser: user,
  });
}

export function buildSandboxCommand(
  record,
  operation,
  {
    cwd = process.cwd(),
    policy,
    image,
    networkApproved = false,
  } = {},
) {
  assertActiveTask(record);
  if (!policy || typeof policy !== "object") throw new Error("sandbox policy is required");
  const engine = normalizeEngine(policy.engine);
  const allowedImages = normalizeAllowedImages(policy.allowedImages);
  const selectedImage = nonEmpty(image, "sandbox image");
  if (!allowedImages.has(selectedImage)) {
    throw new Error(`sandbox image is not human-allowlisted: ${selectedImage}`);
  }

  const name = normalizeOperation(operation);
  if (needsNetwork(name) && !networkApproved) {
    throw new Error("sandbox install requires explicit network approval");
  }

  const inspected = inspectTaskWorktree(record, { cwd });
  if (!inspected.registered || !inspected.matches) {
    throw new Error("task worktree is not registered on the expected agent branch");
  }

  const context = resolveRepositoryContext({ cwd });
  const id = safeTaskId(record.id);
  const sandboxRoot = join(context.runtimeRoot, "sandboxes", id);
  const nodeModules = join(sandboxRoot, "node_modules");
  mkdirSync(nodeModules, { recursive: true });

  const limits = normalizeLimits(policy.limits);
  const args = [
    "run",
    "--rm",
    "--pull=never",
    `--network=${needsNetwork(name) ? "bridge" : "none"}`,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    `--pids-limit=${limits.pids}`,
    `--cpus=${limits.cpus}`,
    `--memory=${limits.memoryMb}m`,
    `--memory-swap=${limits.memoryMb}m`,
    `--user=${nonEmpty(policy.containerUser, "containerUser")}`,
    `--tmpfs=/tmp:rw,noexec,nosuid,size=${limits.tmpfsMb}m`,
    "--mount",
    `type=bind,src=${resolve(inspected.path)},dst=/workspace,readonly`,
    "--mount",
    `type=bind,src=${resolve(nodeModules)},dst=/workspace/frontend/node_modules`,
    "--workdir=/workspace/frontend",
    "--env=HOME=/tmp/home",
    "--env=NPM_CONFIG_USERCONFIG=/dev/null",
    "--env=NPM_CONFIG_AUDIT=false",
    "--env=NPM_CONFIG_FUND=false",
    "--env=NPM_CONFIG_UPDATE_NOTIFIER=false",
    selectedImage,
    ...commandFor(name),
  ];

  return {
    taskId: id,
    operation: name,
    engine,
    image: selectedImage,
    command: engine,
    args,
    cwd: context.primaryRoot,
    network: needsNetwork(name) ? "bridge" : "none",
    limits,
    timeoutMs: limits.timeoutMs,
    outputBytes: limits.outputBytes,
    worktree: inspected.path,
    nodeModules,
  };
}

export function runSandboxedTaskOperation(
  record,
  operation,
  options = {},
) {
  const plan = buildSandboxCommand(record, operation, options);
  const engine = inspectSandboxEngine({
    engine: plan.engine,
    spawn: options.spawn ?? spawnSync,
  });
  if (!engine.available) {
    throw new Error(`sandbox engine is unavailable: ${engine.engine}`);
  }

  const spawn = options.spawn ?? spawnSync;
  const started = new Date();
  const result = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    encoding: "utf8",
    shell: false,
    timeout: plan.timeoutMs,
    maxBuffer: plan.outputBytes,
    windowsHide: true,
    env: {},
  });
  const finished = new Date();
  const errorCode = result.error?.code ? String(result.error.code) : null;

  return {
    taskId: plan.taskId,
    operation: plan.operation,
    engine: plan.engine,
    image: basename(plan.image),
    ok: !result.error && result.status === 0,
    exitCode: result.status,
    signal: result.signal ?? null,
    timedOut: errorCode === "ETIMEDOUT",
    outputLimitExceeded: errorCode === "ENOBUFS",
    errorCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    network: plan.network,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
  };
}

export function toSandboxAuditEvent(result) {
  if (!result || typeof result !== "object") throw new Error("sandbox result is required");
  return {
    type: "agent.sandbox.completed",
    taskId: safeTaskId(result.taskId),
    details: {
      operation: nonEmpty(result.operation, "operation"),
      engine: nonEmpty(result.engine, "engine"),
      image: nonEmpty(result.image, "image"),
      ok: Boolean(result.ok),
      exitCode: result.exitCode ?? null,
      signal: result.signal ?? null,
      timedOut: Boolean(result.timedOut),
      outputLimitExceeded: Boolean(result.outputLimitExceeded),
      network: nonEmpty(result.network, "network"),
      durationMs: Number(result.durationMs ?? 0),
    },
  };
}
