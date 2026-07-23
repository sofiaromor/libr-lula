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
  let active = true;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    window.setTimeout(async () => {
      try {
        const session = await getSupabaseAppSession();

        if (active) {
          callback(session);
        }
      } catch {
        if (active) {
          callback(EMPTY_SUPABASE_SESSION);
        }
      }
    }, 0);
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

function getAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.location.origin;
}

export async function signInSupabase({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return getSupabaseAppSession();
}

export async function signUpSupabase({ email, password, username }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanUsername = String(username || "").trim();

  if (!cleanEmail) {
    throw new Error("Escribe tu correo electrónico.");
  }

  if (!cleanUsername) {
    throw new Error("Elige un nombre de usuario.");
  }

  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        username: cleanUsername,
      },
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }

  if (data?.session) {
    return getSupabaseAppSession();
  }

  return {
    authenticated: false,
    needsEmailConfirmation: true,
    email: cleanEmail,
  };
}

export async function signOutSupabase() {
  await supabase.auth.signOut();
}