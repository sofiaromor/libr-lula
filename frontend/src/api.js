import {
  getCatalogBooks,
  getCatalogUserBooks,
  saveCatalogUserBookStatus,
} from "./lib/catalogApi.js";
import {
  createBookPostit,
  deleteBookPostit,
  getBookPostits,
} from "./lib/bookPostitsApi.js";

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

  if (import.meta.env.DEV && normalized.startsWith("images/")) {
    return new URL(`/${normalized}`, window.location.origin).toString();
  }

  return appUrl(normalized);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data || {}), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function jsonErrorResponse(error) {
  const status = Number(error?.status || 500);

  return jsonResponse(
    {
      ok: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Ha ocurrido un error en la API.",
    },
    status,
  );
}

function endpointUrl(endpoint) {
  return new URL(String(endpoint).replace(/^\/+/, ""), API_BASE_URL);
}

function endpointName(endpoint) {
  const url = endpointUrl(endpoint);
  return url.pathname.split("/").pop() || "";
}

function parseJsonBody(options) {
  if (!options?.body) {
    return {};
  }

  if (typeof options.body === "string") {
    return JSON.parse(options.body);
  }

  return {};
}

async function localCatalogApiFetch(endpoint, options, method) {
  const name = endpointName(endpoint);

  if (name === "get_books.php" && method === "GET") {
    return jsonResponse(await getCatalogBooks());
  }

  if (name === "catalog_user_books.php" && method === "GET") {
    const url = endpointUrl(endpoint);

    return jsonResponse(
      await getCatalogUserBooks({
        bookId: url.searchParams.get("book_id") || "",
      }),
    );
  }

  if (name === "catalog_user_books.php" && method === "POST") {
    const body = parseJsonBody(options);

    return jsonResponse(
      await saveCatalogUserBookStatus({
        book_id: body.book_id,
        status: body.status,
      }),
    );
  }

  if (name === "book_postits.php" && method === "GET") {
    const url = endpointUrl(endpoint);
    return jsonResponse(
      await getBookPostits({
        bookId: url.searchParams.get("book_id"),
      }),
    );
  }

  if (name === "book_postits.php" && method === "POST") {
    const body = await parseJsonBody(options);
    return jsonResponse(await createBookPostit(body));
  }

  if (name === "book_postits.php" && method === "DELETE") {
    const body = await parseJsonBody(options);
    return jsonResponse(await deleteBookPostit(body));
  }

  return null;
}

export async function apiFetch(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();

  try {
    const localResponse = await localCatalogApiFetch(endpoint, options, method);

    if (localResponse) {
      return localResponse;
    }
  } catch (error) {
    return jsonErrorResponse(error);
  }

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