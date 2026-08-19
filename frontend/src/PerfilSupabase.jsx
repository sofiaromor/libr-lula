import { lazy, Suspense } from "react";
import "./ProfileV2.css";
import "./ProfileV2Identity.css";
import "./ProfileV2Polish.css";

const PerfilSupabaseImpl = lazy(() => import("./PerfilSupabaseImpl.jsx"));

function ProfileLoadingShell() {
  return (
    <main className="reader-profile profile-redesign profile-v2-loading" aria-busy="true">
      <section className="profile-shell">
        <div className="profile-v2-skeleton-hero">
          <span className="profile-v2-skeleton-avatar" />
          <div className="profile-v2-skeleton-copy">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="profile-v2-skeleton-tabs">
          {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
        </div>
        <div className="profile-v2-skeleton-grid">
          <span />
          <span />
          <span />
        </div>
        <p className="sr-only">Abriendo tu rincón literario…</p>
      </section>
    </main>
  );
}

export default function PerfilSupabase(props) {
  return (
    <Suspense fallback={<ProfileLoadingShell />}>
      <PerfilSupabaseImpl {...props} />
    </Suspense>
  );
}
