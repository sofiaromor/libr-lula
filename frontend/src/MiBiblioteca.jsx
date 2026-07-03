import { useEffect, useMemo, useState } from "react";
import {
  getLibraryStatus,
  getMyLibrary,
  LIBRARY_STATUS_LABELS,
  updateLibraryScore,
} from "./lib/library.js";

function coverUrl(cover) {
  const value = String(cover || "").trim();

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `/${value.replace(/^\/+/, "")}`;
}

function clipText(text, maxLength = 130) {
  const value = String(text || "").trim();

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}…`;
}

function starValues(score) {
  const value = Math.max(0, Math.min(5, Number(score) || 0));

  return [1, 2, 3, 4, 5].map((star) => ({
    value: star,
    filled: star <= value,
  }));
}

export default function MiBiblioteca({ onOpenCatalog, onSelectBook }) {
  const [library, setLibrary] = useState({
    profile: null,
    items: [],
    counts: {
      all: 0,
      reading: 0,
      rereading: 0,
      paused: 0,
      completed: 0,
      planned: 0,
      dropped: 0,
    },
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingBookId, setSavingBookId] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLibrary() {
      setLoading(true);
      setMessage(null);

      try {
        const data = await getMyLibrary();

        if (!cancelled) {
          setLibrary(data);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text: error.message || "No se pudo cargar tu biblioteca.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    return library.items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (
        ratingFilter !== "all" &&
        Number(item.score || 0) !== Number(ratingFilter)
      ) {
        return false;
      }

      return true;
    });
  }, [library.items, ratingFilter, statusFilter]);

  async function handleScoreChange(item, score) {
    const bookId = item.book_id;

    if (!library.profile?.legacy_id || !bookId) return;

    setSavingBookId(bookId);
    setMessage(null);

    try {
      await updateLibraryScore({
        legacyUserId: library.profile.legacy_id,
        bookId,
        score,
      });

      setLibrary((current) => ({
        ...current,
        items: current.items.map((currentItem) =>
          currentItem.book_id === bookId
            ? { ...currentItem, score }
            : currentItem,
        ),
      }));

      setMessage({
        type: "success",
        text: "Puntuación guardada.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "No se pudo guardar la puntuación.",
      });
    } finally {
      setSavingBookId("");
    }
  }

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <span className="profile-kicker">Colección personal</span>
          <h1>Mi biblioteca</h1>
          <p>Organiza tus lecturas y vuelve rápidamente a la ficha de cada libro.</p>
        </div>

        <button className="profile-button primary" type="button" onClick={onOpenCatalog}>
          Añadir desde el catálogo
        </button>
      </header>

      <nav className="library-filters" aria-label="Filtrar biblioteca por estado">
        {Object.entries(LIBRARY_STATUS_LABELS).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={statusFilter === key ? "is-active" : ""}
            onClick={() => setStatusFilter(key)}
          >
            {label}
            <span>{library.counts[key] || 0}</span>
          </button>
        ))}
      </nav>

      <section className="library-rating-filter" aria-label="Filtrar por puntuación">
        <span>Filtrar por estrellas</span>
        <div>
          <button
            type="button"
            className={ratingFilter === "all" ? "is-active" : ""}
            onClick={() => setRatingFilter("all")}
          >
            Todas
          </button>

          {[5, 4, 3, 2, 1].map((score) => (
            <button
              type="button"
              key={score}
              className={ratingFilter === String(score) ? "is-active" : ""}
              onClick={() => setRatingFilter(String(score))}
            >
              {"★".repeat(score)}
            </button>
          ))}
        </div>
      </section>

      {message && (
        <p className={`library-message ${message.type === "error" ? "is-error" : "is-success"}`}>
          {message.text}
        </p>
      )}

      {loading && (
        <section className="profile-empty library-empty">
          <span>📚</span>
          <h2>Cargando tu biblioteca…</h2>
          <p>Estamos recuperando tus libros desde Supabase.</p>
        </section>
      )}

      {!loading && filteredItems.length > 0 && (
        <section className="library-grid">
          {filteredItems.map((item) => {
            const book = item.book || {};
            const [statusLabel, statusClass] = getLibraryStatus(item.status);
            const cover = coverUrl(book.cover);

            return (
              <article className="library-card" key={`${item.legacy_user_id}-${item.book_id}`}>
                <button
                  className="library-cover"
                  type="button"
                  onClick={() => onSelectBook?.(book)}
                  aria-label={`Abrir ficha de ${book.title}`}
                >
                  {cover ? (
                    <img src={cover} alt={`Portada de ${book.title}`} loading="lazy" />
                  ) : (
                    <span>📖</span>
                  )}
                </button>

                <div className="library-card-body">
                  <span className={`status-pill ${statusClass}`}>{statusLabel}</span>

                  <h2>{book.title}</h2>
                  <p className="library-author">{book.author}</p>

                  {["reading", "rereading", "paused"].includes(item.status) && (
                    <>
                      <div className="progress-label">
                        <span>Progreso</span>
                        <strong>{Number(item.progress || 0)}%</strong>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${Math.max(0, Math.min(100, Number(item.progress || 0)))}%`,
                          }}
                        />
                      </div>
                    </>
                  )}

                  <div className="library-score" aria-label={`Puntuación de ${book.title}`}>
                    {starValues(item.score).map((star) => (
                      <button
                        type="button"
                        key={star.value}
                        className={star.filled ? "is-filled" : ""}
                        disabled={savingBookId === item.book_id}
                        onClick={() => handleScoreChange(item, star.value)}
                        aria-label={`Puntuar con ${star.value} ${
                          star.value === 1 ? "estrella" : "estrellas"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  {item.notes && (
                    <p className="library-notes">{clipText(item.notes)}</p>
                  )}

                  <button
                    className="panel-link"
                    type="button"
                    onClick={() => onSelectBook?.(book)}
                  >
                    Abrir ficha técnica →
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!loading && filteredItems.length === 0 && (
        <section className="profile-empty library-empty">
          <span>📚</span>
          <h2>No hay libros en esta sección</h2>
          <p>
            {library.items.length === 0
              ? "Explora el catálogo y añade tu primera lectura."
              : "Prueba con otro filtro o cambia el estado de un libro desde su ficha."}
          </p>
          <button className="profile-button primary" type="button" onClick={onOpenCatalog}>
            Explorar catálogo
          </button>
        </section>
      )}
    </main>
  );
}
