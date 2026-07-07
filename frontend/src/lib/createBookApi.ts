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
  created_at
`;

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

async function requireAdminProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw apiError("Inicia sesiÃ³n para crear libros.", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("legacy_id, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw apiError("No se pudo comprobar tu perfil.", 500);
  }

  if (!profile?.is_admin) {
    throw apiError("Necesitas permisos de administradora para crear libros.", 403);
  }

  return profile;
}

async function saveTaxonomy(input: BookInput, bookId: string) {
  const rows = taxonomyRows(input, bookId);

  if (rows.length === 0) return;

  const { error } = await supabase.from("book_taxonomy").insert(rows);

  if (error) {
    throw apiError("El libro se creÃ³, pero no se pudieron guardar sus etiquetas.", 500);
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
  await requireAdminProfile();

  const payload = buildBookPayload(input);

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
  await requireAdminProfile();

  const existing = await findExistingExternalBook(input);

  if (existing) {
    return {
      ok: true,
      already_exists: true,
      book: existing,
    };
  }

  const payload = buildBookPayload(input);

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