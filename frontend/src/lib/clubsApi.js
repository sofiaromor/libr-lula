import { supabase } from "./supabase.js";

const PROFILE_FIELDS = "id, username, display_name, avatar";
const BOOK_FIELDS = "id, title, author, cover, pages, genre, year, saga_name, saga_number";
const CLUB_FIELDS = `
  id,
  owner_id,
  name,
  description,
  visibility,
  current_book_id,
  banner_url,
  icon_url,
  accent_color,
  invite_code,
  next_meeting_at,
  meeting_label,
  rules,
  created_at,
  updated_at
`;

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))];
}

function mapById(rows) {
  return new Map((rows || []).map((row) => [String(row.id), row]));
}

function cleanSearch(value) {
  return String(value || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

async function currentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Inicia sesión para entrar en los clubes de lectura.");
  }

  return user;
}

async function currentProfile() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${PROFILE_FIELDS}, legacy_id`)
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo cargar tu perfil lector.");
  }

  return data;
}

async function booksByIds(ids) {
  const cleanIds = unique(ids);
  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_FIELDS)
    .in("id", cleanIds);

  if (error) throw error;
  return data || [];
}

async function profilesByIds(ids) {
  const cleanIds = unique(ids);
  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .in("id", cleanIds);

  if (error) throw error;
  return data || [];
}

function decorateClubs(clubs, memberships, books, memberRows, profile) {
  const bookMap = mapById(books);
  const membershipMap = new Map(
    (memberships || []).map((membership) => [String(membership.club_id), membership]),
  );
  const counts = new Map();

  (memberRows || []).forEach((member) => {
    const key = String(member.club_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return (clubs || []).map((club) => {
    const membership = membershipMap.get(String(club.id)) || null;
    return {
      ...club,
      book: club.current_book_id ? bookMap.get(String(club.current_book_id)) || null : null,
      membership,
      member_count: counts.get(String(club.id)) || 0,
      is_member: Boolean(membership?.status === "active"),
      is_owner: club.owner_id === profile?.id || membership?.role === "owner",
    };
  });
}

export async function getClubsHub() {
  const profile = await currentProfile();

  const [{ data: memberships, error: membershipsError }, { data: publicClubs, error: publicError }] =
    await Promise.all([
      supabase
        .from("reading_club_members")
        .select("club_id, role, status, current_chapter, current_page, progress, joined_at")
        .eq("user_id", profile.id)
        .eq("status", "active")
        .order("joined_at", { ascending: false }),
      supabase
        .from("reading_clubs")
        .select(CLUB_FIELDS)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(18),
    ]);

  if (membershipsError) throw membershipsError;
  if (publicError) throw publicError;

  const membershipIds = unique((memberships || []).map((item) => item.club_id));
  let memberClubs = [];

  if (membershipIds.length) {
    const { data, error } = await supabase
      .from("reading_clubs")
      .select(CLUB_FIELDS)
      .in("id", membershipIds);
    if (error) throw error;
    memberClubs = data || [];
  }

  const allClubMap = new Map();
  [...memberClubs, ...(publicClubs || [])].forEach((club) => {
    allClubMap.set(String(club.id), club);
  });
  const allClubs = [...allClubMap.values()];
  const bookIds = unique(allClubs.map((club) => club.current_book_id));
  const clubIds = unique(allClubs.map((club) => club.id));

  const [books, memberRowsResult] = await Promise.all([
    booksByIds(bookIds),
    clubIds.length
      ? supabase
          .from("reading_club_members")
          .select("club_id, user_id")
          .in("club_id", clubIds)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (memberRowsResult.error) throw memberRowsResult.error;

  const decorated = decorateClubs(
    allClubs,
    memberships,
    books,
    memberRowsResult.data || [],
    profile,
  );
  const decoratedMap = new Map(decorated.map((club) => [String(club.id), club]));

  return {
    profile,
    myClubs: membershipIds.map((id) => decoratedMap.get(String(id))).filter(Boolean),
    discoverClubs: (publicClubs || [])
      .map((club) => decoratedMap.get(String(club.id)))
      .filter((club) => club && !club.is_member),
  };
}

export async function searchClubBooks(search = "") {
  const clean = cleanSearch(search);
  let query = supabase
    .from("books")
    .select(BOOK_FIELDS)
    .eq("review_status", "approved")
    .order("title", { ascending: true })
    .limit(12);

  if (clean) {
    query = query.or(`title.ilike.%${clean}%,author.ilike.%${clean}%,isbn.ilike.%${clean}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createReadingClub({
  name,
  description = "",
  visibility = "public",
  bookId,
  chapterCount = 10,
  nextMeetingAt = null,
}) {
  const profile = await currentProfile();
  const cleanName = String(name || "").trim();
  const safeChapters = Math.min(80, Math.max(1, Number.parseInt(chapterCount, 10) || 10));

  if (cleanName.length < 3) {
    throw new Error("El nombre del club debe tener al menos 3 caracteres.");
  }
  if (!bookId) {
    throw new Error("Escoge el libro con el que empezará el club.");
  }

  const { data: club, error } = await supabase
    .from("reading_clubs")
    .insert({
      owner_id: profile.id,
      name: cleanName,
      description: String(description || "").trim(),
      visibility: visibility === "private" ? "private" : "public",
      current_book_id: String(bookId).trim(),
      next_meeting_at: nextMeetingAt || null,
    })
    .select(CLUB_FIELDS)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo crear el club.");
  }

  const chapters = Array.from({ length: safeChapters }, (_, index) => ({
    club_id: club.id,
    chapter_number: index + 1,
    title: `Capítulo ${index + 1}`,
    created_by: profile.id,
  }));

  const { error: chaptersError } = await supabase
    .from("reading_club_chapters")
    .insert(chapters);

  if (chaptersError) {
    await supabase.from("reading_clubs").delete().eq("id", club.id);
    throw new Error(chaptersError.message || "No se pudieron preparar los capítulos.");
  }

  if (nextMeetingAt) {
    await supabase.from("reading_club_meetings").insert({
      club_id: club.id,
      title: "Primera reunión",
      starts_at: nextMeetingAt,
      created_by: profile.id,
    });
  }

  return club;
}

