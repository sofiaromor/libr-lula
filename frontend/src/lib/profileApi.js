import { supabase } from "./supabase.js";

const EMPTY_PROFILE_DATA = {
  authenticated: false,
  profile: null,
  stats: {
    completed: 0,
    favorites: 0,
    pages_read: 0,
  },
  favoriteBooks: [],
  favoriteAuthors: [],
  currentReadingBooks: [],
  recentActivity: [],
  favoriteGenres: [],
  activityDays: [],
  streak: 0,
};

function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asText(value) {
  return String(value || "").trim();
}

function parseDateValue(value) {
  const text = asText(value);
  return text ? new Date(text).getTime() || 0 : 0;
}

function parseGenres(value) {
  const text = asText(value);

  if (!text || text === "[]") {
    return [];
  }

  if (text.startsWith("[")) {
    try {
      const decoded = JSON.parse(text);

      if (Array.isArray(decoded)) {
        return [...new Set(decoded.map(asText).filter(Boolean))];
      }
    } catch {
      return [];
    }
  }

  return [
    ...new Set(
      text
        .split(/[,;|]+/)
        .map(asText)
        .filter(Boolean),
    ),
  ];
}

function profileInitial(username) {
  const clean = asText(username);
  return clean ? clean.slice(0, 1).toUpperCase() : "L";
}

function activityDateFor(row) {
  const status = asText(row?.status);

  if (status === "completed") {
    return row.finished_at || row.started_at || "";
  }

  if (status === "paused") {
    return row.paused_at || row.started_at || "";
  }

  if (status === "dropped") {
    return row.dropped_at || row.started_at || "";
  }

  return row.started_at || row.finished_at || "";
}

function activityActionFor(row) {
  const status = asText(row?.status);
  const progress = asNumber(row?.progress);

  if (status === "completed") return "Terminaste";
  if (status === "reading") return progress > 0 ? "Actualizaste tu progreso en" : "Empezaste a leer";
  if (status === "rereading") return progress > 0 ? "Actualizaste tu relectura de" : "Empezaste a releer";
  if (status === "paused") return "Pausaste";
  if (status === "planned") return "Añadiste a pendientes";
  if (status === "dropped") return "Marcaste como abandonado";

  return "Actualizaste";
}

function buildBookMap(books) {
  const map = new Map();

  for (const book of books || []) {
    map.set(String(book.id), book);
  }

  return map;
}

async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, avatar, bio, is_admin, created_at")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  return {
    ...profile,
    auth_id: user.id,
    email: user.email || "",
    legacy_id: profile?.legacy_id || null,
    username: profile?.username || user.email || "Mi perfil",
    avatar: profile?.avatar || "images/avatar/avatar1.png",
    bio: profile?.bio || "",
    initial: profileInitial(profile?.username || user.email || "L"),
  };
}

async function getUserBooks(legacyUserId) {
  const { data, error } = await supabase
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
    .eq("legacy_user_id", legacyUserId);

  if (error) {
    throw apiError("No se pudo cargar tu actividad de lectura.");
  }

  return data || [];
}

