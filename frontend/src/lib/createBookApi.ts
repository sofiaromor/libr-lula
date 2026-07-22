import { supabase } from "./supabase.js";

const BOOK_SELECT = `
  id,
  title,
  author,
  synopsis,
  cover,
  genre,
  year,
  pages,
  publisher,
  language,
  isbn,
  saga_name,
  saga_number,
  saga_key,
  hero_color,
  pdf_file,
  epub_file,
  provider,
  source_id,
  review_status,
  created_by,
  submitted_by_legacy_user_id,
  approved_by,
  approved_at,
  rejected_at,
  moderation_note,
  created_at
`;

const BOOK_COVERS_BUCKET = "book-covers";

type BookInput = FormData | Record<string, unknown>;
type TaxonomyKind = "theme" | "aesthetic" | "audience";

function apiError(message: string, status = 500) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function hasFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function hasFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function getValue(input: BookInput, name: string): unknown {
  if (hasFormData(input)) {
    return input.get(name);
  }

  return input?.[name];
}

function getAllValues(input: BookInput, name: string): unknown[] {
  if (hasFormData(input)) {
    return input.getAll(name);
  }

  const value = input?.[name];
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function asText(value: unknown): string {
  if (hasFile(value)) return "";
  return String(value ?? "").trim();
}

function textOrNull(value: unknown): string | null {
  const text = asText(value);
  return text ? text : null;
}

function intOrNull(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;

  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function slugify(value: unknown): string | null {
  const text = asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return text || null;
}

function randomBookId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "book-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function normalizedIsbn(value: unknown): string {
  return asText(value).toUpperCase().replace(/[^0-9X]/g, "");
}

function normalizedIdentity(value: unknown): string {
  return asText(value).toLocaleLowerCase("es-ES");
}

function genreValue(input: BookInput): string | null {
  const rawGenres = getValue(input, "genres");

  if (Array.isArray(rawGenres)) {
    const genres = rawGenres.map(asText).filter(Boolean);
    return genres.length ? JSON.stringify([...new Set(genres)]) : null;
  }

  const repeatedGenres = getAllValues(input, "genres").map(asText).filter(Boolean);
  if (repeatedGenres.length > 0) {
    return JSON.stringify([...new Set(repeatedGenres)]);
  }

  return textOrNull(getValue(input, "genre"));
}

function taxonomyValues(input: BookInput, names: string[]): string[] {
  const values: string[] = [];

  for (const name of names) {
    const raw = getValue(input, name);

    if (Array.isArray(raw)) {
      values.push(...raw.map(asText));
      continue;
    }

    values.push(...getAllValues(input, name).map(asText));
  }

  return [...new Set(values.filter(Boolean))].slice(0, 24);
}

function taxonomyRows(input: BookInput, bookId: string) {
  const groups: Array<[TaxonomyKind, string[]]> = [
    ["theme", taxonomyValues(input, ["themes", "theme"])],
    ["aesthetic", taxonomyValues(input, ["aesthetics", "aesthetic"])],
    ["audience", taxonomyValues(input, ["audiences", "audience"])],
  ];

  return groups.flatMap(([kind, values]) =>
    values.map((value, position) => ({
      book_id: bookId,
      kind,
      value,
      position,
    })),
  );
}

function buildBookPayload(input: BookInput) {
  const title = asText(getValue(input, "title"));
  const author = asText(getValue(input, "author"));

  if (!title) {
    throw apiError("Escribe el tÃ­tulo del libro.", 400);
  }

  if (!author) {
    throw apiError("Escribe el autor del libro.", 400);
  }

  const sagaName = textOrNull(getValue(input, "saga_name")) || textOrNull(getValue(input, "sagaName"));
  const provider = textOrNull(getValue(input, "provider"));
  const sourceId = textOrNull(getValue(input, "source_id")) || textOrNull(getValue(input, "sourceId"));
  const providedId = textOrNull(getValue(input, "id"));

  return {
    id: providedId || randomBookId(),
    title,
    author,
    synopsis: textOrNull(getValue(input, "synopsis")) || textOrNull(getValue(input, "description")),
    cover: textOrNull(getValue(input, "cover")),
    genre: genreValue(input),
    year: intOrNull(getValue(input, "year")),
    pages: intOrNull(getValue(input, "pages")),
    publisher: textOrNull(getValue(input, "publisher")),
    language: textOrNull(getValue(input, "language")) || "es",
    isbn: textOrNull(getValue(input, "isbn")),
    saga_name: sagaName,
    saga_number: intOrNull(getValue(input, "saga_number")) ?? intOrNull(getValue(input, "sagaNumber")),
    saga_key: textOrNull(getValue(input, "saga_key")) || slugify(sagaName),
    hero_color: textOrNull(getValue(input, "hero_color")) || textOrNull(getValue(input, "heroColor")),
    pdf_file: textOrNull(getValue(input, "pdf_file")),
    epub_file: textOrNull(getValue(input, "epub_file")),
    provider,
    source_id: sourceId,
  };
}


function safeStorageName(value: string) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "archivo";
}

