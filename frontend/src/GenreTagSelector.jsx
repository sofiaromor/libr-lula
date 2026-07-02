import { useMemo, useState } from "react";

import { BOOK_GENRE_GROUPS, normalizeBookGenres, normalizedGenreText } from "./bookGenres.js";

const MAX_GENRES = 8;

export default function GenreTagSelector({ value, onChange, idPrefix = "genres" }) {
  const selected = useMemo(() => normalizeBookGenres(value), [value]);
  const [customGenre, setCustomGenre] = useState("");
  const [message, setMessage] = useState("");

  function emit(nextGenres) {
    onChange?.(normalizeBookGenres(nextGenres));
    setMessage("");
  }

  function toggleGenre(genre) {
    const selectedKey = normalizedGenreText(genre);
    const exists = selected.some((item) => normalizedGenreText(item) === selectedKey);

    if (exists) {
      emit(selected.filter((item) => normalizedGenreText(item) !== selectedKey));
      return;
    }

    if (selected.length >= MAX_GENRES) {
      setMessage(`Puedes guardar hasta ${MAX_GENRES} géneros.`);
      return;
    }

    emit([...selected, genre]);
  }

  function addCustomGenre() {
    const cleanGenre = customGenre.trim().replace(/^[,;|]+|[,;|]+$/gu, "");
    if (!cleanGenre) return;

    if (selected.some((item) => normalizedGenreText(item) === normalizedGenreText(cleanGenre))) {
      setMessage("Ese género ya está seleccionado.");
      return;
    }

    if (selected.length >= MAX_GENRES) {
      setMessage(`Puedes guardar hasta ${MAX_GENRES} géneros.`);
      return;
    }

    // normalizeBookGenres solo conserva etiquetas reconocidas. Si no reconoce
    // la escrita, avisamos en vez de mezclar temas o estéticas con géneros.
    const normalized = normalizeBookGenres([cleanGenre]);
    if (!normalized.length) {
      setMessage("No parece un género literario reconocido. Usa Temas o Estética para otras etiquetas.");
      return;
    }

    emit([...selected, ...normalized]);
    setCustomGenre("");
  }

  return (
    <div className="genre-tag-selector">
      <div className="genre-tag-heading">
        <span>Géneros literarios</span>
        <small>{selected.length}/{MAX_GENRES} seleccionados</small>
      </div>

      {selected.length > 0 && (
        <div className="genre-selected-tags" aria-label="Géneros literarios seleccionados">
          {selected.map((genre) => (
            <button
              key={genre}
              type="button"
              className="genre-selected-tag"
              onClick={() => toggleGenre(genre)}
              aria-label={`Quitar ${genre}`}
            >
              {genre}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="genre-option-groups">
        {BOOK_GENRE_GROUPS.map((group) => (
          <section className="genre-option-group" key={group.key}>
            <small>{group.label}</small>
            <div className="genre-tag-options" aria-label={group.label}>
              {group.genres.map((genre) => {
                const active = selected.some(
                  (item) => normalizedGenreText(item) === normalizedGenreText(genre),
                );

                return (
                  <button
                    key={genre}
                    type="button"
                    className={`genre-tag-option${active ? " is-selected" : ""}`}
                    onClick={() => toggleGenre(genre)}
                    aria-pressed={active}
                  >
                    {active && <span aria-hidden="true">✓</span>}
                    {genre}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="genre-custom-row">
        <label htmlFor={`${idPrefix}-custom`}>Buscar un género</label>
        <div>
          <input
            id={`${idPrefix}-custom`}
            type="text"
            value={customGenre}
            onChange={(event) => {
              setCustomGenre(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addCustomGenre();
              }
            }}
            maxLength={60}
            placeholder="Ej.: romantasy, space opera…"
          />
          <button type="button" onClick={addCustomGenre} disabled={!customGenre.trim()}>
            + Añadir
          </button>
        </div>
      </div>

      <small className="genre-tag-help">
        Solo géneros literarios. La edad del público, los temas, las sensaciones y la estética se guardan aparte.
      </small>
      {message && <small className="genre-tag-message" role="status">{message}</small>}
    </div>
  );
}
