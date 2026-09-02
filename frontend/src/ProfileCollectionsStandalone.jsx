import { useEffect, useState } from "react";
import ProfileCollections from "./ProfileCollections.jsx";
import { getMyLibrary } from "./lib/library.js";
import { supabase } from "./lib/supabase.js";
import "./ProfileCollectionsStandalone.css";

export default function ProfileCollectionsStandalone({ profileId, onSelectBook }) {
  const [context, setContext] = useState({ loading: true, isOwner: false, shelfBooks: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const viewerId = session?.user?.id || "";
      const isOwner = Boolean(viewerId && (!profileId || profileId === viewerId));
      let shelfBooks = [];

      if (isOwner) {
        try {
          const library = await getMyLibrary();
          shelfBooks = (library.items || [])
            .map((item) => ({
              ...(item.book || {}),
              status: item.status,
              score: item.score,
            }))
            .filter((book) => book.id);
        } catch {
          shelfBooks = [];
        }
      }

      if (!cancelled) setContext({ loading: false, isOwner, shelfBooks });
    }

    loadContext();
    return () => { cancelled = true; };
  }, [profileId]);

  if (context.loading) return null;

  return (
    <section className="profile-collections-standalone-shell" aria-label="Colecciones del perfil">
      <ProfileCollections
        profileId={profileId}
        isOwner={context.isOwner}
        shelfBooks={context.shelfBooks}
        onSelectBook={onSelectBook}
      />
    </section>
  );
}
