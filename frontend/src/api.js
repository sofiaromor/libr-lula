const APP_BASE_URL = import.meta.env.DEV
  ? new URL("/librelula/", window.location.origin)
  : new URL("../", window.location.href);
const API_BASE_URL = new URL("API/", APP_BASE_URL);

let csrfToken = "";

export function setCsrfToken(token) {
  csrfToken = typeof token === "string" ? token : "";
}

export function appUrl(path = "") {
  return new URL(String(path).replace(/^\/+/, ""), APP_BASE_URL).toString();
}

export function apiUrl(endpoint) {
  return new URL(String(endpoint).replace(/^\/+/, ""), API_BASE_URL).toString();
}

export function publicUrl(path) {
  if (!path) {
    return "";
  }

  const value = String(path).trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  let normalized = value.replace(/^\/+/, "");

  // Compatibilidad con rutas guardadas durante el desarrollo local.
  if (normalized.startsWith("librelula/")) {
    normalized = normalized.slice("librelula/".length);
  }

  return appUrl(normalized);
}

export async function apiFetch(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return fetch(apiUrl(endpoint), {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });
}

export async function readJsonResponse(response) {
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("La API no devolvió un JSON válido.");
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || "Ha ocurrido un error en la API.");
  }

  return data;
}
