import { useEffect, useMemo, useState } from "react";
import "./Inicio.css";
import { getProfileOverview } from "./lib/profileApi.js";

const landing = {
  brand: "Librélula",
  eyebrow: "Tu biblioteca virtual",
  titleA: "Donde los libros",
  titleB: "están a tu ",
  titleC: "alcance",
  lede:
    "Miles de historias, un vuelo de distancia. Organiza tus lecturas, guarda reseñas y encuentra tu próxima obsesión literaria.",
};

const landingStats = [
  { value: "12K+", label: "Novelas" },
  { value: "840+", label: "Autores" },
  { value: "2K+", label: "Participantes" },
];

const landingFeatures = [
  {
    number: "01",
    title: "Catálogo personal",
    text: "Explora tus libros con una estética cálida, clara y muy tuya.",
  },
  {
    number: "02",
    title: "Reseñas y notas",
    text: "Guarda estrellas, opiniones y pequeños post-its literarios.",
  },
  {
    number: "03",
    title: "Rincón lector",
    text: "Reúne biblioteca, actividad y favoritos en un espacio propio.",
  },
];

const STATUS_LABELS = {
  reading: "En lectura",
  rereading: "Releyendo",
  paused: "Pausado",
  planned: "Pendiente",
  completed: "Terminado",
  dropped: "Abandonado",
};

const COVER_GRADIENTS = [
  "linear-gradient(160deg, #687e67, #34483d)",
  "linear-gradient(160deg, #c4865d, #8b5739)",
  "linear-gradient(160deg, #7d6a97, #473957)",
  "linear-gradient(160deg, #b9a454, #75672e)",
];

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function cleanName(value) {
  const text = asText(value);
  if (!text) return "Sofía";
  return text.includes("@") ? text.split("@")[0] : text;
}

function initials(name) {
  return cleanName(name)
    .replace("(tú)", "")
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeAssetUrl(value) {
  const text = asText(value);
  if (!text) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(text)) return text;
  return `/${text.replace(/^\.\//, "")}`;
}

function formatDate(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time <= 0) return "recientemente";

  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "justo ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;

  return new Date(time).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function buildBookCoverStyle(book, index) {
  const cover = normalizeAssetUrl(book?.cover);

  if (cover) {
    return {
      backgroundImage: `linear-gradient(160deg, rgba(47, 32, 27, 0.18), rgba(47, 32, 27, 0.04)), url("${cover}")`,
    };
  }

  return {
    background: COVER_GRADIENTS[index % COVER_GRADIENTS.length],
  };
}

function readingMeta(book) {
  const progress = clampPercent(book?.progress);
  const totalPages = asNumber(book?.pages);
  const currentPage = totalPages > 0 ? Math.round((totalPages * progress) / 100) : null;

  return {
    progress,
    totalPages,
    currentPage,
    finished: progress >= 100 || book?.status === "completed",
  };
}

export default function Inicio({
  isLoggedIn = false,
  onExplore,
  onLogin,
  onProfile,
  onLibrary,
  onReviews,
}) {
  if (isLoggedIn) {
    return (
      <LoggedInHome
        onExplore={onExplore}
        onProfile={onProfile}
        onLibrary={onLibrary || onProfile}
        onReviews={onReviews || onProfile}
      />
    );
  }

  return <LandingHome onExplore={onExplore} onLogin={onLogin} />;
}

