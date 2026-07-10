import { supabase } from "./supabase.js";

const MODERATION_SELECT = "*";

async function requireCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Inicia sesión para revisar propuestas.");
  }

  return user;
}

export async function getPendingBookProposals() {
  await requireCurrentUser();

  const { data, error } = await supabase
    .from("books")
    .select(MODERATION_SELECT)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar las propuestas.");
  }

  return Array.isArray(data) ? data : [];
}

export async function approveBookProposal(bookId) {
  const user = await requireCurrentUser();

  const { data, error } = await supabase
    .from("books")
    .update({
      review_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      rejected_at: null,
      moderation_note: null,
    })
    .eq("id", bookId)
    .select(MODERATION_SELECT)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo aprobar la propuesta.");
  }

  return data;
}

export async function rejectBookProposal(bookId, note = "") {
  await requireCurrentUser();

  const { data, error } = await supabase
    .from("books")
    .update({
      review_status: "rejected",
      rejected_at: new Date().toISOString(),
      moderation_note: String(note || "").trim() || "Propuesta rechazada por moderación.",
    })
    .eq("id", bookId)
    .select(MODERATION_SELECT)
    .single();

  if (error) {
    throw new Error(error.message || "No se pudo rechazar la propuesta.");
  }

  return data;
}