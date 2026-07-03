import { supabase } from "./supabase.js";

const ATMOSPHERE_KEYS = ["pace", "tension", "darkness", "warmth", "emotion", "immersion"];
const DEFAULT_ATMOSPHERE = Object.fromEntries(ATMOSPHERE_KEYS.map((key) => [key, 50]));

const VIBES = {
  addictive: ["Adictivo", "No puedes dejarlo", "rhythm"],
  agile: ["Ãgil", "Se lee con facilidad", "rhythm"],
  slow_burn: ["Pausado", "Se disfruta sin prisas", "rhythm"],
  unpredictable: ["Impredecible", "Sorprende continuamente", "rhythm"],
  dense: ["Denso", "Pide atenciÃ³n y tiempo", "rhythm"],
  cozy: ["Acogedor", "Como una manta cÃ¡lida", "emotion"],
  emotional: ["Emotivo", "Deja huella", "emotion"],
  devastating: ["Devastador", "Rompe por dentro", "emotion"],
  funny: ["Divertido", "Te hace sonreÃ­r", "emotion"],
  nostalgic: ["NostÃ¡lgico", "Deja una dulce melancolÃ­a", "emotion"],
  hopeful: ["Esperanzador", "Terminas con luz", "emotion"],
  immersive: ["Inmersivo", "Te lleva a otro mundo", "setting"],
  dark: ["Oscuro", "Tiene un tono sombrÃ­o", "setting"],
  unsettling: ["Inquietante", "Produce desasosiego", "setting"],
  dreamlike: ["OnÃ­rico", "Parece un sueÃ±o", "setting"],
  nocturnal: ["Nocturno", "Ideal para leer de noche", "setting"],
  luminous: ["Luminoso", "Transmite ligereza", "setting"],
  romantic: ["RomÃ¡ntico", "El amor es importante", "relationships"],
  tender: ["Tierno", "VÃ­nculos dulces y cuidados", "relationships"],
  romantic_tension: ["TensiÃ³n romÃ¡ntica", "Miradas, espera y deseo", "relationships"],
  spicy: ["Picante", "QuÃ­mica intensa o explÃ­cita", "relationships"],
  heartbreaking: ["Desgarrador", "Relaciones que duelen", "relationships"],
  reflective: ["Reflexivo", "Invita a pensar", "impact"],
  inspiring: ["Inspirador", "Despierta ganas de actuar", "impact"],
  philosophical: ["FilosÃ³fico", "Plantea grandes preguntas", "impact"],
  disturbing: ["Perturbador", "Sigue rondando la cabeza", "impact"],
  revealing: ["Revelador", "Cambia alguna perspectiva", "impact"],
};

const DEFAULT_VIBES = ["immersive", "agile", "emotional", "reflective"];

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

function avatarPath(value) {
  const path = cleanText(value);
  return !path || path === "default.jpg" ? "images/avatar/avatar1.png" : path;
}

function validScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
}

function vibeRow(key, count, source) {
  const vibe = VIBES[key];

  if (!vibe) return null;

  return {
    key,
    label: vibe[0],
    description: vibe[1],
    category: vibe[2],
    count,
    source,
  };
}

function atmosphereValues(row) {
  const values = {};

  for (const key of ATMOSPHERE_KEYS) {
    const value = Number(row?.[key] ?? 50);
    values[key] = Math.max(0, Math.min(100, Math.round(value)));
  }

  return values;
}