function coverExtension(file: File) {
  const nameExtension = String(file.name || "").split(".").pop()?.toLowerCase();

  if (nameExtension && ["jpg", "jpeg", "png", "webp"].includes(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function uploadCoverFile(input: BookInput, bookId: string, title: string) {
  const value = getValue(input, "cover");

  if (!hasFile(value) || value.size === 0) {
    return textOrNull(value);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(value.type)) {
    throw apiError("La portada debe ser JPG, PNG o WEBP.", 400);
  }

  const maxSize = 10 * 1024 * 1024;

  if (value.size > maxSize) {
    throw apiError("La portada no puede superar los 10 MB.", 400);
  }

  const path = `${bookId}/${Date.now()}-${safeStorageName(title)}.${coverExtension(value)}`;

  const { error } = await supabase.storage
    .from(BOOK_COVERS_BUCKET)
    .upload(path, value, {
      cacheControl: "3600",
      upsert: true,
      contentType: value.type,
    });

  if (error) {
    throw apiError(error.message || "No se pudo subir la portada.", 500);
  }

  const { data } = supabase.storage.from(BOOK_COVERS_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesión para proponer libros.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw apiError("No se pudo comprobar tu perfil.", 500);
  }

  return {
    id: profile?.id || user.id,
    legacy_id: profile?.legacy_id || null,
    is_admin: Boolean(profile?.is_admin),
  };
}

function applyModerationFields(
  basePayload: ReturnType<typeof buildBookPayload>,
  profile: Awaited<ReturnType<typeof getCurrentProfile>>,
) {
  const isAdmin = Boolean(profile.is_admin);

  return {
    ...basePayload,
    review_status: isAdmin ? "approved" : "pending",
    created_by: profile.id,
    submitted_by_legacy_user_id: profile.legacy_id,
    approved_by: isAdmin ? profile.id : null,
    approved_at: isAdmin ? new Date().toISOString() : null,
    rejected_at: null,
    moderation_note: null,
    pdf_file: isAdmin ? basePayload.pdf_file : null,
    epub_file: isAdmin ? basePayload.epub_file : null,
  };
}

async function saveTaxonomy(input: BookInput, bookId: string) {
  const rows = taxonomyRows(input, bookId);

  if (rows.length === 0) return;

  const { error } = await supabase.from("book_taxonomy").insert(rows);

  if (error) {
    throw apiError("El libro se creÃ³, pero no se pudieron guardar sus etiquetas.", 500);
  }
}


async function replaceTaxonomy(input: BookInput, bookId: string) {
  const rows = taxonomyRows(input, bookId);

  const { error: deleteError } = await supabase
    .from("book_taxonomy")
    .delete()
    .eq("book_id", bookId);

  if (deleteError) {
    throw apiError("El libro se actualiz?, pero no se pudieron reemplazar sus etiquetas.", 500);
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("book_taxonomy").insert(rows);

  if (error) {
    throw apiError("El libro se actualiz?, pero no se pudieron guardar sus etiquetas.", 500);
  }
}

async function findExistingExternalBook(input: BookInput) {
  const provider = textOrNull(getValue(input, "provider"));
  const sourceId = textOrNull(getValue(input, "source_id")) || textOrNull(getValue(input, "sourceId"));
  const isbn = normalizedIsbn(getValue(input, "isbn"));
  const title = normalizedIdentity(getValue(input, "title"));
  const author = normalizedIdentity(getValue(input, "author"));

  if (provider && sourceId) {
    const { data, error } = await supabase
      .from("books")
      .select(BOOK_SELECT)
      .eq("provider", provider)
      .eq("source_id", sourceId)
      .maybeSingle();

    if (error) throw apiError("No se pudo comprobar si el libro ya existe.", 500);
    if (data) return data;
  }

  if (isbn) {
    const { data, error } = await supabase
      .from("books")
      .select(BOOK_SELECT)
      .eq("isbn", isbn)
      .maybeSingle();

    if (error) throw apiError("No se pudo comprobar si el ISBN ya existe.", 500);
    if (data) return data;
  }

  if (title && author) {
    const { data, error } = await supabase
      .from("books")
      .select(BOOK_SELECT)
      .ilike("title", asText(getValue(input, "title")))
      .ilike("author", asText(getValue(input, "author")))
      .limit(1)
      .maybeSingle();

    if (error) throw apiError("No se pudo comprobar si el libro ya existe.", 500);
    if (data) return data;
  }

  return null;
}

export async function createCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  const basePayload = buildBookPayload(input);
  basePayload.cover = await uploadCoverFile(input, basePayload.id, basePayload.title);
  const payload = applyModerationFields(basePayload, profile);

  const { data: book, error } = await supabase
    .from("books")
    .insert(payload)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo crear el libro.", 500);
  }

  await saveTaxonomy(input, book.id);

  return {
    ok: true,
    book,
  };
}

export async function importExternalCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  const existing = await findExistingExternalBook(input);

  if (existing) {
    return {
      ok: true,
      already_exists: true,
      book: existing,
    };
  }

  const basePayload = buildBookPayload(input);
  const payload = applyModerationFields(basePayload, profile);

  const { data: book, error } = await supabase
    .from("books")
    .insert(payload)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo importar el libro.", 500);
  }

  await saveTaxonomy(input, book.id);

  return {
    ok: true,
    already_exists: false,
    book,
  };
}


