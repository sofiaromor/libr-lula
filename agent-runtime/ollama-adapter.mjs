import { Buffer } from "node:buffer";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGES = 32;
const MAX_MESSAGE_CHARS = 32_000;
const MAX_TOTAL_MESSAGE_CHARS = 128_000;
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

function nonEmpty(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function validatePositiveInteger(value, field, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return number;
}

export function normalizeLocalOllamaBaseUrl(value = DEFAULT_BASE_URL) {
  const url = new URL(nonEmpty(value, "Ollama base URL"));
  if (url.protocol !== "http:") {
    throw new Error("Ollama adapter only permits local HTTP endpoints");
  }
  if (url.username || url.password) {
    throw new Error("Ollama base URL must not contain credentials");
  }
  const host = url.hostname.toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
    throw new Error("Ollama adapter only permits loopback hosts");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Ollama base URL must not include an API path");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function validateModelName(value) {
  const model = nonEmpty(value, "model");
  if (model.length > 128 || !/^[A-Za-z0-9._:/-]+$/u.test(model)) {
    throw new Error("model name contains unsupported characters");
  }
  if (/cloud/iu.test(model)) {
    throw new Error("cloud-like Ollama model names are not permitted");
  }
  return model;
}

function validateMessages(messages) {
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > MAX_MESSAGES
  ) {
    throw new Error(`messages must contain between 1 and ${MAX_MESSAGES} items`);
  }

  let total = 0;
  const normalized = messages.map((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error(`message ${index} must be an object`);
    }
    const role = nonEmpty(message.role, `message ${index} role`);
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error(`message ${index} role is not supported`);
    }
    const content = String(message.content ?? "");
    if (!content.trim()) throw new Error(`message ${index} content is required`);
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new Error(
        `message ${index} exceeds ${MAX_MESSAGE_CHARS} characters`,
      );
    }
    total += content.length;
    return { role, content };
  });

  if (total > MAX_TOTAL_MESSAGE_CHARS) {
    throw new Error(
      `messages exceed ${MAX_TOTAL_MESSAGE_CHARS} total characters`,
    );
  }
  return normalized;
}

function validateOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Ollama options must be an object");
  }
  const allowed = new Set(["temperature", "num_predict"]);
  const normalized = {};
  for (const [key, value] of Object.entries(options)) {
    if (!allowed.has(key)) throw new Error(`unsupported Ollama option: ${key}`);
    if (key === "temperature") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 2) {
        throw new Error("temperature must be between 0 and 2");
      }
      normalized.temperature = number;
    }
    if (key === "num_predict") {
      normalized.num_predict = validatePositiveInteger(
        value,
        "num_predict",
        8192,
      );
    }
  }
  return normalized;
}

function normalizeAllowedModels(values = []) {
  if (!Array.isArray(values)) throw new Error("allowedModels must be an array");
  return new Set(values.map(validateModelName));
}

export function createOllamaAdapter({
  baseUrl = DEFAULT_BASE_URL,
  allowedModels = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedBaseUrl = normalizeLocalOllamaBaseUrl(baseUrl);
  const allowed = normalizeAllowedModels(allowedModels);
  const timeout = validatePositiveInteger(timeoutMs, "timeoutMs", 600_000);
  const responseLimit = validatePositiveInteger(
    maxResponseBytes,
    "maxResponseBytes",
    8 * 1024 * 1024,
  );
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }

  async function request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method,
        headers:
          body == null ? undefined : { "content-type": "application/json" },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Ollama request failed with HTTP ${response.status}`);
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > responseLimit) {
        throw new Error("Ollama response exceeds the configured size limit");
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > responseLimit) {
        throw new Error("Ollama response exceeds the configured size limit");
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Ollama returned invalid JSON");
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Ollama request timed out after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    baseUrl: normalizedBaseUrl,

    async version() {
      const payload = await request("/api/version");
      return { version: nonEmpty(payload?.version, "Ollama version") };
    },

    async listModels() {
      const payload = await request("/api/tags");
      if (!Array.isArray(payload?.models)) {
        throw new Error("Ollama models response is invalid");
      }
      return payload.models.map((entry) => ({
        name: String(entry?.name ?? entry?.model ?? ""),
        model: String(entry?.model ?? entry?.name ?? ""),
        size: Number.isFinite(Number(entry?.size)) ? Number(entry.size) : null,
        parameterSize: entry?.details?.parameter_size ?? null,
        quantization: entry?.details?.quantization_level ?? null,
        family: entry?.details?.family ?? null,
      }));
    },

    async chat({ model, messages, options = {} } = {}) {
      const normalizedModel = validateModelName(model);
      if (!allowed.has(normalizedModel)) {
        throw new Error(
          `model is not in the human-approved allowlist: ${normalizedModel}`,
        );
      }
      const payload = await request("/api/chat", {
        method: "POST",
        body: {
          model: normalizedModel,
          messages: validateMessages(messages),
          options: validateOptions(options),
          stream: false,
        },
      });
      const content = String(payload?.message?.content ?? "");
      if (!content) {
        throw new Error("Ollama chat response did not include message content");
      }
      return {
        model: String(payload?.model ?? normalizedModel),
        content,
        done: Boolean(payload?.done),
        doneReason: payload?.done_reason ?? null,
        evalCount: Number.isFinite(Number(payload?.eval_count))
          ? Number(payload.eval_count)
          : null,
        totalDuration: Number.isFinite(Number(payload?.total_duration))
          ? Number(payload.total_duration)
          : null,
      };
    },
  });
}
