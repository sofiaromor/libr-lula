import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendAuditEvent,
  createAuditEvent,
  readAuditEvents,
} from "../../agent-runtime/audit-log.mjs";
import { toCommandAuditEvent } from "../../agent-runtime/command-runner.mjs";

async function withAuditFile(run) {
  const root = await mkdtemp(join(tmpdir(), "librelula-audit-log-"));
  const eventsFile = join(root, "events.jsonl");
  try {
    await run(eventsFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("createAuditEvent builds a stable safe envelope", () => {
  const event = createAuditEvent(
    {
      type: "task.state.changed",
      taskId: "DEV-900",
      details: { from: "queued", to: "running" },
    },
    {
      now: new Date("2026-01-01T00:00:00.000Z"),
      eventId: "event-900",
    },
  );

  assert.deepEqual(event, {
    eventId: "event-900",
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "task.state.changed",
    taskId: "DEV-900",
    actor: "agent-runtime",
    details: { from: "queued", to: "running" },
  });
});

test("audit events reject sensitive and raw-output keys", () => {
  assert.throws(
    () => createAuditEvent({ type: "unsafe", details: { stdout: "raw" } }),
    /forbidden key/u,
  );
  assert.throws(
    () =>
      createAuditEvent({
        type: "unsafe",
        details: { nested: { accessToken: "x" } },
      }),
    /forbidden key/u,
  );
});

test("appendAuditEvent persists events in append order", async () => {
  await withAuditFile(async (eventsFile) => {
    await appendAuditEvent(
      {
        type: "task.created",
        taskId: "DEV-901",
        details: { risk: "low" },
      },
      {
        eventsFile,
        eventId: "one",
        now: new Date("2026-01-01T00:00:00Z"),
      },
    );
    await appendAuditEvent(
      { type: "task.started", taskId: "DEV-901", details: {} },
      {
        eventsFile,
        eventId: "two",
        now: new Date("2026-01-01T00:00:01Z"),
      },
    );

    const events = await readAuditEvents({ eventsFile });
    assert.deepEqual(
      events.map((event) => event.eventId),
      ["one", "two"],
    );
  });
});

test("readAuditEvents filters by task and returns the newest limit", async () => {
  await withAuditFile(async (eventsFile) => {
    for (let index = 1; index <= 4; index += 1) {
      await appendAuditEvent(
        {
          type: "task.tick",
          taskId: index === 2 ? "DEV-other" : "DEV-902",
          details: { index },
        },
        {
          eventsFile,
          eventId: `event-${index}`,
          now: new Date(2026, 0, 1, 0, 0, index),
        },
      );
    }

    const events = await readAuditEvents({
      eventsFile,
      taskId: "DEV-902",
      limit: 2,
    });
    assert.deepEqual(
      events.map((event) => event.eventId),
      ["event-3", "event-4"],
    );
  });
});

test("readAuditEvents returns an empty list for a missing log", async () => {
  await withAuditFile(async (eventsFile) => {
    assert.deepEqual(await readAuditEvents({ eventsFile }), []);
  });
});

test("readAuditEvents reports malformed persisted data", async () => {
  await withAuditFile(async (eventsFile) => {
    await writeFile(eventsFile, "{not-json}\n", "utf8");
    await assert.rejects(() => readAuditEvents({ eventsFile }), /line 1/u);
  });
});

test("command audit summaries fit the persistent event schema without raw output", () => {
  const input = toCommandAuditEvent({
    taskId: "DEV-903",
    operation: "validate",
    ok: true,
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    durationMs: 42,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.042Z",
    stdout: "do not persist",
    stderr: "do not persist",
    cwd: "C:/private/path",
  });
  const event = createAuditEvent(input, {
    eventId: "command-event",
    now: new Date("2026-01-01T00:00:01.000Z"),
  });

  assert.equal(event.type, "agent.command.completed");
  assert.equal(event.taskId, "DEV-903");
  assert.equal(event.details.operation, "validate");
  assert.equal(event.details.stdout, undefined);
  assert.equal(event.details.cwd, undefined);
});
