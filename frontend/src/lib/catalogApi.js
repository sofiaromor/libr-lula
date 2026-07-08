import { supabase } from "./supabase.js";

const VALID_READING_STATUSES = [
  "planned",
  "reading",
  "paused",
  "completed",
  "dropped",
  "rereading",
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getCurrentLegacyUserId() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("legacy_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  return profile?.legacy_id || null;
}

function attachTaxonomy(books, taxonomyRows) {
  const byId = new Map();

  for (const book of books) {
    byId.set(String(book.id), {
      ...book,
      themes: [],
      aesthetics: [],
      audiences: [],
    });
  }

  for (const row of taxonomyRows || []) {
    const book = byId.get(String(row.book_id));
    if (!book || !row.value) continue;

    if (row.kind === "theme") {
      book.themes.push(row.value);
    }

    if (row.kind === "aesthetic") {
      book.aesthetics.push(row.value);
    }

    if (row.kind === "audience") {
      book.audiences.push(row.value);
    }
  }

  return Array.from(byId.values());
}

export async function getCatalogBooks() {
  const { data: books, error } = await supabase
    .from("books")
    .select(`
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
      review_status,
      created_at
    `)
    .eq("review_status", "approved")
    .order("year", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) {
    throw apiError("No se pudieron obtener los libros.");
  }

  const bookIds = (books || []).map((book) => book.id).filter(Boolean);

  if (bookIds.length === 0) {
    return {
      ok: true,
      books: [],
    };
  }

  const { data: taxonomyRows, error: taxonomyError } = await supabase
    .from("book_taxonomy")
    .select("book_id, kind, value, position")
    .in("book_id", bookIds)
    .order("book_id", { ascending: true })
    .order("kind", { ascending: true })
    .order("position", { ascending: true });

  if (taxonomyError) {
    throw apiError("No se pudieron obtener los datos del catálogo.");
  }

  return {
    ok: true,
    books: attachTaxonomy(books || [], taxonomyRows || []),
  };
}

function mapUserBookRow(row) {
  if (!row) return null;

  return {
    book_id: row.book_id,
    status: row.status,
    progress: row.progress || 0,
    score: row.score || null,
    notes: row.notes || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    read_count: row.read_count || 0,
    paused_at: row.paused_at || null,
    dropped_at: row.dropped_at || null,
  };
}

export async function getCatalogUserBooks({ bookId = "" } = {}) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    return {
      authenticated: false,
      item: null,
      items: {},
    };
  }

  let query = supabase
    .from("user_books")
    .select(`
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at
    `)
    .eq("legacy_user_id", legacyUserId)
    .order("id", { ascending: false });

  if (bookId) {
    query = query.eq("book_id", String(bookId));
  }

  const { data, error } = await query;

  if (error) {
    throw apiError("No se pudo consultar tu biblioteca.");
  }

  if (bookId) {
    return {
      authenticated: true,
      item: mapUserBookRow(data?.[0] || null),
    };
  }

  const items = {};

  for (const row of data || []) {
    const key = String(row.book_id || "");

    if (key && !items[key]) {
      items[key] = mapUserBookRow(row);
    }
  }

  return {
    authenticated: true,
    items,
  };
}

function buildStatusPatch(existing, status) {
  const today = todayIsoDate();
  const previousStatus = existing?.status || "";
  let progress = Math.max(0, Math.min(100, Number(existing?.progress || 0)));
  let startedAt = existing?.started_at || null;
  let finishedAt = existing?.finished_at || null;
  let pausedAt = existing?.paused_at || null;
  let droppedAt = existing?.dropped_at || null;
  let readCount = Math.max(0, Number(existing?.read_count || 0));

  if (status === "planned") {
    progress = 0;
    startedAt = null;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;
  }

  if (status === "reading") {
    if (progress >= 100 || ["completed", "rereading"].includes(previousStatus)) {
      progress = 0;
    }

    startedAt = startedAt || today;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;
  }

  if (status === "paused") {
    startedAt = startedAt || today;
    finishedAt = null;
    pausedAt = today;
    droppedAt = null;
  }

  if (status === "rereading") {
    progress = 0;
    startedAt = today;
    finishedAt = null;
    pausedAt = null;
    droppedAt = null;

    if (previousStatus !== "rereading") {
      readCount = Math.max(1, readCount) + 1;
    }
  }

  if (status === "completed") {
    progress = 100;
    startedAt = startedAt || today;
    finishedAt = today;
    pausedAt = null;
    droppedAt = null;

    if (previousStatus !== "completed") {
      readCount = Math.max(1, readCount);
    }
  }

  if (status === "dropped") {
    finishedAt = null;
    pausedAt = null;
    droppedAt = today;
  }

  return {
    status,
    progress,
    started_at: startedAt,
    finished_at: finishedAt,
    read_count: readCount,
    paused_at: pausedAt,
    dropped_at: droppedAt,
  };
}

export async function saveCatalogUserBookStatus({ book_id: bookId, status }) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    throw apiError("Inicia sesión para guardar libros en tu biblioteca.", 401);
  }

  const cleanBookId = String(bookId || "").trim();
  const cleanStatus = String(status || "").trim();

  if (!cleanBookId) {
    throw apiError("Falta el libro.", 400);
  }

  if (!VALID_READING_STATUSES.includes(cleanStatus)) {
    throw apiError("El estado seleccionado no es válido.", 400);
  }

  const { data: bookExists, error: bookError } = await supabase
    .from("books")
    .select("id")
    .eq("id", cleanBookId)
    .maybeSingle();

  if (bookError) {
    throw apiError("No se pudo comprobar el libro.", 500);
  }

  if (!bookExists) {
    throw apiError("El libro no existe en el catálogo.", 404);
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_books")
    .select(`
      id,
      status,
      progress,
      started_at,
      finished_at,
      read_count,
      paused_at,
      dropped_at
    `)
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) {
    throw apiError("No se pudo consultar tu biblioteca.", 500);
  }

  const patch = buildStatusPatch(existing, cleanStatus);

  let saved;
  let saveError;

  if (existing?.id) {
    const result = await supabase
      .from("user_books")
      .update(patch)
      .eq("id", existing.id)
      .select(`
        book_id,
        status,
        progress,
        score,
        notes,
        started_at,
        finished_at,
        read_count,
        paused_at,
        dropped_at
      `)
      .single();

    saved = result.data;
    saveError = result.error;
  } else {
    const result = await supabase
      .from("user_books")
      .insert({
        legacy_user_id: legacyUserId,
        book_id: cleanBookId,
        ...patch,
      })
      .select(`
        book_id,
        status,
        progress,
        score,
        notes,
        started_at,
        finished_at,
        read_count,
        paused_at,
        dropped_at
      `)
      .single();

    saved = result.data;
    saveError = result.error;
  }

  if (saveError) {
    throw apiError("No se pudo guardar el estado del libro.", 500);
  }

  return {
    ok: true,
    item: mapUserBookRow(saved),
  };
}
