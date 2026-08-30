import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function validateTaskId(id) {
  const normalized = String(id ?? "").trim();
  if (!normalized) throw new Error("task id is required");
  if (!/^[A-Za-z0-9._-]+$/u.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error("task id contains unsupported characters");
  }
  return normalized;
}

function taskPath(id, storeDir) {
  const safeId = validateTaskId(id);
  const root = resolve(storeDir);
  const file = resolve(root, `${safeId}.json`);

  if (!file.startsWith(`${root}/`) && !file.startsWith(`${root}\\`)) {
    throw new Error("task path escaped the runtime store");
  }

  return file;
}

function assertRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("task record must be an object");
  }

  const id = validateTaskId(record.id);
  if (typeof record.status !== "string" || !record.status.trim()) {
    throw new Error("task record status is required");
  }

  return id;
}

export async function saveTaskRecord(
  record,
  { storeDir = ".agent/tasks" } = {},
) {
  const id = assertRecord(record);
  const root = resolve(storeDir);
  const file = taskPath(id, root);
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(root, { recursive: true });
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temp, file);

  return file;
}

export async function loadTaskRecord(
  id,
  { storeDir = ".agent/tasks" } = {},
) {
  const safeId = validateTaskId(id);
  const raw = await readFile(taskPath(safeId, storeDir), "utf8");
  const record = JSON.parse(raw);
  const recordId = assertRecord(record);

  if (recordId !== safeId) {
    throw new Error(`task record id mismatch: expected ${safeId}, found ${recordId}`);
  }

  return record;
}

export async function listTaskRecords({ storeDir = ".agent/tasks" } = {}) {
  const root = resolve(storeDir);
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(ids.map((id) => loadTaskRecord(id, { storeDir: root })));
}
