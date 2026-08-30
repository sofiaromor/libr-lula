import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTaskRecord } from "../../agent-runtime/task-record.mjs";
import {
  listTaskRecords,
  loadTaskRecord,
  saveTaskRecord,
} from "../../agent-runtime/task-store.mjs";

async function withStore(run) {
  const storeDir = await mkdtemp(join(tmpdir(), "librelula-agent-store-"));
  try {
    await run(storeDir);
  } finally {
    await rm(storeDir, { recursive: true, force: true });
  }
}

function task(id, title = "Runtime task") {
  return createTaskRecord(
    {
      id,
      title,
      risk: "low",
      scope: [],
      acceptance_criteria: [],
    },
    new Date("2026-08-29T12:00:00.000Z"),
  );
}

test("task store saves and loads a task record", async () => {
  await withStore(async (storeDir) => {
    const original = task("DEV-100");
    await saveTaskRecord(original, { storeDir });

    const loaded = await loadTaskRecord("DEV-100", { storeDir });
    assert.deepEqual(loaded, original);
  });
});

test("task store overwrites an existing record with the latest state", async () => {
  await withStore(async (storeDir) => {
    const original = task("DEV-101");
    await saveTaskRecord(original, { storeDir });
    await saveTaskRecord({ ...original, status: "running" }, { storeDir });

    const loaded = await loadTaskRecord("DEV-101", { storeDir });
    assert.equal(loaded.status, "running");
  });
});

test("task store lists task records in deterministic id order", async () => {
  await withStore(async (storeDir) => {
    await saveTaskRecord(task("DEV-200"), { storeDir });
    await saveTaskRecord(task("DEV-100"), { storeDir });

    const records = await listTaskRecords({ storeDir });
    assert.deepEqual(records.map((record) => record.id), ["DEV-100", "DEV-200"]);
  });
});

test("task store returns an empty list when the store does not exist", async () => {
  await withStore(async (storeDir) => {
    const missing = join(storeDir, "missing");
    assert.deepEqual(await listTaskRecords({ storeDir: missing }), []);
  });
});

test("task store rejects path traversal task ids", async () => {
  await withStore(async (storeDir) => {
    await assert.rejects(
      () => loadTaskRecord("../outside", { storeDir }),
      /unsupported characters/u,
    );
  });
});
