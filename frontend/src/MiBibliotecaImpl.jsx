import { useEffect, useMemo, useState } from "react";
import "./MiBiblioteca.css";
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

function handleCoverError(event) {
  const image = event.currentTarget;

  image.onerror = null;
  image.src = "/images/librelula.png";
  image.alt = "Portada no disponible";
  image.classList.add("is-fallback");
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function genreValues(value) {
  return String(value || "")
    .split(/[,;|]/)
    .map((genre) => genre.trim())
    .filter(Boolean);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
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

  const genreOptions = useMemo(() => {
    const genres = library.items.flatMap((item) =>
      genreValues(item.book?.genre),
    );

    return [...new Set(genres)].sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );
  }, [library.items]);

  const yearOptions = useMemo(() => {
    const years = library.items
      .map((item) => Number(item.book?.year))
      .filter((year) => Number.isInteger(year) && year > 0);

    return [...new Set(years)].sort((left, right) => right - left);
  }, [library.items]);

  const filteredItems = useMemo(() => {
    const query = normalizeText(searchQuery);
    const collator = new Intl.Collator("es", { sensitivity: "base" });

    const matches = library.items.filter((item) => {
      const book = item.book || {};
      const score = Number(item.score || 0);

      if (query) {
        const searchable = normalizeText(`${book.title || ""} ${book.author || ""}`);

        if (!searchable.includes(query)) return false;
      }

      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      if (ratingFilter === "unrated" && score !== 0) return false;

      if (
        !["all", "unrated"].includes(ratingFilter) &&
        score !== Number(ratingFilter)
      ) return false;

      if (
        genreFilter !== "all" &&
        !genreValues(book.genre).includes(genreFilter)
      ) return false;

      if (
        yearFilter !== "all" &&
        Number(book.year || 0) !== Number(yearFilter)
      ) return false;

      return true;
    });

    return matches.sort((left, right) => {
      const leftBook = left.book || {};
      const rightBook = right.book || {};

      if (sortOrder === "title") {
        return collator.compare(leftBook.title || "", rightBook.title || "");
      }

      if (sortOrder === "author") {
        return collator.compare(leftBook.author || "", rightBook.author || "");
      }

      if (sortOrder === "rating") {
        return Number(right.score || 0) - Number(left.score || 0);
      }

      if (sortOrder === "year") {
        return Number(rightBook.year || 0) - Number(leftBook.year || 0);
      }

      return Number(right.id || 0) - Number(left.id || 0);
    });
  }, [
    genreFilter,
    library.items,
    ratingFilter,
    searchQuery,
    sortOrder,
    statusFilter,
    yearFilter,
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    ratingFilter !== "all" ||
    genreFilter !== "all" ||
    yearFilter !== "all" ||
    sortOrder !== "recent";

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setRatingFilter("all");
    setGenreFilter("all");
    setYearFilter("all");
    setSortOrder("recent");
  }
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

      <section className="library-layout">
        <aside className="library-sidebar" aria-label="Filtros de Mi biblioteca">
          <label className="library-search">
            <span>Buscar</span>
            <span className="library-search-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.4-3.4" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Título o autor"
              />
            </span>
          </label>

          <div className="library-sidebar-section">
            <span className="library-sidebar-title">Mis listas</span>
            <nav className="library-status-list" aria-label="Filtrar por estado">
              {Object.entries(LIBRARY_STATUS_LABELS).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={statusFilter === key ? "is-active" : ""}
                  onClick={() => setStatusFilter(key)}
                >
                  <span>{label}</span>
                  <small>{library.counts[key] || 0}</small>
                </button>
              ))}
            </nav>
          </div>

          <div className="library-sidebar-section library-select-filters">
            <span className="library-sidebar-title">Filtros</span>

            <label>
              <span>Puntuación</span>
              <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
                <option value="all">Todas las puntuaciones</option>
                {[5, 4, 3, 2, 1].map((score) => (
                  <option key={score} value={String(score)}>
                    {score} {score === 1 ? "estrella" : "estrellas"}
                  </option>
                ))}
                <option value="unrated">Sin puntuar</option>
              </select>
            </label>

            <label>
              <span>Género</span>
              <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                <option value="all">Todos los géneros</option>
                {genreOptions.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Año</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">Todos los años</option>
                {yearOptions.map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Ordenar</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="recent">Añadidos recientemente</option>
                <option value="title">Título, de A a Z</option>
                <option value="author">Autor, de A a Z</option>
                <option value="rating">Mejor puntuados</option>
                <option value="year">Año más reciente</option>
              </select>
            </label>
          </div>

          {hasActiveFilters && (
            <button className="library-clear-filters" type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </aside>

        <div className="library-results">
          <header className="library-results-heading">
            <div>
              <span className="profile-kicker">Tu selección</span>
              <h2>
                {statusFilter === "all"
                  ? "Todos tus libros"
                  : LIBRARY_STATUS_LABELS[statusFilter]}
              </h2>
            </div>
            <p>
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "libro" : "libros"}
            </p>
          </header>
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
                    <img
                      src={cover}
                      alt={`Portada de ${book.title}`}
                      loading="lazy"
                      onError={handleCoverError}
                    />
                  ) : (
                    <img
                      className="is-fallback"
                      src="/images/librelula.png"
                      alt="Portada no disponible"
                    />
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
        </div>
      </section>
    </main>
  );
}


