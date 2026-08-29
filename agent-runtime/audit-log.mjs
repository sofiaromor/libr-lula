import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { resolveRepositoryContext } from "./repository-context.mjs";

const MAX_EVENT_BYTES = 16 * 1024;
const MAX_DETAIL_STRING = 4096;
const MAX_COLLECTION_ITEMS = 100;
const FORBIDDEN_KEYS = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "password",
  "authorization",
  "cookie",
  "setcookie",
  "stdout",
  "stderr",
  "env",
  "environment",
  "environmentvariables",
  "privatekey",
  "service_role",
  "servicerole",
]);

function nonEmpty(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9_]/gu, "");
}

function assertSafeKey(key, path) {
  const normalized = normalizeKey(key);
  if (
    FORBIDDEN_KEYS.has(normalized) ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("privatekey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret")
  ) {
    throw new Error(`audit event contains forbidden key at ${path}.${key}`);
  }
}

function assertJsonSafe(value, path = "details") {
  if (value === null || typeof value === "boolean") return;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`audit event contains non-finite number at ${path}`);
    }
    return;
  }

  if (typeof value === "string") {
    if (value.length > MAX_DETAIL_STRING) {
      throw new Error(
        `audit event string exceeds ${MAX_DETAIL_STRING} characters at ${path}`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) {
      throw new Error(
        `audit event array exceeds ${MAX_COLLECTION_ITEMS} items at ${path}`,
      );
    }
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`audit event value must be a plain object at ${path}`);
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_COLLECTION_ITEMS) {
      throw new Error(
        `audit event object exceeds ${MAX_COLLECTION_ITEMS} keys at ${path}`,
      );
    }
    for (const [key, nested] of entries) {
      assertSafeKey(key, path);
      assertJsonSafe(nested, `${path}.${key}`);
    }
    return;
  }

  throw new Error(`audit event contains unsupported value at ${path}`);
}

function validateTaskId(value) {
  if (value == null || value === "") return null;
  const id = nonEmpty(value, "task id");
  if (!/^[A-Za-z0-9._-]+$/u.test(id) || id === "." || id === "..") {
    throw new Error("task id contains unsupported characters");
  }
  return id;
}

function validateType(value) {
  const type = nonEmpty(value, "event type");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(type)) {
    throw new Error("event type contains unsupported characters");
  }
  return type;
}

function validateTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid audit event timestamp");
  }
  return date.toISOString();
}

function assertEventSize(event) {
  const bytes = Buffer.byteLength(JSON.stringify(event), "utf8");
  if (bytes > MAX_EVENT_BYTES) {
    throw new Error(`audit event exceeds ${MAX_EVENT_BYTES} bytes`);
  }
}

export function createAuditEvent(
  input,
  { now = new Date(), eventId = randomUUID() } = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("audit event input must be an object");
  }

  const details = input.details ?? {};
  assertJsonSafe(details);

  const event = {
    eventId: nonEmpty(eventId, "event id"),
    timestamp: validateTimestamp(now),
    type: validateType(input.type),
    taskId: validateTaskId(input.taskId),
    actor: nonEmpty(input.actor ?? "agent-runtime", "actor"),
    details,
  };

  assertEventSize(event);
  return event;
}

function resolveEventsFile({ cwd = process.cwd(), eventsFile } = {}) {
  if (eventsFile) return resolve(eventsFile);
  const context = resolveRepositoryContext({ cwd });
  return join(context.runtimeRoot, "audit", "events.jsonl");
}

function validateStoredEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("stored audit event must be an object");
  }
  nonEmpty(event.eventId, "event id");
  validateTimestamp(event.timestamp);
  validateType(event.type);
  validateTaskId(event.taskId);
  nonEmpty(event.actor, "actor");
  assertJsonSafe(event.details ?? {});
  assertEventSize(event);
  return event;
}

export async function appendAuditEvent(input, options = {}) {
  const file = resolveEventsFile(options);
  const event = createAuditEvent(input, options);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
  return event;
}

export async function readAuditEvents({
  cwd = process.cwd(),
  eventsFile,
  taskId,
  limit = 100,
} = {}) {
  const file = resolveEventsFile({ cwd, eventsFile });
  const normalizedLimit = Number(limit);
  if (
    !Number.isInteger(normalizedLimit) ||
    normalizedLimit < 1 ||
    normalizedLimit > 1000
  ) {
    throw new Error("audit event limit must be an integer between 1 and 1000");
  }
  const filterTaskId =
    taskId == null || taskId === "" ? null : validateTaskId(taskId);

  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const events = [];
  const lines = raw.split(/\r?\n/u).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try {
      event = JSON.parse(lines[index]);
      validateStoredEvent(event);
    } catch (error) {
      throw new Error(
        `invalid audit event at line ${index + 1}: ${error.message}`,
      );
    }
    if (!filterTaskId || event.taskId === filterTaskId) events.push(event);
  }

  return events.slice(-normalizedLimit);
}
