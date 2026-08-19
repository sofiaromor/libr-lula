import { useEffect, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import { getProfileOverview, uploadProfileCover } from "./lib/profileApi.js";
import "./PerfilSupabase.css";
import "./ProfileSummaryV2.css";

const PROFILE_TABS = [
  { id: "summary", label: "Resumen" },
  { id: "shelf", label: "Estantería" },
  { id: "activity", label: "Actividad" },
  { id: "favorites", label: "Favoritos" },
  { id: "reviews", label: "Reseñas" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function assetUrl(path, fallback = "images/librelula.png") {
  const clean = String(path || "").trim();
  if (!clean || clean === "default.jpg") return publicUrl(fallback);
  if (/^https?:\/\//i.test(clean) || clean.startsWith("blob:")) return clean;
  return publicUrl(clean);
}

function FavoriteBooks({ books, onSelectBook, onFavorites }) {
  const visible = (books || []).slice(0, 5);
  return (
    <article className="profile-v2-card profile-v2-favorite-books">
      <div className="profile-v2-card-heading">
        <div>
          <span>Su selección</span>
          <h2>Libros favoritos</h2>
        </div>
        <button type="button" onClick={onFavorites}>Ver todos →</button>
      </div>
      {visible.length ? (
        <div className="profile-v2-favorite-covers">
          {visible.map((book) => (
            <button type="button" key={book.id} onClick={() => onSelectBook?.(book)} title={book.title}>
              <img
                src={assetUrl(book.cover)}
                alt={book.title ? `Portada de ${book.title}` : "Portada de libro favorito"}
                loading="lazy"
                onError={(event) => { event.currentTarget.src = publicUrl("images/librelula.png"); }}
              />
              <strong>{book.title || "Libro sin título"}</strong>
              <small>{book.author || "Autor desconocido"}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="profile-v2-soft-empty">Todavía no ha elegido sus libros favoritos.</p>
      )}
    </article>
  );
}

function FavoriteAuthors({ authors, onFavorites }) {
  const visible = (authors || []).slice(0, 8);
  return (
    <article className="profile-v2-card profile-v2-favorite-authors">
      <div className="profile-v2-card-heading">
        <div>
          <span>Voces imprescindibles</span>
          <h2>Autores favoritos</h2>
        </div>
        <button type="button" onClick={onFavorites}>Favoritos →</button>
      </div>
      {visible.length ? (
        <div className="profile-v2-author-cloud">
          {visible.map((author, index) => (
            <span key={author} className={index < 3 ? "is-primary" : ""}>{author}</span>
          ))}
        </div>
      ) : (
        <p className="profile-v2-soft-empty">Sus autores favoritos aparecerán aquí.</p>
      )}
    </article>
  );
}

function ReadingStreak({ streak, days, onActivity }) {
  const recentDays = (days || []).slice(-7);
  return (
    <article className="profile-v2-card profile-v2-streak">
      <div className="profile-v2-card-heading">
        <div>
          <span>Constancia lectora</span>
          <h2><strong>{formatNumber(streak)}</strong> días de racha</h2>
        </div>
      </div>
      <div className="profile-v2-week" aria-label="Actividad de los últimos siete días">
        {recentDays.map((day) => (
          <div key={day.date}>
            <i className={day.points > 0 ? "is-active" : ""} title={day.label} />
            <small>{new Date(day.date).toLocaleDateString("es-ES", { weekday: "narrow" })}</small>
          </div>
        ))}
      </div>
      <button type="button" className="profile-v2-inline-link" onClick={onActivity}>Ver su actividad →</button>
    </article>
  );
}

function ClubBookmarks({ achievements }) {
  const visible = (achievements || []).slice(0, 4);
  return (
    <article className="profile-v2-card profile-v2-bookmarks">
      <div className="profile-v2-card-heading">
        <div>
          <span>Clubes de lectura</span>
          <h2>Marcapáginas</h2>
        </div>
      </div>
      {visible.length ? (
        <div className="profile-v2-bookmark-list">
          {visible.map((achievement) => (
            <div key={achievement.id}>
              <i aria-hidden="true">❧</i>
              <span>
                <strong>{achievement.label}</strong>
                <small>{achievement.club?.name || "Club de lectura"}</small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="profile-v2-bookmark-empty">
          <i aria-hidden="true">❧</i>
          <span><strong>Aún sin marcapáginas</strong><small>Los logros de sus clubes aparecerán aquí.</small></span>
        </div>
      )}
    </article>
  );
}

function LatestActivity({ item, profile, onSelectBook, onActivity }) {
  const displayName = profile?.display_name || profile?.username || "Lectora";
  const handle = String(profile?.username || "lectora").replace(/^@/, "");
  const avatar = assetUrl(profile?.avatar, "images/avatar/avatar1.png");

  return (
    <article className="profile-v2-activity-post">
      <div className="profile-v2-activity-heading">
        <span>Última actividad</span>
        <button type="button" onClick={onActivity}>Ver actividad →</button>
      </div>
      {item ? (
        <div className="profile-v2-post-body">
          <img
            className="profile-v2-post-avatar"
            src={avatar}
            alt={`Avatar de ${displayName}`}
            onError={(event) => { event.currentTarget.src = publicUrl("images/avatar/avatar1.png"); }}
          />
          <div className="profile-v2-post-content">
            <div className="profile-v2-post-meta">
              <strong>{displayName}</strong>
              <span>@{handle}</span>
              {item.date ? <time>· {formatDate(item.date)}</time> : null}
            </div>
            <p><strong>{item.action || "Actualizó su lectura"}</strong> {item.title ? <span>{item.title}</span> : null}</p>
            {item.title ? (
              <button type="button" className="profile-v2-post-book" onClick={() => onSelectBook?.(item)}>
                <img
                  src={assetUrl(item.cover)}
                  alt={item.title ? `Portada de ${item.title}` : "Portada del libro"}
                  loading="lazy"
                  onError={(event) => { event.currentTarget.src = publicUrl("images/librelula.png"); }}
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.author || "Autor desconocido"}</small>
                  {Number(item.progress) > 0 ? (
                    <span className="profile-v2-post-progress">
                      <i><b style={{ width: `${clampProgress(item.progress)}%` }} /></i>
                      <em>{clampProgress(item.progress)}%</em>
                    </span>
                  ) : null}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="profile-v2-soft-empty">Todavía no hay actividad lectora reciente.</p>
      )}
    </article>
  );
}

export default function ProfileSummaryV2({
  activeTab = "summary",
  onTabChange,
  onOpenCatalog,
  onSelectBook,
  profileId = null,
  onBackToClub,
}) {
  const fileInputRef = useRef(null);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [coverState, setCoverState] = useState({ saving: false, error: "" });

  useEffect(() => {
    let cancelled = false;
    getProfileOverview(profileId)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message || "No se pudo cargar el perfil.", data: null });
      });
    return () => { cancelled = true; };
  }, [profileId]);

  async function handleCoverSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverState({ saving: true, error: "" });
    try {
      const coverImage = await uploadProfileCover(file);
      setState((current) => ({
        ...current,
        data: current.data ? { ...current.data, profile: { ...current.data.profile, cover_image: coverImage } } : current.data,
      }));
      setCoverState({ saving: false, error: "" });
    } catch (error) {
      setCoverState({ saving: false, error: error?.message || "No se pudo cambiar la portada." });
    }
  }

  if (state.loading) {
    return (
      <main className="reader-profile profile-redesign">
        <section className="profile-shell"><div className="profile-loading-card"><span className="profile-loader" /><p>Cargando su rincón literario…</p></div></section>
      </main>
    );
  }

  const data = state.data;
  const profile = data?.profile;
  if (state.error || !data?.authenticated || !profile) {
    return (
      <main className="reader-profile profile-redesign">
        <section className="profile-shell">
          <div className="profile-error-card">
            <h1>No se pudo abrir este rincón</h1>
            <p>{state.error || "Este perfil no está disponible."}</p>
            <button type="button" onClick={onOpenCatalog}>Volver al catálogo</button>
          </div>
        </section>
      </main>
    );
  }

  const avatarUrl = assetUrl(profile.avatar, "images/avatar/avatar1.png");
  const coverUrl = assetUrl(profile.cover_image, "images/fondo.png");
  const displayName = profile.display_name || profile.username || "Mi rincón";
  const handle = String(profile.username || "lectora").replace(/^@/, "");
  const latestActivity = data.recentActivity?.[0] || null;

  return (
    <main className="reader-profile profile-redesign profile-summary-page-v2">
      <section className="profile-shell">
        {onBackToClub ? (
          <button type="button" className="profile-back-to-club" onClick={onBackToClub}><span aria-hidden="true">←</span> Volver al club</button>
        ) : null}

        <header className="profile-hero" style={{ "--profile-cover": `url("${coverUrl}")` }}>
          <div className="profile-hero-overlay" />
          {data.isOwner ? (
            <>
              <button
                type="button"
                className="profile-change-cover"
                onClick={() => fileInputRef.current?.click()}
                disabled={coverState.saving}
                aria-label={coverState.saving ? "Guardando portada" : "Ajustes de portada"}
              >
                <span aria-hidden="true">▣</span>{coverState.saving ? "Guardando…" : "Cambiar portada"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleCoverSelected} />
            </>
          ) : null}
          <div className="profile-identity">
            <div className="profile-avatar-frame">
              <img src={avatarUrl} alt={`Avatar de ${displayName}`} onError={(event) => { event.currentTarget.src = publicUrl("images/avatar/avatar1.png"); }} />
            </div>
            <div className="profile-identity-copy">
              <h1>{displayName}</h1>
              <span>@{handle}</span>
              <p>{profile.bio || "Lecturas, favoritos y pequeñas huellas de mi biblioteca personal."}</p>
              <div className="profile-social-counts">
                <button type="button"><strong>{formatNumber(data.social.followers)}</strong> seguidores</button>
                <button type="button"><strong>{formatNumber(data.social.following)}</strong> siguiendo</button>
              </div>
            </div>
          </div>
        </header>

        {coverState.error ? <p className="profile-inline-error">{coverState.error}</p> : null}

        <nav className="profile-tabs" aria-label="Secciones del perfil" role="tablist">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`profile-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => onTabChange?.(tab.id)}
            >{tab.label}</button>
          ))}
        </nav>

        <section className="profile-summary-v2" id="profile-panel-summary" role="tabpanel">
          <div className="profile-summary-v2-top">
            <FavoriteBooks books={data.favoriteBooks} onSelectBook={onSelectBook} onFavorites={() => onTabChange?.("favorites")} />
            <FavoriteAuthors authors={data.favoriteAuthors} onFavorites={() => onTabChange?.("favorites")} />
            <div className="profile-summary-v2-details">
              <ReadingStreak streak={data.streak} days={data.activityDays} onActivity={() => onTabChange?.("activity")} />
              <ClubBookmarks achievements={data.clubAchievements} />
            </div>
          </div>
          <LatestActivity item={latestActivity} profile={profile} onSelectBook={onSelectBook} onActivity={() => onTabChange?.("activity")} />
        </section>
      </section>
    </main>
  );
}