export async function joinReadingClub(clubId, inviteCode = "") {
  const { error } = await supabase.rpc("join_reading_club", {
    p_club_id: Number(clubId),
    p_invite_code: String(inviteCode || "").trim() || null,
  });

  if (error) {
    throw new Error(error.message || "No se pudo entrar en el club.");
  }

  return true;
}

export async function joinReadingClubByCode(inviteCode) {
  const cleanCode = String(inviteCode || "").trim().toUpperCase();
  if (!cleanCode) throw new Error("Introduce el código de invitación.");

  const { data, error } = await supabase.rpc("join_reading_club_by_code", {
    p_invite_code: cleanCode,
  });
  if (error) throw new Error(error.message || "No se pudo usar la invitación.");
  return Number(data);
}

export async function leaveReadingClub(clubId) {
  const { error } = await supabase.rpc("leave_reading_club", {
    p_club_id: Number(clubId),
  });
  if (error) throw new Error(error.message || "No se pudo abandonar el club.");
  return true;
}

export async function updateClubProgress(clubId, currentChapter, currentPage, progress = 0) {
  const { error } = await supabase.rpc("update_reading_club_progress", {
    p_club_id: Number(clubId),
    p_current_chapter: Math.max(1, Number.parseInt(currentChapter, 10) || 1),
    p_current_page: Math.max(0, Number.parseInt(currentPage, 10) || 0),
    p_progress: Math.max(0, Math.min(100, Number.parseInt(progress, 10) || 0)),
  });
  if (error) throw new Error(error.message || "No se pudo guardar tu progreso.");
  return true;
}