export async function updateCatalogBook(input: BookInput) {
  const profile = await getCurrentProfile();

  if (!profile.is_admin) {
    throw apiError("Solo una administradora puede editar libros.", 403);
  }

  const bookId =
    textOrNull(getValue(input, "id")) ||
    textOrNull(getValue(input, "book_id"));

  if (!bookId) {
    throw apiError("No se recibi? el libro que quieres editar.", 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("id", bookId)
    .maybeSingle();

  if (existingError) {
    throw apiError("No se pudo cargar el libro para editarlo.", 500);
  }

  if (!existing) {
    throw apiError("No encontramos ese libro.", 404);
  }

  const basePayload = buildBookPayload(input);
  const payload: Partial<ReturnType<typeof buildBookPayload>> = {
    ...basePayload,
  };

  delete payload.id;

  if (!textOrNull(getValue(input, "language"))) {
    delete payload.language;
  }

  if (!textOrNull(getValue(input, "provider"))) {
    delete payload.provider;
  }

  if (
    !textOrNull(getValue(input, "source_id")) &&
    !textOrNull(getValue(input, "sourceId"))
  ) {
    delete payload.source_id;
  }

  const removeCover = asText(getValue(input, "remove_cover")) === "1";

  if (removeCover) {
    payload.cover = null;
  } else {
    const uploadedCover = await uploadCoverFile(input, bookId, basePayload.title);

    if (uploadedCover) {
      payload.cover = uploadedCover;
    } else {
      delete payload.cover;
    }
  }

  const removePdf = asText(getValue(input, "remove_pdf")) === "1";
  const removeEpub = asText(getValue(input, "remove_epub")) === "1";

  if (removePdf) {
    payload.pdf_file = null;
  } else if (!payload.pdf_file) {
    delete payload.pdf_file;
  }

  if (removeEpub) {
    payload.epub_file = null;
  } else if (!payload.epub_file) {
    delete payload.epub_file;
  }

  const { data: book, error } = await supabase
    .from("books")
    .update(payload)
    .eq("id", bookId)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    throw apiError(error.message || "No se pudo actualizar el libro.", 500);
  }

  await replaceTaxonomy(input, bookId);

  return {
    ok: true,
    book,
  };
}

