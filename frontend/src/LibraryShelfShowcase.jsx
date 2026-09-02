import { useEffect, useMemo, useState } from "react";
import "./LibraryShelfShowcase.css";

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

function CoverTile({ item, photoMode, onSelectBook }) {
  const book = item.book || {};

  if (photoMode) {
    return (
      <div className="library-showcase-cover-card is-photo" title={book.title || "Libro"}>
        <img src={coverUrl(book.cover)} alt="" loading="lazy" />
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
      <img src={coverUrl(book.cover)} alt={`Portada de ${book.title || "libro"}`} loading="lazy" />
      <span>
        <strong>{book.title || "Libro sin título"}</strong>
        <small>{book.author || "Autor desconocido"}</small>
      </span>
    </button>
  );
}

function SpineTile({ item, photoMode, onSelectBook }) {
  const book = item.book || {};
  const personalUrl = String(item.personal_spine_url || "").trim();
  const crop = item.personal_spine_crop || { x: 50, y: 50, zoom: 1 };
  const src = personalUrl || coverUrl(book.cover);

  const body = (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        style={personalUrl ? {
          objectPosition: `${crop.x}% ${crop.y}%`,
          transform: `scale(${crop.zoom})`,
        } : undefined}
      />
      <span className="library-showcase-spine-shade" aria-hidden="true" />
      <span className="library-showcase-spine-title">{book.title || "Libro"}</span>
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
    <button
      type="button"
      className={`library-showcase-spine is-variation-${spineVariation(item.book_id)}`}
      onClick={() => onSelectBook?.(book)}
      aria-label={`Abrir ficha de ${book.title || "este libro"}`}
    >
      {body}
    </button>
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

export default function LibraryShelfShowcase({ shelf, items, initialViewMode = "covers", onClose, onSelectBook }) {
  const [mode, setMode] = useState(initialViewMode === "spines" ? "spines" : "covers");
  const [photoMode, setPhotoMode] = useState(false);
  const rowSize = useRowSize(mode);
  const rows = useMemo(() => chunk(items || [], rowSize), [items, rowSize]);

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
      <div className="library-showcase-shell">
        <header className="library-showcase-header">
          <button type="button" className="library-showcase-back" onClick={onClose}>← Biblioteca</button>
          <div className="library-showcase-heading">
            <span className="profile-kicker">Estantería completa</span>
            <h1 id="library-showcase-title">{shelf?.title || "Mis libros"}</h1>
            <p>{shelf?.subtitle || "Todos tus libros, juntos."}</p>
            <small>{items.length} {items.length === 1 ? "libro" : "libros"}</small>
          </div>
          <div className="library-showcase-controls">
            <div className="library-showcase-switcher" role="group" aria-label="Cambiar vista de estantería completa">
              <button type="button" aria-pressed={mode === "covers"} onClick={() => setMode("covers")} aria-label="Ver portadas"><CoverViewIcon /></button>
              <button type="button" aria-pressed={mode === "spines"} onClick={() => setMode("spines")} aria-label="Ver lomos"><SpineViewIcon /></button>
            </div>
            <button type="button" className="library-showcase-photo-button" onClick={() => setPhotoMode(true)}>
              ◫ Modo foto
            </button>
          </div>
        </header>

        <section className={`library-showcase-photo-heading ${photoMode ? "is-visible" : ""}`} aria-hidden={!photoMode}>
          <span>Librélula</span>
          <h1>{shelf?.title || "Mis libros"}</h1>
          <p>{items.length} {items.length === 1 ? "libro" : "libros"}</p>
        </section>

        <div className={`library-showcase-rows is-${mode}`}>
          {rows.map((row, rowIndex) => (
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

        {photoMode ? <span className="library-showcase-photo-exit-hint">Toca la pantalla para volver</span> : null}
      </div>
    </div>
  );
}
