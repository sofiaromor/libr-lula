import { useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { prewarmHomeDashboard } from "./lib/homeDashboardApi.js";
import { prewarmHomeReadingProfile } from "./lib/profileApi.js";

function warmHome() {
  return Promise.allSettled([
    prewarmHomeReadingProfile(),
    prewarmHomeDashboard(),
  ]);
}

export default function HomeWarmup() {
  useEffect(() => {
    let active = true;

    async function warmIfSignedIn() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active || !session?.user) return;
      await warmHome();
    }

    warmIfSignedIn();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session?.user) return;
      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) {
        window.setTimeout(() => {
          if (active) warmHome();
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
