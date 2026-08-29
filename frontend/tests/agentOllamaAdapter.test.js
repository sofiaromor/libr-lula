import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";

import {
  createOllamaAdapter,
  normalizeLocalOllamaBaseUrl,
} from "../../agent-runtime/ollama-adapter.mjs";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function json(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

test("Ollama base URL is restricted to local loopback HTTP", () => {
  assert.equal(
    normalizeLocalOllamaBaseUrl(),
    "http://127.0.0.1:11434",
  );
  assert.equal(
    normalizeLocalOllamaBaseUrl("http://localhost:11434/"),
    "http://localhost:11434",
  );
  assert.throws(
    () => normalizeLocalOllamaBaseUrl("https://localhost:11434"),
    /local HTTP/u,
  );
  assert.throws(
    () => normalizeLocalOllamaBaseUrl("http://example.com:11434"),
    /loopback/u,
  );
  assert.throws(
    () =>
      normalizeLocalOllamaBaseUrl("http://user:pass@127.0.0.1:11434"),
    /credentials/u,
  );
});

test("version and local model listing are read-only and compact", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/api/version") {
        json(res, { version: "1.2.3" });
        return;
      }
      if (req.url === "/api/tags") {
        json(res, {
          models: [
            {
              name: "qwen-test:7b",
              model: "qwen-test:7b",
              size: 123,
              details: {
                family: "qwen",
                parameter_size: "7B",
                quantization_level: "Q4_K_M",
              },
            },
          ],
        });
        return;
      }
      json(res, { error: "not found" }, 404);
    },
    async (baseUrl) => {
      const adapter = createOllamaAdapter({ baseUrl });
      assert.deepEqual(await adapter.version(), { version: "1.2.3" });
      assert.deepEqual(await adapter.listModels(), [
        {
          name: "qwen-test:7b",
          model: "qwen-test:7b",
          size: 123,
          parameterSize: "7B",
          quantization: "Q4_K_M",
          family: "qwen",
        },
      ]);
    },
  );
});

test("chat is disabled until a model is human-allowlisted", async () => {
  const adapter = createOllamaAdapter();
  await assert.rejects(
    () =>
      adapter.chat({
        model: "qwen-test:7b",
        messages: [{ role: "user", content: "hi" }],
      }),
    /allowlist/u,
  );
});

test("cloud-like model names are rejected even when configuring the allowlist", () => {
  assert.throws(
    () => createOllamaAdapter({ allowedModels: ["gpt-oss:120b-cloud"] }),
    /cloud-like/u,
  );
});

test("chat posts stream false and omits thinking from returned data", async () => {
  await withServer(
    async (req, res) => {
      if (req.url !== "/api/chat" || req.method !== "POST") {
        json(res, { error: "not found" }, 404);
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      assert.equal(parsed.stream, false);
      assert.equal(parsed.model, "qwen-test:7b");
      assert.deepEqual(parsed.messages, [
        { role: "user", content: "hello" },
      ]);
      json(res, {
        model: "qwen-test:7b",
        message: {
          role: "assistant",
          content: "world",
          thinking: "private reasoning",
        },
        done: true,
        done_reason: "stop",
        eval_count: 4,
        total_duration: 9,
      });
    },
    async (baseUrl) => {
      const adapter = createOllamaAdapter({
        baseUrl,
        allowedModels: ["qwen-test:7b"],
      });
      const result = await adapter.chat({
        model: "qwen-test:7b",
        messages: [{ role: "user", content: "hello" }],
      });
      assert.deepEqual(result, {
        model: "qwen-test:7b",
        content: "world",
        done: true,
        doneReason: "stop",
        evalCount: 4,
        totalDuration: 9,
      });
      assert.equal(result.thinking, undefined);
    },
  );
});

test("chat validates roles and bounded generation options", async () => {
  const adapter = createOllamaAdapter({ allowedModels: ["qwen-test:7b"] });
  await assert.rejects(
    () =>
      adapter.chat({
        model: "qwen-test:7b",
        messages: [{ role: "tool", content: "x" }],
      }),
    /role is not supported/u,
  );
  await assert.rejects(
    () =>
      adapter.chat({
        model: "qwen-test:7b",
        messages: [{ role: "user", content: "x" }],
        options: { num_predict: 99999 },
      }),
    /num_predict/u,
  );
});

test("requests time out and response size is bounded", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/api/version") {
        setTimeout(() => json(res, { version: "slow" }), 100);
        return;
      }
      json(res, { error: "not found" }, 404);
    },
    async (baseUrl) => {
      const adapter = createOllamaAdapter({ baseUrl, timeoutMs: 10 });
      await assert.rejects(() => adapter.version(), /timed out/u);
    },
  );

  await withServer(
    (req, res) => {
      json(res, { version: "x".repeat(1000) });
    },
    async (baseUrl) => {
      const adapter = createOllamaAdapter({
        baseUrl,
        maxResponseBytes: 64,
      });
      await assert.rejects(() => adapter.version(), /size limit/u);
    },
  );
});

test("chunked Ollama responses are bounded while streaming", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"version":"');
      res.write("x".repeat(128));
      res.end('"}');
    },
    async (baseUrl) => {
      const adapter = createOllamaAdapter({
        baseUrl,
        maxResponseBytes: 64,
      });
      await assert.rejects(() => adapter.version(), /size limit/u);
    },
  );
});
