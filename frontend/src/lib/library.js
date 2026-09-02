import { supabase } from "./supabase.js";
import {
  buildSpineStoragePath,
  LIBRARY_SPINE_BUCKET,
  validateSpineImageFile,
} from "./librarySpineMedia.js";

const SPINE_SIGNED_URL_SECONDS = 60 * 60 * 6;

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

async function attachPersonalSpines(items) {
  const bookIds = [...new Set((items || []).map((item) => item.book_id).filter(Boolean))];

  if (!bookIds.length) {
    return items || [];
  }

  try {
    const { data: rows, error } = await supabase
      .from("user_book_spines")
      .select("book_id, storage_path")
      .in("book_id", bookIds);

    if (error || !rows?.length) {
      return (items || []).map((item) => ({
        ...item,
        personal_spine_path: "",
        personal_spine_url: "",
      }));
    }

    const signedEntries = await Promise.all(
      rows.map(async (row) => {
        const path = String(row.storage_path || "").trim();
        if (!path) return [String(row.book_id), { path: "", url: "" }];

        const { data, error: signedError } = await supabase.storage
          .from(LIBRARY_SPINE_BUCKET)
          .createSignedUrl(path, SPINE_SIGNED_URL_SECONDS);

        return [
          String(row.book_id),
          {
            path,
            url: signedError ? "" : data?.signedUrl || "",
          },
        ];
      }),
    );

    const spineByBookId = new Map(signedEntries);

    return (items || []).map((item) => {
      const spine = spineByBookId.get(String(item.book_id));
      return {
        ...item,
        personal_spine_path: spine?.path || "",
        personal_spine_url: spine?.url || "",
      };
    });
  } catch {
    // Backwards-compatible rollout: generated spines still work before the
    // personal-spine migration is activated in Supabase.
    return (items || []).map((item) => ({
      ...item,
      personal_spine_path: "",
      personal_spine_url: "",
    }));
  }
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

  const baseItems = (data || []).map((item) => ({
    ...item,
    book: item.books,
  }));
  const items = await attachPersonalSpines(baseItems);

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

export async function uploadPersonalSpine({ bookId, file }) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) throw new Error("No se pudo identificar el libro.");

  const validation = validateSpineImageFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Inicia sesión para guardar un lomo personal.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_book_spines")
    .select("storage_path")
    .eq("book_id", cleanBookId)
    .maybeSingle();

  if (existingError) {
    throw new Error("Los lomos personales todavía no están disponibles.");
  }

  const storagePath = buildSpineStoragePath({
    userId: user.id,
    bookId: cleanBookId,
    fileType: file.type,
  });

  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_SPINE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("No se pudo subir la foto del lomo.");
  }

  const { error: saveError } = await supabase
    .from("user_book_spines")
    .upsert(
      {
        user_id: user.id,
        book_id: cleanBookId,
        storage_path: storagePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );

  if (saveError) {
    await supabase.storage.from(LIBRARY_SPINE_BUCKET).remove([storagePath]);
    throw new Error("No se pudo asociar la foto a este libro.");
  }

  const oldPath = String(existing?.storage_path || "").trim();
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(LIBRARY_SPINE_BUCKET).remove([oldPath]);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(LIBRARY_SPINE_BUCKET)
    .createSignedUrl(storagePath, SPINE_SIGNED_URL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    throw new Error("La foto se guardó, pero no se pudo mostrar todavía.");
  }

  return {
    path: storagePath,
    url: signed.signedUrl,
  };
}

export async function removePersonalSpine({ bookId, storagePath }) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) throw new Error("No se pudo identificar el libro.");

  const { error } = await supabase
    .from("user_book_spines")
    .delete()
    .eq("book_id", cleanBookId);

  if (error) {
    throw new Error("No se pudo quitar el lomo personal.");
  }

  const path = String(storagePath || "").trim();
  if (path) {
    // A failed object cleanup should not restore a database association that
    // the user already removed. The private orphan can be cleaned later.
    await supabase.storage.from(LIBRARY_SPINE_BUCKET).remove([path]);
  }
}
