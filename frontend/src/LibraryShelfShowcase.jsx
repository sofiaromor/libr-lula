import { useEffect, useMemo, useState } from "react";
import "./LibraryShelfShowcase.css";
import "./LibraryShelfActions.css";
import { shouldShowSpineTitle } from "./lib/librarySpineMedia.js";
import {
  filterShelfItems,
  formatShelfScore,
  groupShelfItemsByScore,
  normalizeShelfScore,
} from "./lib/libraryShelfSearch.js";

function coverUrl(cover) {
  const value = String(cover || "").trim();
  if (!value) return "/images/librelula.png";
  if (/^https?:\/\//i.test(value)) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

function spineVariation(value) {
  return [...String(value || "")].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % 5;
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function useRowSize(mode) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (mode === "spines") {
    if (width <= 420) return 10;
    if (width <= 650) return 12;
    if (width <= 950) return 15;
    return 20;
  }

  if (width <= 420) return 3;
  if (width <= 650) return 4;
  if (width <= 950) return 5;
  return 7;
}

function PhotoScoreRail({ score, horizontal = false }) {
  const normalizedScore = normalizeShelfScore(score);
  const scoreLabel = formatShelfScore(score);

  return (
    <span
      className={`library-showcase-photo-score ${horizontal ? "is-horizontal" : ""}`}
      aria-label={`Tu puntuación: ${scoreLabel}`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, normalizedScore - (star - 1)));
        const fillClass = fill === 1 ? "is-filled" : fill === 0.5 ? "is-half" : "";
        return <span className={fillClass} key={star} aria-hidden="true">★</span>;
      })}
    </span>
  );
}

function CoverTile({ item, photoMode, onSelectBook }) {
  const book = item.book || {};
  const scoreLabel = formatShelfScore(item.score);

  if (photoMode) {
    return (
      <div className="library-showcase-cover-card is-photo" title={book.title || "Libro"}>
        <img
          src={coverUrl(book.cover)}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/images/librelula.png";
          }}
        />
        <PhotoScoreRail score={item.score} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="library-showcase-cover-card"
      onClick={() => onSelectBook?.(book)}
      aria-label={`Abrir ficha de ${book.title || "este libro"}`}
    >
      <img
        src={coverUrl(book.cover)}
        alt={`Portada de ${book.title || "libro"}`}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = "/images/librelula.png";
        }}
      />
      <span>
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
        <small className="library-showcase-score" aria-label={`Tu puntuación: ${scoreLabel}`}>
          {scoreLabel === "Sin puntuar" ? scoreLabel : `★ ${scoreLabel}`}
        </small>
      </span>
    </button>
  );
}

function SpineTile({ item, photoMode, onSelectBook }) {
  const book = item.book || {};
  const personalUrl = String(item.personal_spine_url || "").trim();
  const crop = item.personal_spine_crop || { x: 50, y: 50, zoom: 1 };
  const src = personalUrl || coverUrl(book.cover);
  const showTitle = shouldShowSpineTitle({
    hasPersonalSpine: Boolean(personalUrl),
    showText: item.personal_spine_show_text,
  });
  const score = normalizeShelfScore(item.score);
  const scoreLabel = formatShelfScore(item.score);

  const body = (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = "/images/librelula.png";
        }}
        style={personalUrl ? {
          objectPosition: `${crop.x}% ${crop.y}%`,
          transform: `scale(${crop.zoom})`,
        } : undefined}
      />
      <span className="library-showcase-spine-shade" aria-hidden="true" />
      {showTitle ? <span className="library-showcase-spine-title">{book.title || "Libro"}</span> : null}
    </>
  );

  if (photoMode) {
    return (
      <div
        className={`library-showcase-spine is-variation-${spineVariation(item.book_id)}`}
        title={book.title || "Libro"}
      >
        {body}
      </div>
    );
  }

  return (
    <div className="library-showcase-spine-entry">
      <button
        type="button"
        className={`library-showcase-spine is-variation-${spineVariation(item.book_id)}`}
        onClick={() => onSelectBook?.(book)}
        aria-label={`Abrir ficha de ${book.title || "este libro"}`}
      >
        {body}
      </button>
      <span className="library-showcase-spine-score" aria-label={`Tu puntuación: ${scoreLabel}`}>
        {score ? `★${score}` : "—"}
      </span>
    </div>
  );
}

function CoverViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="6" height="7" rx="1" />
      <rect x="14" y="4" width="6" height="7" rx="1" />
      <rect x="4" y="13" width="6" height="7" rx="1" />
      <rect x="14" y="13" width="6" height="7" rx="1" />
    </svg>
  );
}

function SpineViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="3" height="16" rx="1" />
      <rect x="9" y="3" width="4" height="17" rx="1" />
      <rect x="15" y="5" width="5" height="15" rx="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

