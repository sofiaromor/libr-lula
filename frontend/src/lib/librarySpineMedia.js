export const LIBRARY_SPINE_BUCKET = "library-spines";
export const LIBRARY_SPINE_VIEW_STORAGE_KEY = "librelula.library.view";
export const LIBRARY_SPINE_MAX_BYTES = 5 * 1024 * 1024;
export const LIBRARY_SPINE_ACCEPTED_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXTENSION_BY_TYPE = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

function cleanText(value) {
  return String(value ?? "").trim();
}

function safePathPart(value, fallback) {
  const clean = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .slice(0, 120);

  return clean || fallback;
}

export function normalizeLibraryViewMode(value) {
  return value === "spines" ? "spines" : "covers";
}

export function validateSpineImageFile(file) {
  if (!file) {
    return { valid: false, error: "Selecciona una imagen para el lomo." };
  }

  const type = cleanText(file.type).toLowerCase();
  const size = Number(file.size || 0);

  if (!LIBRARY_SPINE_ACCEPTED_TYPES.includes(type)) {
    return {
      valid: false,
      error: "Usa una imagen JPG, PNG o WebP.",
    };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: "La imagen seleccionada está vacía." };
  }

  if (size > LIBRARY_SPINE_MAX_BYTES) {
    return {
      valid: false,
      error: "La foto del lomo no puede superar 5 MB.",
    };
  }

  return { valid: true, error: "" };
}

export function buildSpineStoragePath({ userId, bookId, fileType, now = Date.now() }) {
  const userPart = safePathPart(userId, "user");
  const bookPart = safePathPart(bookId, "book");
  const extension = EXTENSION_BY_TYPE[cleanText(fileType).toLowerCase()] || "jpg";
  const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  return `${userPart}/${bookPart}/spine-${timestamp}.${extension}`;
}
