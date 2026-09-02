import { supabase } from "./supabase.js";

export const COLLECTION_ACCENT_OPTIONS = Object.freeze([
  "#b8896a",
  "#c97d60",
  "#9c7658",
  "#7f8f74",
  "#8798a5",
  "#a88ba8",
  "#c3a668",
  "#8f6b62",
]);

function text(value) {
  return String(value ?? "").trim();
}

function collectionUnavailable(error) {
  const code = text(error?.code);
  const message = text(error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("library_collections") ||
    message.includes("schema cache")
  );
}

function normalizeAccent(value) {
  const clean = text(value).toLowerCase();
  return COLLECTION_ACCENT_OPTIONS.find((color) => color.toLowerCase() === clean) || COLLECTION_ACCENT_OPTIONS[0];
}

function normalizeBookIds(bookIds) {
  return [...new Set((bookIds || []).map((value) => text(value)).filter(Boolean))].slice(0, 200);
}

function normalizeDraft(draft = {}) {
  const name = text(draft.name).slice(0, 80);
  const description = text(draft.description).slice(0, 280);
  const visibility = draft.visibility === "public" ? "public" : "private";

  if (!name) throw new Error("Ponle un nombre a la colección.");

  return {
    name,
    description,
    visibility,
    accent_color: normalizeAccent(draft.accentColor || draft.accent_color),
    bookIds: normalizeBookIds(draft.bookIds),
  };
}

async function getViewer() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  return session?.user || null;
}

async function loadCollectionBooks(collectionIds) {
  if (!collectionIds.length) return new Map();

  const { data, error } = await supabase
    .from("library_collection_books")
    .select(`
      collection_id,
      book_id,
      sort_order,
      added_at,
      books (
        id,
        title,
        author,
        cover
      )
    `)
    .in("collection_id", collectionIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = String(row.collection_id);
    const list = map.get(key) || [];
    list.push({
      ...(row.books || {}),
      collection_id: row.collection_id,
      book_id: row.book_id,
      sort_order: row.sort_order,
      added_at: row.added_at,
    });
    map.set(key, list);
  }
  return map;
}

async function loadCollectionFollows(collectionIds, viewerId) {
  if (!collectionIds.length) return { countById: new Map(), followedIds: new Set() };

  const { data, error } = await supabase
    .from("library_collection_follows")
    .select("collection_id, user_id")
    .in("collection_id", collectionIds);

  if (error) throw error;

  const countById = new Map();
  const followedIds = new Set();

  for (const row of data || []) {
    const key = String(row.collection_id);
    countById.set(key, (countById.get(key) || 0) + 1);
    if (viewerId && row.user_id === viewerId) followedIds.add(key);
  }

  return { countById, followedIds };
}

export async function getProfileCollections(profileId) {
  const viewer = await getViewer();
  if (!viewer) return { available: true, collections: [], viewerId: "" };

  const ownerId = text(profileId) || viewer.id;

  try {
    const { data, error } = await supabase
      .from("library_collections")
      .select("id, owner_id, name, description, accent_color, visibility, created_at, updated_at")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (collectionUnavailable(error)) {
        return { available: false, collections: [], viewerId: viewer.id };
      }
      throw error;
    }

    const rows = data || [];
    const ids = rows.map((row) => row.id);
    const [booksById, follows] = await Promise.all([
      loadCollectionBooks(ids),
      loadCollectionFollows(ids, viewer.id),
    ]);

    return {
      available: true,
      viewerId: viewer.id,
      collections: rows.map((row) => ({
        ...row,
        books: booksById.get(String(row.id)) || [],
        follower_count: follows.countById.get(String(row.id)) || 0,
        followed_by_viewer: follows.followedIds.has(String(row.id)),
        is_owner: row.owner_id === viewer.id,
      })),
    };
  } catch (error) {
    if (collectionUnavailable(error)) {
      return { available: false, collections: [], viewerId: viewer.id };
    }
    throw error;
  }
}

async function replaceCollectionBooks(collectionId, bookIds) {
  const cleanIds = normalizeBookIds(bookIds);

  const { error: deleteError } = await supabase
    .from("library_collection_books")
    .delete()
    .eq("collection_id", collectionId);

  if (deleteError) throw deleteError;
  if (!cleanIds.length) return;

  const { error: insertError } = await supabase
    .from("library_collection_books")
    .insert(cleanIds.map((bookId, index) => ({
      collection_id: collectionId,
      book_id: bookId,
      sort_order: index,
    })));

  if (insertError) throw insertError;
}

export async function saveLibraryCollection(draft) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Inicia sesión para guardar una colección.");
  const clean = normalizeDraft(draft);
  const collectionId = text(draft?.id);

  try {
    if (collectionId) {
      const { data, error } = await supabase
        .from("library_collections")
        .update({
          name: clean.name,
          description: clean.description,
          accent_color: clean.accent_color,
          visibility: clean.visibility,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collectionId)
        .select("id")
        .single();

      if (error) throw error;
      await replaceCollectionBooks(data.id, clean.bookIds);
      return data.id;
    }

    const { data, error } = await supabase
      .from("library_collections")
      .insert({
        owner_id: viewer.id,
        name: clean.name,
        description: clean.description,
        accent_color: clean.accent_color,
        visibility: clean.visibility,
      })
      .select("id")
      .single();

    if (error) throw error;

    try {
      await replaceCollectionBooks(data.id, clean.bookIds);
    } catch (bookError) {
      await supabase.from("library_collections").delete().eq("id", data.id);
      throw bookError;
    }

    return data.id;
  } catch (error) {
    if (collectionUnavailable(error)) {
      throw new Error(
        "Las colecciones todavía no están activadas en Librélula.",
        { cause: error },
      );
    }
    throw new Error(
      error?.message || "No se pudo guardar la colección.",
      { cause: error },
    );
  }
}

export async function deleteLibraryCollection(collectionId) {
  const id = text(collectionId);
  if (!id) return;

  const { error } = await supabase
    .from("library_collections")
    .delete()
    .eq("id", id);

  if (error) {
    if (collectionUnavailable(error)) {
      throw new Error("Las colecciones todavía no están activadas en Librélula.");
    }
    throw new Error("No se pudo eliminar la colección.");
  }
}

export async function setCollectionFollow(collectionId, shouldFollow) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Inicia sesión para seguir colecciones.");
  const id = text(collectionId);
  if (!id) throw new Error("No se pudo identificar la colección.");

  const request = shouldFollow
    ? supabase.from("library_collection_follows").insert({ collection_id: id, user_id: viewer.id })
    : supabase.from("library_collection_follows").delete().eq("collection_id", id).eq("user_id", viewer.id);

  const { error } = await request;
  if (error) {
    if (collectionUnavailable(error)) {
      throw new Error("Las colecciones todavía no están activadas en Librélula.");
    }
    throw new Error(shouldFollow ? "No se pudo seguir la colección." : "No se pudo dejar de seguir la colección.");
  }
}