export default function LibraryShelfShowcase({ shelf, items, initialViewMode = "covers", onClose, onSelectBook }) {
  const [mode, setMode] = useState(initialViewMode === "spines" ? "spines" : "covers");
  const [photoMode, setPhotoMode] = useState(false);
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const rowSize = useRowSize(mode);
  const visibleItems = useMemo(
    () => filterShelfItems(items, { query, score: scoreFilter }),
    [items, query, scoreFilter],
  );
  const rows = useMemo(() => chunk(visibleItems, rowSize), [rowSize, visibleItems]);
  const photoCoverGroups = useMemo(
    () => groupShelfItemsByScore(visibleItems).map((group) => ({
      ...group,
      rows: chunk(group.items, rowSize),
    })),
    [rowSize, visibleItems],
  );
  const totalItems = Array.isArray(items) ? items.length : 0;
  const hasFilters = query.trim() !== "" || scoreFilter !== "all";

  function clearSearch() {
    setQuery("");
    setScoreFilter("all");
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (photoMode) setPhotoMode(false);
      else onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, photoMode]);

  return (
    <div
      className={`library-showcase ${photoMode ? "is-photo-mode" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-showcase-title"
      onClick={photoMode ? () => setPhotoMode(false) : undefined}
    >
      {photoMode ? (
        <button
          type="button"
          className="library-showcase-photo-back"
          onClick={(event) => {
            event.stopPropagation();
            setPhotoMode(false);
          }}
        >
          ← Volver
        </button>
      ) : null}
      <div className="library-showcase-shell">
        <header className="library-showcase-header">
          <button type="button" className="library-showcase-back" onClick={onClose}>← Biblioteca</button>
          <div className="library-showcase-heading">
            <span className="profile-kicker">Estantería completa</span>
            <h1 id="library-showcase-title">{shelf?.title || "Mis libros"}</h1>
            <p>{shelf?.subtitle || "Todos tus libros, juntos."}</p>
            <small>
              {hasFilters ? `${visibleItems.length} de ${totalItems}` : totalItems} {totalItems === 1 ? "libro" : "libros"}
            </small>
          </div>
          <div className="library-showcase-controls">
            <div className="library-showcase-switcher" role="group" aria-label="Cambiar vista de estantería completa">
              <button type="button" aria-pressed={mode === "covers"} onClick={() => setMode("covers")} aria-label="Ver portadas"><CoverViewIcon /></button>
              <button type="button" aria-pressed={mode === "spines"} onClick={() => setMode("spines")} aria-label="Ver lomos"><SpineViewIcon /></button>
            </div>
            <button
              type="button"
              className="library-showcase-photo-button"
              onClick={() => setPhotoMode(true)}
              title="Oculta los controles; toca cualquier punto para volver"
            >
              ◫ Modo foto
            </button>
          </div>
        </header>

        <section className={`library-showcase-photo-heading ${photoMode ? "is-visible" : ""}`} aria-hidden={!photoMode}>
          <span>Librélula</span>
          <h1>{shelf?.title || "Mis libros"}</h1>
          <p>{visibleItems.length} {visibleItems.length === 1 ? "libro" : "libros"}</p>
        </section>

        <section className="library-showcase-tools" aria-label="Buscar y filtrar esta estantería">
          <label className="library-showcase-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar título o autor"
              aria-label="Buscar título o autor en esta estantería"
            />
          </label>
          <label className="library-showcase-score-filter">
            <span>Puntuación</span>
            <select
              value={scoreFilter}
              onChange={(event) => setScoreFilter(event.target.value)}
              aria-label="Filtrar por puntuación"
            >
              <option value="all">Todas</option>
              <option value="5">5 estrellas</option>
              <option value="4">4 estrellas</option>
              <option value="3">3 estrellas</option>
              <option value="2">2 estrellas</option>
              <option value="1">1 estrella</option>
              <option value="unrated">Sin puntuar</option>
            </select>
          </label>
          <span className="library-showcase-result-count" aria-live="polite">
            {visibleItems.length} {visibleItems.length === 1 ? "resultado" : "resultados"}
          </span>
          {hasFilters ? (
            <button type="button" className="library-showcase-clear" onClick={clearSearch}>Limpiar</button>
          ) : null}
        </section>

        {visibleItems.length === 0 ? (
          <section className="library-showcase-empty">
            <h2>No encontramos ese libro</h2>
            <p>Prueba con otro título, autor o puntuación.</p>
            <button type="button" onClick={clearSearch}>Limpiar búsqueda</button>
          </section>
        ) : null}

        <div className={`library-showcase-rows is-${mode}`}>
          {photoMode && mode === "covers" ? photoCoverGroups.map((group) => (
            <section className="library-showcase-rating-group" key={group.score} aria-label={group.label}>
              <header className="library-showcase-rating-divider">
                <PhotoScoreRail score={group.score} horizontal />
                <strong>{group.label}</strong>
                <small>{group.items.length} {group.items.length === 1 ? "libro" : "libros"}</small>
              </header>
              {group.rows.map((row, rowIndex) => (
                <div className="library-showcase-row is-covers" key={`${shelf?.id || "shelf"}-${group.score}-${rowIndex}`}>
                  <div className="library-showcase-books">
                    {row.map((item) => (
                      <CoverTile
                        key={`${group.score}-${rowIndex}-${item.book_id}`}
                        item={item}
                        photoMode
                        onSelectBook={onSelectBook}
                      />
                    ))}
                  </div>
                  <div className="library-showcase-wood" aria-hidden="true" />
                </div>
              ))}
            </section>
          )) : rows.map((row, rowIndex) => (
            <div className={`library-showcase-row is-${mode}`} key={`${shelf?.id || "shelf"}-${rowIndex}`}>
              <div className="library-showcase-books">
                {row.map((item) => mode === "covers" ? (
                  <CoverTile
                    key={`${rowIndex}-${item.book_id}`}
                    item={item}
                    photoMode={photoMode}
                    onSelectBook={onSelectBook}
                  />
                ) : (
                  <SpineTile
                    key={`${rowIndex}-${item.book_id}`}
                    item={item}
                    photoMode={photoMode}
                    onSelectBook={onSelectBook}
                  />
                ))}
              </div>
              <div className="library-showcase-wood" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
