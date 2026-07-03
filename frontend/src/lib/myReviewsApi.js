import { supabase } from "./supabase.js";

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "").trim();
}

function validScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return null;
  }

  return score;
}

function reviewDateFor(row) {
  return (
    row.finished_at ||
    row.started_at ||
    row.paused_at ||
    row.dropped_at ||
    null
  );
}

function sortDateValue(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
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

async function getBooksByIds(bookIds) {
  const uniqueIds = [...new Set((bookIds || []).map(String).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
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
      created_at
    `)
    .in("id", uniqueIds);

  if (error) {
    throw apiError("No se pudieron cargar los libros de tus reseñas.");
  }

  return new Map(
    (data || []).map((book) => [
      String(book.id),
      {
        ...book,
        themes: [],
        aesthetics: [],
        audiences: [],
      },
    ]),
  );
}

export async function getMyReviews() {
  const legacyUserId = await getCurrentLegacyUserId();

  if (!legacyUserId) {
    return {
      authenticated: false,
      reviews: [],
    };
  }

  const { data: rows, error } = await supabase
    .from("user_books")
    .select(`
      id,
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      paused_at,
      dropped_at,
      read_count
    `)
    .eq("legacy_user_id", legacyUserId)
    .order("id", { ascending: false });

  if (error) {
    throw apiError("No se pudieron cargar tus reseñas.");
  }

  const reviewRows = (rows || [])
    .map((row) => ({
      ...row,
      score: validScore(row.score),
      review: cleanText(row.notes),
      date: reviewDateFor(row),
    }))
    .filter((row) => row.score !== null || row.review);

  const booksById = await getBooksByIds(reviewRows.map((row) => row.book_id));

  const reviews = reviewRows
    .map((row) => {
      const book = booksById.get(String(row.book_id));

      if (!book) return null;

      return {
        id: row.id,
        book_id: row.book_id,
        book,
        score: row.score,
        review: row.review,
        status: row.status || "",
        progress: Number(row.progress || 0),
        started_at: row.started_at || null,
        finished_at: row.finished_at || null,
        date: row.date,
        read_count: Number(row.read_count || 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => sortDateValue(right.date) - sortDateValue(left.date));

  return {
    authenticated: true,
    reviews,
  };
}