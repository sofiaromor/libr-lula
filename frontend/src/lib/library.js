import { supabase } from "./supabase.js";

export const LIBRARY_STATUS_LABELS = {
  all: "Todos",
  reading: "Leyendo",
  rereading: "Releyendo",
  paused: "Pausados",
  completed: "Leídos",
  planned: "Pendientes",
  dropped: "Abandonados",
};

export const LIBRARY_STATUS_BADGES = {
  completed: ["Leído", "is-completed"],
  reading: ["Leyendo", "is-reading"],
  rereading: ["Releyendo", "is-rereading"],
  paused: ["Pausado", "is-paused"],
  planned: ["Pendiente", "is-planned"],
  dropped: ["Abandonado", "is-dropped"],
};

export function getLibraryStatus(status) {
  return LIBRARY_STATUS_BADGES[status] || ["Sin estado", ""];
}

export async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, avatar, bio, is_admin")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

export async function getMyLibrary() {
  const profile = await getCurrentProfile();

  if (!profile?.legacy_id) {
    return {
      profile,
      items: [],
      counts: buildLibraryCounts([]),
    };
  }

  const { data, error } = await supabase
    .from("user_books")
    .select(`
      id,
      legacy_user_id,
      book_id,
      status,
      progress,
      score,
      notes,
      started_at,
      finished_at,
      books (
        id,
        title,
        author,
        cover,
        genre,
        year
      )
    `)
    .eq("legacy_user_id", profile.legacy_id)
    .order("id", { ascending: false });

  if (error) throw error;

  const items = (data || []).map((item) => ({
    ...item,
    book: item.books,
  }));

  return {
    profile,
    items,
    counts: buildLibraryCounts(items),
  };
}

export function buildLibraryCounts(items) {
  const counts = {
    all: 0,
    reading: 0,
    rereading: 0,
    paused: 0,
    completed: 0,
    planned: 0,
    dropped: 0,
  };

  for (const item of items || []) {
    const status = item?.status || "planned";
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }

  return counts;
}

export async function updateLibraryScore({ legacyUserId, bookId, score }) {
  const safeScore = Number(score);

  if (!legacyUserId || !bookId || safeScore < 1 || safeScore > 5) {
    throw new Error("No se pudo guardar la puntuación.");
  }

  const { error } = await supabase
    .from("user_books")
    .update({ score: safeScore })
    .eq("legacy_user_id", legacyUserId)
    .eq("book_id", bookId);

  if (error) throw error;
}