async function getBooksByIds(bookIds) {
  const uniqueIds = [...new Set((bookIds || []).map(String).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("books")
    .select(`
      id,
      title,
      author,
      cover,
      genre,
      year,
      pages
    `)
    .in("id", uniqueIds);

  if (error) {
    throw apiError("No se pudieron cargar los libros del perfil.");
  }

  return data || [];
}

async function getFavoriteBooks(legacyUserId) {
  const { data: rows, error } = await supabase
    .from("profile_favorite_books")
    .select("book_id, sort_order")
    .eq("legacy_user_id", legacyUserId)
    .order("sort_order", { ascending: true });

  if (error) {
    return [];
  }

  const books = await getBooksByIds((rows || []).map((row) => row.book_id));
  const booksById = buildBookMap(books);

  return (rows || [])
    .map((row) => booksById.get(String(row.book_id)))
    .filter(Boolean)
    .slice(0, 6);
}

async function getFavoriteAuthors(legacyUserId) {
  const { data, error } = await supabase
    .from("profile_favorite_authors")
    .select("author_name, sort_order")
    .eq("legacy_user_id", legacyUserId)
    .order("sort_order", { ascending: true });

  if (error) {
    return [];
  }

  return (data || [])
    .map((row) => asText(row.author_name))
    .filter(Boolean)
    .slice(0, 6);
}

function buildStats(userBooks, booksById) {
  let completed = 0;
  let favorites = 0;
  let pagesRead = 0;

  for (const row of userBooks || []) {
    if (row.status === "completed") {
      completed += 1;
      pagesRead += asNumber(booksById.get(String(row.book_id))?.pages);
    }

    if (asNumber(row.score) === 5) {
      favorites += 1;
    }
  }

  return {
    completed,
    favorites,
    pages_read: pagesRead,
  };
}

function buildCurrentReadingBooks(userBooks, booksById) {
  return (userBooks || [])
    .filter((row) => ["reading", "rereading"].includes(asText(row.status)))
    .sort((left, right) => parseDateValue(right.started_at) - parseDateValue(left.started_at))
    .slice(0, 4)
    .map((row) => ({
      ...booksById.get(String(row.book_id)),
      status: row.status,
      progress: asNumber(row.progress),
      score: row.score || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
    }))
    .filter((book) => book?.id);
}

function buildRecentActivity(userBooks, booksById) {
  return (userBooks || [])
    .map((row) => {
      const book = booksById.get(String(row.book_id));

      if (!book) return null;

      return {
        book_id: row.book_id,
        title: book.title || "",
        author: book.author || "",
        cover: book.cover || "",
        status: row.status || "",
        progress: asNumber(row.progress),
        date: activityDateFor(row),
        action: activityActionFor(row),
      };
    })
    .filter(Boolean)
    .filter((row) => row.date)
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date))
    .slice(0, 8);
}

function buildFavoriteGenres(userBooks, booksById) {
  const counts = new Map();

  for (const row of userBooks || []) {
    if (row.status !== "completed") continue;

    const book = booksById.get(String(row.book_id));
    const genres = parseGenres(book?.genre);

    for (const genre of genres) {
      counts.set(genre, (counts.get(genre) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "es"))
    .slice(0, 5);
}

function buildActivityDays(userBooks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 181);

  const pointsByDate = new Map();

  for (const row of userBooks || []) {
    const rawDate = activityDateFor(row);
    if (!rawDate) continue;

    const key = String(rawDate).slice(0, 10);
    pointsByDate.set(key, (pointsByDate.get(key) || 0) + 1);
  }

  const days = [];
  const cursor = new Date(firstDay);

  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const points = pointsByDate.get(key) || 0;

    days.push({
      date: key,
      label: cursor.toLocaleDateString("es-ES"),
      points,
      level: points <= 0 ? 0 : points === 1 ? 1 : points <= 3 ? 2 : 3,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  let streak = 0;
  const streakCursor = new Date(today);

  while (true) {
    const key = streakCursor.toISOString().slice(0, 10);
    if ((pointsByDate.get(key) || 0) <= 0) break;

    streak += 1;
    streakCursor.setDate(streakCursor.getDate() - 1);
  }

  return {
    activityDays: days,
    streak,
  };
}

export async function getProfileOverview() {
  const profile = await getCurrentProfile();

  if (!profile?.legacy_id) {
    return EMPTY_PROFILE_DATA;
  }

  const legacyUserId = profile.legacy_id;
  const userBooks = await getUserBooks(legacyUserId);
  const books = await getBooksByIds(userBooks.map((row) => row.book_id));
  const booksById = buildBookMap(books);
  const activity = buildActivityDays(userBooks);

  const [favoriteBooks, favoriteAuthors] = await Promise.all([
    getFavoriteBooks(legacyUserId),
    getFavoriteAuthors(legacyUserId),
  ]);

  return {
    authenticated: true,
    profile,
    stats: buildStats(userBooks, booksById),
    favoriteBooks,
    favoriteAuthors,
    currentReadingBooks: buildCurrentReadingBooks(userBooks, booksById),
    recentActivity: buildRecentActivity(userBooks, booksById),
    favoriteGenres: buildFavoriteGenres(userBooks, booksById),
    activityDays: activity.activityDays,
    streak: activity.streak,
  };
}