function averageAtmosphere(rows) {
  if (!rows.length) return DEFAULT_ATMOSPHERE;

  const result = {};

  for (const key of ATMOSPHERE_KEYS) {
    const total = rows.reduce((sum, row) => sum + Number(row?.[key] ?? 50), 0);
    result[key] = Math.round(total / rows.length);
  }

  return atmosphereValues(result);
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

export async function getBookReviews({ bookId }) {
  const cleanId = cleanBookId(bookId);
  const legacyUserId = await getCurrentLegacyUserId();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id")
    .eq("id", cleanId)
    .maybeSingle();

  if (bookError) {
    throw apiError("No se pudo comprobar el libro.");
  }

  if (!book) {
    throw apiError("El libro no existe.", 404);
  }

  const { data: userBooks, error: userBooksError } = await supabase
    .from("user_books")
    .select("id, legacy_user_id, score, notes, started_at, finished_at")
    .eq("book_id", cleanId);

  if (userBooksError) {
    throw apiError("No se pudieron cargar las reseÃ±as del libro.");
  }

  const { data: vibes, error: vibesError } = await supabase
    .from("review_vibes")
    .select("legacy_user_id, vibe")
    .eq("book_id", cleanId);

  if (vibesError) {
    throw apiError("No se pudieron cargar las sensaciones del libro.");
  }

  const { data: atmosphere, error: atmosphereError } = await supabase
    .from("review_atmosphere")
    .select("legacy_user_id, pace, tension, darkness, warmth, emotion, immersion")
    .eq("book_id", cleanId);

  if (atmosphereError) {
    throw apiError("No se pudo cargar la atmÃ³sfera del libro.");
  }

  const rows = userBooks || [];
  const scores = rows.map((row) => validScore(row.score)).filter(Boolean);
  const reviewRows = rows.filter((row) => cleanText(row.notes));
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const score of scores) {
    distribution[score] += 1;
  }

  const userIds = [...new Set(rows.map((row) => row.legacy_user_id).filter(Boolean))];
  let usersById = new Map();

  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from("legacy_users")
      .select("legacy_id, username, avatar")
      .in("legacy_id", userIds);

    if (usersError) {
      throw apiError("No se pudieron cargar los usuarios de las reseÃ±as.");
    }

    usersById = new Map((users || []).map((user) => [String(user.legacy_id), user]));
  }

  const reviews = rows
    .filter((row) => validScore(row.score) !== null || cleanText(row.notes))
    .sort((a, b) => {
      const aMine = legacyUserId !== null && Number(a.legacy_user_id) === Number(legacyUserId);
      const bMine = legacyUserId !== null && Number(b.legacy_user_id) === Number(legacyUserId);

      if (aMine !== bMine) return aMine ? -1 : 1;

      const aDate = a.finished_at || a.started_at || "";
      const bDate = b.finished_at || b.started_at || "";

      if (aDate !== bDate) return bDate.localeCompare(aDate);

      return Number(b.id || 0) - Number(a.id || 0);
    })
    .slice(0, 100)
    .map((row) => {
      const user = usersById.get(String(row.legacy_user_id)) || {};

      return {
        user_id: row.legacy_user_id,
        username: user.username || "Lectora",
        avatar: avatarPath(user.avatar),
        score: validScore(row.score),
        review: cleanText(row.notes),
        started_at: row.started_at || null,
        finished_at: row.finished_at || null,
        is_mine: legacyUserId !== null && Number(row.legacy_user_id) === Number(legacyUserId),
      };
    });

  const myBookRow = rows.find((row) => Number(row.legacy_user_id) === Number(legacyUserId));
  const myVibes = (vibes || [])
    .filter((row) => Number(row.legacy_user_id) === Number(legacyUserId) && VIBES[row.vibe])
    .map((row) => row.vibe);
  const myAtmosphereRow = (atmosphere || []).find(
    (row) => Number(row.legacy_user_id) === Number(legacyUserId),
  );

  const myScore = validScore(myBookRow?.score);
  const myReviewText = cleanText(myBookRow?.notes);

  const myReview =
    legacyUserId && (myScore !== null || myReviewText || myVibes.length || myAtmosphereRow)
      ? {
          user_id: legacyUserId,
          score: myScore,
          review: myReviewText,
          started_at: myBookRow?.started_at || null,
          finished_at: myBookRow?.finished_at || null,
          vibes: myVibes,
          atmosphere: myAtmosphereRow ? atmosphereValues(myAtmosphereRow) : null,
          is_mine: true,
        }
      : null;

  const vibeCounts = new Map();

  for (const row of vibes || []) {
    if (VIBES[row.vibe]) {
      vibeCounts.set(row.vibe, (vibeCounts.get(row.vibe) || 0) + 1);
    }
  }

  const insightVibes = vibeCounts.size
    ? [...vibeCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([key, count]) => vibeRow(key, count, "community"))
        .filter(Boolean)
    : DEFAULT_VIBES.map((key) => vibeRow(key, 0, "synopsis")).filter(Boolean);

  const atmosphereRows = atmosphere || [];
  const participantCount = atmosphereRows.length;
  const avgRating = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : null;

  return {
    authenticated: legacyUserId !== null,
    summary: {
      avg_rating: avgRating,
      total_ratings: scores.length,
      total_reviews: reviewRows.length,
      distribution,
    },
    my_review: myReview,
    reviews,
    insights: {
      source: participantCount > 0 ? "community" : "synopsis",
      participant_count: participantCount,
      vibes: insightVibes,
      atmosphere: participantCount > 0 ? averageAtmosphere(atmosphereRows) : DEFAULT_ATMOSPHERE,
    },
    suggestions: {
      source: "synopsis",
      vibes: DEFAULT_VIBES,
      atmosphere: DEFAULT_ATMOSPHERE,
    },
    options: {
      vibes: Object.entries(VIBES).map(([key, [label, description, category]]) => ({
        key,
        label,
        description,
        category,
      })),
      atmosphere: [
        { key: "pace", label: "Ritmo", left: "Contemplativo", right: "Vertiginoso" },
        { key: "tension", label: "Tensión", left: "Sereno", right: "Intenso" },
        { key: "darkness", label: "Oscuridad", left: "Luminoso", right: "Sombrío" },
        { key: "warmth", label: "Calidez", left: "Frío", right: "Acogedor" },
        { key: "emotion", label: "Emoción", left: "Contenido", right: "Desbordante" },
        { key: "immersion", label: "Inmersión", left: "Distante", right: "Envolvente" },
      ],
    },
  };
}