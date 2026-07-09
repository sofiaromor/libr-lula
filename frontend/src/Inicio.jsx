import { useEffect, useMemo, useState } from "react";
import "./Inicio.css";
import { getProfileOverview } from "./lib/profileApi.js";
import { saveCatalogUserBookProgress } from "./lib/catalogApi.js";

const landing = {
  brand: "Librélula",
  eyebrow: "Tu biblioteca virtual",
  titleA: "Donde los libros",
  titleB: "están a tu ",
  titleC: "alcance",
  lede:
    "Miles de historias, un vuelo de distancia. Organiza tus lecturas, guarda reseñas y encuentra tu próxima obsesión literaria.",
};

const landingStats = [];

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

const COMPLETION_CONFETTI = Array.from({ length: 46 }, (_, index) => index);

function completionPalette(book) {
  const seed = String(book?.title || book?.author || book?.id || "librelula");
  const palettes = [
    ["#2b1b3d", "#7f5fc9", "#f2d98a"],
    ["#2f2455", "#9c7edb", "#f2d98a"],
    ["#2b3f5f", "#8ab3d6", "#f6d7a7"],
    ["#513044", "#d487a6", "#f3d9a4"],
    ["#294d45", "#8bbd99", "#f2d98a"],
    ["#4a3427", "#c08a55", "#f1d6a2"],
  ];

  let total = 0;
  for (const character of seed) total += character.charCodeAt(0);

  return palettes[total % palettes.length];
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

function readingMeta(book, progressOverride = null) {
  const progress = clampPercent(progressOverride ?? book?.progress);
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

          {landingStats.length > 0 ? (
            <div className="inicio-editorial-stats">
              {landingStats.map((item) => (
                <article key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <div className="inicio-art-panel" aria-hidden="true">
          <div className="inicio-art-image" />
          <div className="inicio-art-glow" />
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
  const [progressDrafts, setProgressDrafts] = useState({});
  const [savingProgress, setSavingProgress] = useState({});
  const [completedBook, setCompletedBook] = useState(null);

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

  function displayedProgress(book) {
    const key = String(book?.id || "");
    return clampPercent(progressDrafts[key] ?? book?.progress);
  }

  function changeBookProgress(book, value) {
    const key = String(book?.id || "");
    if (!key) return;

    setProgressDrafts((items) => ({
      ...items,
      [key]: clampPercent(value),
    }));
  }

  async function persistBookProgress(book, value) {
    const key = String(book?.id || "");
    if (!key || savingProgress[key]) return;

    const cleanProgress = clampPercent(value);
    const previousProgress = clampPercent(book?.progress);

    setMessage(null);
    setProgressDrafts((items) => ({
      ...items,
      [key]: cleanProgress,
    }));
    setSavingProgress((items) => ({
      ...items,
      [key]: true,
    }));

    try {
      const response = await saveCatalogUserBookProgress({
        book_id: key,
        progress: cleanProgress,
      });

      const saved = response.item;

      if (cleanProgress >= 100 && previousProgress < 100) {
        setCompletedBook({
          ...book,
          status: saved?.status || "completed",
          progress: saved?.progress ?? cleanProgress,
          finished_at: saved?.finished_at || null,
          read_count: saved?.read_count || book?.read_count || 1,
        });

        setLocalPosts((items) => [
          {
            id: `completed-reading-${key}-${Date.now()}`,
            type: "reading",
            user: profileName || "Tú",
            avatar: String(profileName || "T").trim().slice(0, 1).toUpperCase() || "T",
            action: "ha terminado",
            book: book.title,
            time: "Ahora",
            self: true,
          },
          ...items,
        ]);
      }

      setHomeData((current) => {
        if (!current || !saved) return current;

        return {
          ...current,
          currentReadingBooks: (current.currentReadingBooks || [])
            .map((item) => {
              if (String(item.id) !== String(saved.book_id)) return item;

              return {
                ...item,
                status: saved.status,
                progress: saved.progress,
                started_at: saved.started_at,
                finished_at: saved.finished_at,
                read_count: saved.read_count,
              };
            })
            .filter((item) => !["completed", "finished"].includes(String(item.status || ""))),
        };
      });
    } catch (error) {
      setMessage(error.message || "No se pudo guardar tu progreso.");
    } finally {
      setProgressDrafts((items) => {
        const next = { ...items };
        delete next[key];
        return next;
      });
      setSavingProgress((items) => ({
        ...items,
        [key]: false,
      }));
    }
  }

  const completedMeta = completedBook ? readingMeta(completedBook, 100) : null;
  const completionColors = completedBook ? completionPalette(completedBook) : null;

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
                const bookKey = String(book.id);
                const progressValue = displayedProgress(book);
                const meta = readingMeta(book, progressValue);
                const label = STATUS_LABELS[book.status] || "En lectura";
                const isSavingBookProgress = Boolean(savingProgress[bookKey]);

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
                        <div className="lector-progress-badge">
                          <strong>{meta.progress}%</strong>
                          <span>leído</span>
                        </div>
                      </div>

                      <div
                        className="lector-progress-slider"
                        style={{ "--progress": `${meta.progress}%` }}
                      >
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={meta.progress}
                          aria-label={`Progreso de lectura de ${book.title}`}
                          disabled={isSavingBookProgress}
                          onChange={(event) => changeBookProgress(book, event.target.value)}
                          onPointerUp={(event) => persistBookProgress(book, event.currentTarget.value)}
                          onKeyUp={(event) => {
                            if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter"].includes(event.key)) {
                              persistBookProgress(book, event.currentTarget.value);
                            }
                          }}
                        />
                      </div>

                      <div className="lector-progress-meta">
                        <div className="lector-progress-meta-group">
                          <span className="lector-progress-pages">
                            {meta.totalPages > 0
                              ? `${meta.currentPage} / ${meta.totalPages} páginas`
                              : "Páginas no indicadas"}
                          </span>
                          <span className="lector-progress-divider">·</span>
                          <span className="lector-progress-percent">{meta.progress}% leído</span>
                        </div>
                        <span>{isSavingBookProgress ? "Guardando…" : meta.finished ? "Terminado" : label}</span>
                      </div>

                      <div className="lector-progress-actions">
                        <span className="lector-progress-hint">
                          Arrastra la barra para guardar tu avance.
                        </span>
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
      {completedBook && completedMeta && (
        <div
          className="lector-completion-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lector-completion-title"
        >
          <div className="lector-confetti" aria-hidden="true">
            {COMPLETION_CONFETTI.map((piece) => (
              <span
                key={piece}
                style={{
                  "--x": `${(piece * 17) % 100}%`,
                  "--delay": `${(piece % 9) * 0.12}s`,
                  "--duration": `${2.4 + (piece % 7) * 0.18}s`,
                  "--spin": `${piece % 2 === 0 ? "" : "-"}${240 + piece * 13}deg`,
                }}
              />
            ))}
          </div>

          <article
            className="lector-completion-card"
            style={{
              "--completion-a": completionColors[0],
              "--completion-b": completionColors[1],
              "--completion-c": completionColors[2],
            }}
          >
            <button
              type="button"
              className="lector-completion-close"
              aria-label="Cerrar celebración"
              onClick={() => setCompletedBook(null)}
            >
              ×
            </button>

            <header className="lector-completion-hero">
              <div
                className="lector-completion-glow"
                style={buildBookCoverStyle(completedBook, 0)}
                aria-hidden="true"
              />
              <div
                className="lector-completion-cover"
                style={{
                  ...buildBookCoverStyle(completedBook, 0),
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
                aria-hidden="true"
              >
                {!completedBook.cover ? completedBook.title : null}
              </div>

              <div className="lector-completion-check" aria-hidden="true">
                ✓
              </div>
            </header>

            <div className="lector-completion-body">
              <p className="lector-completion-kicker">Lectura completada</p>
              <h2 id="lector-completion-title">¡Libro terminado!</h2>
              <p>
                Has terminado <strong>{completedBook.title}</strong>
                {completedBook.author ? ` de ${completedBook.author}` : ""}. Un libro más en tu estantería.
              </p>

              <div className="lector-completion-stats" aria-label="Resumen de lectura">
                <span>
                  <strong>{completedMeta.totalPages || completedMeta.currentPage || completedBook.pages || "—"}</strong>
                  páginas
                </span>
                <span>
                  <strong>100%</strong>
                  leído
                </span>
                <span>
                  <strong>{completedBook.read_count || 1}</strong>
                  {Number(completedBook.read_count || 1) === 1 ? "vez leído" : "veces leído"}
                </span>
              </div>

              <div className="lector-completion-actions">
                <button type="button" onClick={() => setCompletedBook(null)}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => {
                    setCompletedBook(null);
                    onReviews();
                  }}
                >
                  Escribir reseña
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
