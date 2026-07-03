import { useEffect, useMemo, useState } from "react";
import { publicUrl } from "./api.js";
import { getProfileOverview } from "./lib/profileApi.js";
import "./PerfilSupabase.css";

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function assetUrl(path, fallback = "images/librelula.png") {
  const clean = String(path || "").trim();

  if (!clean || clean === "default.jpg") {
    return publicUrl(fallback);
  }

  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }

  return publicUrl(clean);
}

function EmptyBlock({ children }) {
  return <p className="profile-empty">{children}</p>;
}

function ProfileBookCard({ book }) {
  if (!book) return null;

  return (
    <article className="profile-book-card">
      <div className="profile-book-cover">
        <img
          src={assetUrl(book.cover)}
          alt={`Portada de ${book.title || "libro"}`}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.src = publicUrl("images/librelula.png");
          }}
        />
      </div>

      <div className="profile-book-copy">
        <h4>{book.title || "Libro sin título"}</h4>
        <p>{book.author || "Autor desconocido"}</p>

        {book.progress > 0 && (
          <div className="profile-progress">
            <span style={{ width: `${Math.min(100, Math.max(0, book.progress))}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

export default function PerfilSupabase({ onOpenLibrary, onOpenCatalog }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await getProfileOverview();

        if (!cancelled) {
          setState({ loading: false, error: "", data });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message || "No se pudo cargar tu perfil.",
            data: null,
          });
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.data;
  const profile = data?.profile;

  const visibleActivityDays = useMemo(() => {
    return (data?.activityDays || []).slice(-126);
  }, [data?.activityDays]);

  if (state.loading) {
    return (
      <main className="reader-profile">
        <section className="profile-shell">
          <div className="profile-loading-card">
            <span className="profile-loader" />
            <p>Cargando tu rincón literario…</p>
          </div>
        </section>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="reader-profile">
        <section className="profile-shell">
          <div className="profile-error-card">
            <h1>No se pudo abrir Mi rincón</h1>
            <p>{state.error}</p>
            <button type="button" onClick={onOpenCatalog}>
              Volver al catálogo
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!data?.authenticated || !profile) {
    return (
      <main className="reader-profile">
        <section className="profile-shell">
          <div className="profile-error-card">
            <h1>Inicia sesión para ver tu rincón</h1>
            <p>Tu perfil lector se carga con tu cuenta de Librélula.</p>
            <button type="button" onClick={onOpenCatalog}>
              Volver al catálogo
            </button>
          </div>
        </section>
      </main>
    );
  }

  const avatarUrl = assetUrl(profile.avatar, "images/avatar/avatar1.png");

  return (
    <main className="reader-profile">
      <section className="profile-shell">
        <header className="profile-banner">
          <div className="profile-banner-glow" />

          <div className="profile-heading">
            <div className="profile-avatar-large">
              <img
                src={avatarUrl}
                alt={`Avatar de ${profile.username}`}
                onError={(event) => {
                  event.currentTarget.src = publicUrl("images/avatar/avatar1.png");
                }}
              />
            </div>

            <div className="profile-title-block">
              <span className="profile-kicker">Mi rincón</span>
              <h1>{profile.username}</h1>
              <p>{profile.bio || "Lecturas, favoritos y pequeñas huellas de tu biblioteca personal."}</p>
            </div>

            <div className="profile-actions">
              <button type="button" onClick={onOpenLibrary}>
                Ver mi biblioteca
              </button>
              <button type="button" className="ghost" onClick={onOpenCatalog}>
                Explorar catálogo
              </button>
            </div>
          </div>
        </header>

        <nav className="profile-tabs" aria-label="Secciones del perfil">
          <span className="active">Resumen</span>
          <span>Actividad</span>
          <span>Favoritos</span>
        </nav>

        <section className="profile-stats-grid" aria-label="Estadísticas de lectura">
          <article>
            <span>{formatNumber(data.stats.completed)}</span>
            <p>Libros leídos</p>
          </article>
          <article>
            <span>{formatNumber(data.stats.favorites)}</span>
            <p>Favoritos 5★</p>
          </article>
          <article>
            <span>{formatNumber(data.stats.pages_read)}</span>
            <p>Páginas leídas</p>
          </article>
          <article>
            <span>{formatNumber(data.streak)}</span>
            <p>Racha actual</p>
          </article>
        </section>

        <section className="profile-grid">
          <div className="profile-column-main">
            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Ahora</span>
                  <h2>Leyendo actualmente</h2>
                </div>
              </div>

              {data.currentReadingBooks.length > 0 ? (
                <div className="profile-current-list">
                  {data.currentReadingBooks.map((book) => (
                    <ProfileBookCard key={book.id} book={book} />
                  ))}
                </div>
              ) : (
                <EmptyBlock>No tienes ningún libro marcado como leyendo ahora mismo.</EmptyBlock>
              )}
            </article>

            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Últimos movimientos</span>
                  <h2>Actividad reciente</h2>
                </div>
              </div>

              {data.recentActivity.length > 0 ? (
                <div className="profile-activity-list">
                  {data.recentActivity.map((item) => (
                    <article className="profile-activity-item" key={`${item.book_id}-${item.status}-${item.date}`}>
                      <img
                        src={assetUrl(item.cover)}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = publicUrl("images/librelula.png");
                        }}
                      />
                      <div>
                        <strong>{item.action} {item.title}</strong>
                        <p>{item.author || "Autor desconocido"} · {formatDate(item.date)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBlock>Aún no hay actividad reciente para mostrar.</EmptyBlock>
              )}
            </article>
          </div>

          <aside className="profile-column-side">
            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Mapa lector</span>
                  <h2>Actividad</h2>
                </div>
              </div>

              <div className="profile-heatmap" aria-label="Actividad lectora de los últimos meses">
                {visibleActivityDays.map((day) => (
                  <span
                    key={day.date}
                    className={`level-${day.level}`}
                    title={`${day.label}: ${day.points} movimientos`}
                  />
                ))}
              </div>
            </article>

            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Géneros</span>
                  <h2>Más leídos</h2>
                </div>
              </div>

              {data.favoriteGenres.length > 0 ? (
                <div className="profile-tags">
                  {data.favoriteGenres.map((genre) => (
                    <span key={genre.name}>
                      {genre.name} <small>{genre.count}</small>
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyBlock>Todavía no hay géneros destacados.</EmptyBlock>
              )}
            </article>

            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Favoritos</span>
                  <h2>Libros</h2>
                </div>
              </div>

              {data.favoriteBooks.length > 0 ? (
                <div className="profile-mini-books">
                  {data.favoriteBooks.map((book) => (
                    <img
                      key={book.id}
                      src={assetUrl(book.cover)}
                      alt={book.title || "Libro favorito"}
                      title={book.title || "Libro favorito"}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src = publicUrl("images/librelula.png");
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyBlock>Aún no has elegido libros favoritos.</EmptyBlock>
              )}
            </article>

            <article className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <span className="profile-eyebrow">Favoritos</span>
                  <h2>Autores</h2>
                </div>
              </div>

              {data.favoriteAuthors.length > 0 ? (
                <div className="profile-author-list">
                  {data.favoriteAuthors.map((author) => (
                    <span key={author}>{author}</span>
                  ))}
                </div>
              ) : (
                <EmptyBlock>Aún no has elegido autores favoritos.</EmptyBlock>
              )}
            </article>
          </aside>
        </section>
      </section>
    </main>
  );
}