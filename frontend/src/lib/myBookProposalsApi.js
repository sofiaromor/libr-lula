import { supabase } from "./supabase.js";

const PROPOSAL_SELECT = `
  id,
  title,
  author,
  cover,
  year,
  review_status,
  moderation_note,
  created_at,
  provider,
  source_id
`;

export async function getMyBookProposals() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error("No se pudo comprobar tu sesión.");
  }

  if (!user) return [];

  const { data, error } = await supabase
    .from("books")
    .select(PROPOSAL_SELECT)
    .eq("created_by", user.id)
    .in("review_status", ["pending", "rejected"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar tus propuestas.");
  }

  return Array.isArray(data) ? data : [];
}