function LandingHome({ onExplore, onLogin }) {
  return (
    <main className="inicio-editorial-shell">
      <section className="inicio-editorial-hero">
        <div className="inicio-editorial-copy">
          <div className="inicio-logo-lockup">
            <img src="/images/librelula-font.png" alt={landing.brand} />
            <span aria-hidden="true" />
          </div>

          <p className="inicio-editorial-eyebrow">{landing.eyebrow}</p>

          <h1 className="inicio-editorial-title">
            {landing.titleA}
            <br />
            {landing.titleB}
            <em>{landing.titleC}</em>
          </h1>

          <p className="inicio-editorial-lede">{landing.lede}</p>

          <div className="inicio-editorial-actions">
            <button type="button" className="inicio-primary-action" onClick={onExplore}>
              Explorar catálogo
              <span aria-hidden="true">→</span>
            </button>

            <button type="button" className="inicio-secondary-action" onClick={onLogin}>
              Iniciar sesión
            </button>

            <a className="inicio-text-link" href="#inicio-editorial-features">
              Conocer más <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="inicio-editorial-stats">
            {landingStats.map((item) => (
              <article key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="inicio-art-panel" aria-hidden="true">
          <div className="inicio-art-image" />
          <div className="inicio-art-glow" />
          <div className="inicio-dragonfly">
            <span />
            <i />
          </div>
          <span className="inicio-firefly inicio-firefly--one" />
          <span className="inicio-firefly inicio-firefly--two" />
          <span className="inicio-firefly inicio-firefly--three" />
        </div>
      </section>

      <section className="inicio-editorial-features" id="inicio-editorial-features">
        {landingFeatures.map((item) => (
          <article key={item.number}>
            <span>{item.number}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function LoggedInHome({ onExplore, onProfile, onLibrary, onReviews }) {
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [draft, setDraft] = useState("");
  const [localPosts, setLocalPosts] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadHomeData() {
      setLoading(true);
      setMessage(null);

      try {
        const data = await getProfileOverview();
        if (!ignore) {
          setHomeData(data);
        }
      } catch (error) {
        if (!ignore) {
          setMessage(error.message || "No se pudo cargar tu inicio lector.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadHomeData();

    return () => {
      ignore = true;
    };
  }, []);

  const profileName = homeData?.profile
    ? cleanName(homeData.profile.username || homeData.profile.email)
    : "";
  const feedUserName = profileName || "TÃº";
  const currentReadingBooks = homeData?.currentReadingBooks || [];
  const streak = asNumber(homeData?.streak);

  const feedItems = useMemo(() => {
    const activityItems = (homeData?.recentActivity || []).map((item) => ({
      id: `activity-${item.book_id}-${item.status}-${item.date}`,
      type: "activity",
      user: feedUserName,
      avatar: initials(feedUserName),
      action: item.action || "Actualizaste",
      book: item.title || "un libro",
      time: formatDate(item.date),
      self: true,
    }));

    return [...localPosts, ...activityItems].slice(0, 18);
  }, [homeData?.recentActivity, localPosts, profileName]);

  function publishPost(event) {
    event.preventDefault();

    const text = draft.trim();
    if (!text) return;

    setLocalPosts((items) => [
      {
        id: `post-${Date.now()}`,
        type: "post",
        user: `${profileName} (tú)`,
        avatar: initials(feedUserName),
        text,
        time: "justo ahora",
        self: true,
      },
      ...items,
    ]);
    setDraft("");
  }

  return (
    <main className="lector-dashboard-shell">
      <section className="lector-greeting-row">
        <div>
          <p>Inicio lector</p>
          <h1>
            {loading && !profileName ? "Cargando tu inicio lectorâ€¦" : `Hola, ${profileName || "lectora"}`}
          </h1>
        </div>

        <button type="button" onClick={onProfile}>
          Mi rincón
        </button>
      </section>

      {message && <p className="lector-dashboard-message is-error">{message}</p>}

      <section className="lector-dashboard-wrap">
        <div className="lector-dashboard-main">
          <div className="lector-section-title">
            <div>
              <h2>Continúa leyendo</h2>
              <span>
                {streak > 0
                  ? `${streak} día${streak === 1 ? "" : "s"} seguidos leyendo`
                  : "Marca progreso para empezar tu racha lectora"}
              </span>
            </div>

            <button type="button" onClick={onLibrary}>
              Ver biblioteca
            </button>
          </div>

          {loading ? (
            <section className="lector-empty-state">
              <h3>Cargando tu biblioteca…</h3>
              <p>Estamos buscando tus lecturas actuales.</p>
            </section>
          ) : currentReadingBooks.length > 0 ? (
            <div className="lector-book-list">
              {currentReadingBooks.map((book, index) => {
                const meta = readingMeta(book);
                const label = STATUS_LABELS[book.status] || "En lectura";

                return (
                  <article className="lector-book-card" key={book.id}>
                    <div
                      className="lector-book-cover"
                      style={buildBookCoverStyle(book, index)}
                      aria-hidden="true"
                    >
                      {!book.cover ? book.title : null}
                    </div>

                    <div className="lector-book-info">
                      <div className="lector-book-heading">
                        <div>
                          <h3>{book.title}</h3>
                          <p>{book.author || "Autor desconocido"}</p>
                        </div>

                        <strong>{meta.progress}%</strong>
                      </div>

                      <div className="lector-progress-track" aria-label="Progreso de lectura">
                        <span style={{ width: `${meta.progress}%` }} />
                      </div>

                      <div className="lector-progress-meta">
                        <span>
                          {meta.totalPages > 0
                            ? `${meta.currentPage} / ${meta.totalPages} páginas`
                            : `${meta.progress}% leído`}
                        </span>
                        <span>{meta.finished ? "Terminado" : label}</span>
                      </div>

                      <div className="lector-progress-actions">
                        <button type="button" onClick={onLibrary}>
                          Actualizar progreso
                        </button>
                        <button type="button" onClick={onReviews}>
                          Escribir reseña
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <section className="lector-empty-state">
              <h3>No tienes libros marcados como leyendo.</h3>
              <p>Marca un libro como “Leyendo” desde el catálogo o tu biblioteca para verlo aquí.</p>
              <button type="button" onClick={onExplore}>
                Explorar catálogo
              </button>
            </section>
          )}

          <div className="lector-dashboard-actions">
            <button type="button" onClick={onExplore}>Explorar catálogo</button>
            <button type="button" onClick={onReviews}>Mis reseñas</button>
          </div>
        </div>

        <aside className="lector-dashboard-side">
          <article className="lector-side-card lector-side-card--soft">
            <p>Próximo objetivo</p>
            <h2>15 min de lectura</h2>
            <span>Un recordatorio suave para volver a tu libro actual.</span>
          </article>

          <article className="lector-side-card lector-side-card--streak">
            <p>Racha lectora</p>
            <strong>{streak}</strong>
            <span>
              {streak === 1 ? "día seguido leyendo" : "días seguidos leyendo"}
            </span>
          </article>
        </aside>

        <article className="lector-side-card lector-side-card--feed lector-feed-wide">
          <div className="lector-section-title lector-section-title--compact">
            <div>
              <h2>Actividad reciente</h2>
              <span>Feed lector</span>
            </div>
          </div>

          <form className="lector-post-box" onSubmit={publishPost}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="¿Qué estás leyendo hoy?"
              rows="3"
            />
            <div>
              <small>Publicación local hasta activar amigos en Supabase.</small>
              <button type="submit" disabled={!draft.trim()}>
                Publicar
              </button>
            </div>
          </form>

          <div className="lector-feed-scroll" aria-label="Actividad reciente">
            {feedItems.length > 0 ? (
              feedItems.map((item) => (
                <article className="lector-feed-item" key={item.id}>
                  <span className="lector-feed-avatar" aria-hidden="true">
                    {item.avatar}
                  </span>

                  <div>
                    {item.type === "post" ? (
                      <p>
                        <strong>{item.user}</strong>
                        {item.self ? <b>TÚ</b> : null}
                        <span>{item.text}</span>
                      </p>
                    ) : (
                      <p>
                        <strong>{item.user}</strong> {item.action} <em>{item.book}</em>
                        {item.self ? <b>TÚ</b> : null}
                      </p>
                    )}
                    <small>{item.time}</small>
                  </div>
                </article>
              ))
            ) : (
              <div className="lector-feed-empty">
                <p>Aún no hay actividad.</p>
                <span>Actualiza un libro o publica algo para empezar el feed.</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
