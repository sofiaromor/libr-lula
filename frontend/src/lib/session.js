import { supabase } from "./supabase.js";

export const EMPTY_SUPABASE_SESSION = {
  authenticated: false,
  is_admin: false,
  user: null,
};

export async function getSupabaseAppSession() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return EMPTY_SUPABASE_SESSION;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, legacy_id, username, avatar, bio, is_admin")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw profileError;
  }

  return {
    authenticated: true,
    is_admin: Boolean(profile?.is_admin),
    user: {
      id: user.id,
      email: user.email,
      legacy_id: profile?.legacy_id || null,
      username: profile?.username || user.email || "Mi perfil",
      avatar: profile?.avatar || "",
      bio: profile?.bio || "",
    },
  };
}

export function onSupabaseAuthChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async () => {
    try {
      const session = await getSupabaseAppSession();
      callback(session);
    } catch {
      callback(EMPTY_SUPABASE_SESSION);
    }
  });

  return () => subscription.unsubscribe();
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}
