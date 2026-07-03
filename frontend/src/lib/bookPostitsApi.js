import { supabase } from "./supabase.js";

const VALID_POSTIT_COLORS = new Set([
  "yellow",
  "pink",
  "blue",
  "green",
  "purple",
]);

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanBookId(value) {
  const bookId = cleanText(value);

  if (!bookId) {
    throw apiError("No se ha indicado el libro.", 400);
  }

  return bookId;
}

function cleanColor(value) {
  const color = cleanText(value) || "yellow";
  return VALID_POSTIT_COLORS.has(color) ? color : "yellow";
}

function cleanPage(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

function normalizePostit(row) {
  return {
    id: row.id,
    book_id: row.book_id,
    quote: row.quote || "",
    page: row.page ?? null,
    color: row.color || "yellow",
    created_at: row.created_at || null,
  };
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
    throw apiError("No se pudo cargar tu perfil.");
  }

  return profile?.legacy_id || null;
}

export async function getBookPostits({ bookId }) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    return {
      authenticated: false,
      postits: [],
    };
  }

  const cleanId = cleanBookId(bookId);

  const { data, error } = await supabase
    .from("book_postits")
    .select("id, book_id, quote, page, color, created_at")
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", cleanId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw apiError("No se pudieron cargar tus post-its.");
  }

  return {
    authenticated: true,
    postits: (data || []).map(normalizePostit),
  };
}

export async function createBookPostit({ book_id, quote, page, color }) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    throw apiError("Inicia sesión para guardar post-its.", 401);
  }

  const cleanId = cleanBookId(book_id);
  const cleanQuote = cleanText(quote);

  if (!cleanQuote) {
    throw apiError("Escribe una frase antes de añadir el post-it.", 400);
  }

  const { data, error } = await supabase
    .from("book_postits")
    .insert({
      legacy_user_id: legacyUserId,
      book_id: cleanId,
      quote: cleanQuote,
      page: cleanPage(page),
      color: cleanColor(color),
    })
    .select("id, book_id, quote, page, color, created_at")
    .single();

  if (error) {
    throw apiError("No se pudo guardar el post-it.");
  }

  return {
    authenticated: true,
    postit: normalizePostit(data),
  };
}

export async function deleteBookPostit({ id }) {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    throw apiError("Inicia sesión para eliminar post-its.", 401);
  }

  const postitId = Number(id);

  if (!Number.isInteger(postitId) || postitId < 1) {
    throw apiError("No se ha indicado el post-it.", 400);
  }

  const { error } = await supabase
    .from("book_postits")
    .delete()
    .eq("legacy_user_id", legacyUserId)
    .eq("id", postitId);

  if (error) {
    throw apiError("No se pudo eliminar el post-it.");
  }

  return {
    authenticated: true,
    deleted: true,
    id: postitId,
  };
}