export async function uploadClubAsset(clubId, file, kind = "banner") {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) {
    throw new Error("La imagen debe ser JPG, PNG, WebP o GIF.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no puede superar los 8 MB.");
  }

  const user = await currentUser();
  const extension = String(file.name || "image.jpg").split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/clubs/${clubId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("club-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message || "No se pudo subir la imagen del club.");
  return clubMediaUrl(path);
}

export async function updateClubSettings({
  clubId,
  name,
  description,
  visibility,
  bannerUrl,
  iconUrl,
  rules,
}) {
  const cleanRules = (rules || []).map((rule) => String(rule || "").trim()).filter(Boolean).slice(0, 12);
  const { error } = await supabase.rpc("update_reading_club_settings", {
    p_club_id: Number(clubId),
    p_name: String(name || "").trim(),
    p_description: String(description || "").trim(),
    p_visibility: visibility === "private" ? "private" : "public",
    p_banner_url: String(bannerUrl || "").trim(),
    p_icon_url: String(iconUrl || "").trim(),
    p_rules: cleanRules,
  });
  if (error) throw new Error(error.message || "No se pudieron guardar los ajustes del club.");
  return true;
}

export async function replaceClubChapters(clubId, titles = []) {
  const profile = await currentProfile();
  const cleanTitles = (titles || [])
    .map((title) => String(title || "").trim())
    .filter(Boolean)
    .slice(0, 120);
  if (!cleanTitles.length) throw new Error("Añade al menos un capítulo.");

  const { error: deleteError } = await supabase
    .from("reading_club_chapters")
    .delete()
    .eq("club_id", Number(clubId));
  if (deleteError) throw new Error(deleteError.message || "No se pudieron actualizar los capítulos.");

  const { error } = await supabase.from("reading_club_chapters").insert(
    cleanTitles.map((title, index) => ({
      club_id: Number(clubId),
      chapter_number: index + 1,
      title,
      created_by: profile.id,
    })),
  );
  if (error) throw new Error(error.message || "No se pudieron guardar los capítulos.");
  return true;
}

export async function createClubMeeting({ clubId, title, startsAt, endsAt = null, location = "", description = "", eventType = "meeting" }) {
  const profile = await currentProfile();
  const { data, error } = await supabase
    .from("reading_club_meetings")
    .insert({
      club_id: Number(clubId),
      title: String(title || "Reunión del club").trim(),
      starts_at: startsAt,
      ends_at: endsAt || null,
      location: String(location || "").trim(),
      description: String(description || "").trim(),
      event_type: ["meeting", "reading", "debate", "deadline", "other"].includes(eventType) ? eventType : "meeting",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message || "No se pudo crear el evento.");
  return data;
}

export async function updateClubMeeting(meetingId, values) {
  const { error } = await supabase
    .from("reading_club_meetings")
    .update({
      title: String(values.title || "Reunión del club").trim(),
      starts_at: values.startsAt,
      ends_at: values.endsAt || null,
      location: String(values.location || "").trim(),
      description: String(values.description || "").trim(),
      event_type: ["meeting", "reading", "debate", "deadline", "other"].includes(values.eventType) ? values.eventType : "meeting",
    })
    .eq("id", Number(meetingId));
  if (error) throw new Error(error.message || "No se pudo editar el evento.");
  return true;
}

export async function deleteClubMeeting(meetingId) {
  const { error } = await supabase.from("reading_club_meetings").delete().eq("id", Number(meetingId));
  if (error) throw new Error(error.message || "No se pudo eliminar el evento.");
  return true;
}

export async function setClubMemberRole(clubId, userId, role) {
  const { error } = await supabase.rpc("set_reading_club_member_role", {
    p_club_id: Number(clubId),
    p_user_id: userId,
    p_role: role === "moderator" ? "moderator" : "member",
  });
  if (error) throw new Error(error.message || "No se pudo cambiar el rol.");
  return true;
}

export async function removeClubMember(clubId, userId) {
  const { error } = await supabase.rpc("remove_reading_club_member", {
    p_club_id: Number(clubId),
    p_user_id: userId,
  });
  if (error) throw new Error(error.message || "No se pudo retirar a la persona del club.");
  return true;
}

export async function deleteReadingClub(clubId) {
  const { error } = await supabase.rpc("delete_reading_club", { p_club_id: Number(clubId) });
  if (error) throw new Error(error.message || "No se pudo eliminar el club.");
  return true;
}

export async function uploadClubPostImage(file) {
  if (!file) return "";
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) {
    throw new Error("La imagen debe ser JPG, PNG, WebP o GIF.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La imagen no puede superar los 5 MB.");
  }

  const user = await currentUser();
  const extension = String(file.name || "image.jpg").split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/posts/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("club-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message || "No se pudo subir la imagen.");
  return path;
}

export function clubMediaUrl(path) {
  const clean = String(path || "").trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  return supabase.storage.from("club-media").getPublicUrl(clean).data.publicUrl || "";
}

export async function createClubPost({
  clubId,
  channel = "general",
  chapterNumber = null,
  content = "",
  quoteText = "",
  imageFile = null,
  containsSpoilers = false,
}) {
  const profile = await currentProfile();
  const imagePath = imageFile ? await uploadClubPostImage(imageFile) : "";
  const cleanContent = String(content || "").trim();
  const cleanQuote = String(quoteText || "").trim();

  if (!cleanContent && !cleanQuote && !imagePath) {
    throw new Error("Escribe algo, añade una cita o escoge una imagen.");
  }

  const isChapter = channel === "chapter";
  const { data, error } = await supabase
    .from("reading_club_posts")
    .insert({
      club_id: Number(clubId),
      user_id: profile.id,
      channel: isChapter ? "chapter" : "general",
      chapter_number: isChapter ? Math.max(1, Number.parseInt(chapterNumber, 10) || 1) : null,
      content: cleanContent,
      quote_text: cleanQuote,
      image_path: imagePath,
      contains_spoilers: Boolean(containsSpoilers),
    })
    .select("id")
    .single();

  if (error) {
    if (imagePath) await supabase.storage.from("club-media").remove([imagePath]);
    throw new Error(error.message || "No se pudo publicar el mensaje.");
  }

  return data;
}

export async function toggleClubPostReaction(postId, reaction = "heart") {
  const profile = await currentProfile();
  const safeReaction = reaction === "leaf" ? "leaf" : "heart";
  const { data: existing, error: findError } = await supabase
    .from("reading_club_post_reactions")
    .select("post_id")
    .eq("post_id", Number(postId))
    .eq("user_id", profile.id)
    .eq("reaction", safeReaction)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("reading_club_post_reactions")
      .delete()
      .eq("post_id", Number(postId))
      .eq("user_id", profile.id)
      .eq("reaction", safeReaction);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from("reading_club_post_reactions").insert({
    post_id: Number(postId),
    user_id: profile.id,
    reaction: safeReaction,
  });
  if (error) throw error;
  return true;
}

export async function getClubDetail(clubId) {
  const profile = await currentProfile();
  const id = Number(clubId);

  const [{ data: club, error: clubError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("reading_clubs").select(CLUB_FIELDS).eq("id", id).single(),
      supabase
        .from("reading_club_members")
        .select("club_id, user_id, role, status, current_chapter, current_page, progress, joined_at")
        .eq("club_id", id)
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]);

  if (clubError) throw new Error(clubError.message || "No se pudo abrir el club.");
  if (membershipError) throw membershipError;

  if (!membership || membership.status !== "active") {
    return {
      club: { ...club, book: (await booksByIds([club.current_book_id]))[0] || null },
      membership: null,
      profile,
      members: [],
      chapters: [],
      posts: [],
      meetings: [],
    };
  }

  const [bookRows, membersResult, chaptersResult, postsResult, meetingsResult, achievementsResult] = await Promise.all([
    booksByIds([club.current_book_id]),
    supabase
      .from("reading_club_members")
      .select("club_id, user_id, role, status, current_chapter, current_page, progress, joined_at")
      .eq("club_id", id)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    supabase
      .from("reading_club_chapters")
      .select("id, club_id, chapter_number, title")
      .eq("club_id", id)
      .order("chapter_number", { ascending: true }),
    supabase
      .from("reading_club_posts")
      .select("id, club_id, user_id, channel, chapter_number, content, quote_text, image_path, contains_spoilers, parent_post_id, created_at")
      .eq("club_id", id)
      .order("created_at", { ascending: true })
      .limit(150),
    supabase
      .from("reading_club_meetings")
      .select("id, club_id, title, starts_at, ends_at, location, description, event_type, created_at, updated_at")
      .eq("club_id", id)
      .order("starts_at", { ascending: true })
      .limit(120),
    supabase
      .from("reading_club_member_achievements")
      .select("id, club_id, user_id, badge_key, label, description, image_url, awarded_at")
      .eq("club_id", id)
      .order("awarded_at", { ascending: false }),
  ]);

  for (const result of [membersResult, chaptersResult, postsResult, meetingsResult, achievementsResult]) {
    if (result.error) throw result.error;
  }

  const members = membersResult.data || [];
  const posts = postsResult.data || [];
  const profileIds = unique([
    ...members.map((member) => member.user_id),
    ...posts.map((post) => post.user_id),
  ]);
  const postIds = posts.map((post) => post.id);

  const [profiles, reactionsResult] = await Promise.all([
    profilesByIds(profileIds),
    postIds.length
      ? supabase
          .from("reading_club_post_reactions")
          .select("post_id, user_id, reaction")
          .in("post_id", postIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  const profileMap = mapById(profiles);
  const reactionsByPost = new Map();

  (reactionsResult.data || []).forEach((reaction) => {
    const key = String(reaction.post_id);
    const current = reactionsByPost.get(key) || [];
    current.push(reaction);
    reactionsByPost.set(key, current);
  });

  return {
    profile,
    club: { ...club, book: bookRows[0] || null },
    membership,
    members: members.map((member) => ({
      ...member,
      profile: profileMap.get(String(member.user_id)) || null,
    })),
    chapters: chaptersResult.data || [],
    posts: posts.map((post) => {
      const reactions = reactionsByPost.get(String(post.id)) || [];
      return {
        ...post,
        profile: profileMap.get(String(post.user_id)) || null,
        image_url: clubMediaUrl(post.image_path),
        reactions,
        heart_count: reactions.filter((item) => item.reaction === "heart").length,
        leaf_count: reactions.filter((item) => item.reaction === "leaf").length,
        liked_by_me: reactions.some(
          (item) => item.reaction === "heart" && item.user_id === profile.id,
        ),
        leafed_by_me: reactions.some(
          (item) => item.reaction === "leaf" && item.user_id === profile.id,
        ),
      };
    }),
    meetings: meetingsResult.data || [],
    achievements: achievementsResult.data || [],
  };
}
