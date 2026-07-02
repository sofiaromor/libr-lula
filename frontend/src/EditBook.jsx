import { useEffect, useRef, useState } from "react";

import { apiFetch, publicUrl } from "./api.js";
import GenreTagSelector from "./GenreTagSelector.jsx";
import TaxonomyTagSelector from "./TaxonomyTagSelector.jsx";
import { normalizeBookGenres, serializeBookGenres } from "./bookGenres.js";
import { BOOK_AESTHETICS, BOOK_AUDIENCES, BOOK_THEMES, parseTaxonomyItems, serializeTaxonomyItems } from "./bookTaxonomy.js";
import {
  extractHeroColorFromFile,
  FALLBACK_HERO_COLOR,
  normalizeHeroColor,
} from "./heroColor.js";

function textValue(value) {
  if (value === null || value === undefined || value === "[]") {
    return "";
  }

  return String(value);
}

function genreValue(value) {
  return normalizeBookGenres(value);
}

function removeSagaSuffix(title) {
  return textValue(title)
    .replace(
      /\s*\([^()]+,\s*#\s*\d+(?:[.,]\d+)?\)\s*$/u,
      ""
    )
    .trim();
}

function titleWithSaga(title, sagaName, sagaNumber) {
  const baseTitle = removeSagaSuffix(title);
  const name = textValue(sagaName).trim();
  const number = textValue(sagaNumber)
    .trim()
    .replace(",", ".");

  if (!name || !number) {
    return baseTitle;
  }

  return `${baseTitle} (${name}, #${number})`;
}

function sagaFromTitle(value) {
  const match = String(value || "")
    .trim()
    .match(
      /\(([^()]+?)\s*,\s*#\s*(\d+(?:[.,]\d+)?)\)\s*$/u
    );

  if (!match) {
    return null;
  }

  return {
    name: match[1].trim(),
    number: match[2].replace(",", "."),
  };
}
function initialForm(book) {
  const detectedSaga = sagaFromTitle(book?.title);

  return {
    title: textValue(book?.title),
    author: textValue(book?.author),
    language: textValue(book?.language) || "es",
    synopsis: textValue(book?.synopsis),
    genre: genreValue(book?.genre),
    themes: parseTaxonomyItems(book?.themes),
    audiences: parseTaxonomyItems(book?.audiences),
    aesthetics: parseTaxonomyItems(book?.aesthetics),
    saga_name:
      textValue(book?.saga_name) ||
      detectedSaga?.name ||
      "",
    saga_number:
      textValue(book?.saga_number) ||
      detectedSaga?.number ||
      "",
    year: textValue(book?.year),
    pages: textValue(book?.pages),
    publisher: textValue(book?.publisher),
    isbn: textValue(book?.isbn),
  };
}

export default function EditBook({ book, onCancel, onSaved }) {
  const [form, setForm] = useState(() => initialForm(book));

  const [cover, setCover] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [epubFile, setEpubFile] = useState(null);

  const [removeCover, setRemoveCover] = useState(false);
  const [removePdf, setRemovePdf] = useState(false);
  const [removeEpub, setRemoveEpub] = useState(false);

  const [coverPreview, setCoverPreview] = useState("");
  const [heroColor, setHeroColor] = useState(() =>
    normalizeHeroColor(book?.hero_color || book?.heroColor),
  );
  const [heroColorStatus, setHeroColorStatus] = useState("");
  const heroColorPromise = useRef(Promise.resolve(heroColor));
  const coverAnalysisId = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    return () => {
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  function updateTitleField(event) {
    const value = event.target.value;
    const detectedSaga = sagaFromTitle(value);

    setForm((currentForm) => ({
      ...currentForm,
      title: value,
      ...(detectedSaga
        ? {
            saga_name: detectedSaga.name,
            saga_number: detectedSaga.number,
          }
        : {}),
    }));

    setError("");
  }
  function updateSagaField(event) {
    const { name, value } = event.target;

    setForm((currentForm) => {
      const updatedForm = {
        ...currentForm,
        [name]: value,
      };

      return {
        ...updatedForm,
        title: titleWithSaga(
          currentForm.title,
          updatedForm.saga_name,
          updatedForm.saga_number
        ),
      };
    });

    setError("");
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    setError("");
  }

  function handleCoverChange(event) {
    const file = event.target.files?.[0] || null;
    const analysisId = coverAnalysisId.current + 1;
    coverAnalysisId.current = analysisId;

    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
    }

    setCover(file);
    setCoverPreview(file ? URL.createObjectURL(file) : "");

    if (file) {
      setRemoveCover(false);
      setHeroColorStatus("Analizando el color de la portada…");

      const extraction = extractHeroColorFromFile(file).then((color) => {
        if (coverAnalysisId.current === analysisId) {
          setHeroColor(color);
          setHeroColorStatus(
            color === FALLBACK_HERO_COLOR
              ? "Se usará el color neutro de reserva."
              : `Color del panel: ${color}`,
          );
        }

        return color;
      });

      heroColorPromise.current = extraction;
    } else {
      const existingColor = normalizeHeroColor(
        book?.hero_color || book?.heroColor,
      );
      setHeroColor(existingColor);
      setHeroColorStatus("");
      heroColorPromise.current = Promise.resolve(existingColor);
    }

    setError("");
  }

  function handlePdfChange(event) {
    const file = event.target.files?.[0] || null;

    setPdfFile(file);

    if (file) {
      setRemovePdf(false);
    }

    setError("");
  }

  function handleEpubChange(event) {
    const file = event.target.files?.[0] || null;

    setEpubFile(file);

    if (file) {
      setRemoveEpub(false);
    }

    setError("");
  }

  function validateFiles() {
    const maximumCoverSize = 5 * 1024 * 1024;
    const maximumBookFileSize = 50 * 1024 * 1024;

    if (cover && cover.size > maximumCoverSize) {
      return "La portada no puede superar los 5 MB.";
    }

    if (pdfFile && pdfFile.size > maximumBookFileSize) {
      return "El PDF no puede superar los 50 MB.";
    }

    if (epubFile && epubFile.size > maximumBookFileSize) {
      return "El EPUB no puede superar los 50 MB.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    if (!book?.id) {
      setError("No se ha encontrado el identificador del libro.");
      return;
    }

    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    if (!form.author.trim()) {
      setError("El autor es obligatorio.");
      return;
    }

    if (!form.language.trim()) {
      setError("El idioma es obligatorio.");
      return;
    }

    const fileError = validateFiles();

    if (fileError) {
      setError(fileError);
      return;
    }

    const resolvedHeroColor = removeCover
      ? FALLBACK_HERO_COLOR
      : await heroColorPromise.current;
    const formData = new FormData();

    formData.append("id", book.id);
    formData.append("title", form.title.trim());
    formData.append("author", form.author.trim());
    formData.append("language", form.language.trim());

    formData.append("synopsis", form.synopsis.trim());
    formData.append("genre", serializeBookGenres(form.genre));
    formData.append("themes", serializeTaxonomyItems(form.themes));
    formData.append("audiences", serializeTaxonomyItems(form.audiences));
    formData.append("aesthetics", serializeTaxonomyItems(form.aesthetics));
    formData.append("saga_name", form.saga_name.trim());
    formData.append("saga_number", form.saga_number);
    formData.append("year", form.year);
    formData.append("pages", form.pages);
    formData.append("publisher", form.publisher.trim());
    formData.append("isbn", form.isbn.trim());

    formData.append("remove_cover", removeCover ? "1" : "0");
    formData.append("remove_pdf", removePdf ? "1" : "0");
    formData.append("remove_epub", removeEpub ? "1" : "0");
    formData.append("hero_color", resolvedHeroColor || heroColor);

    if (cover) {
      formData.append("cover", cover);
    }

    if (pdfFile) {
      formData.append("pdf_file", pdfFile);
    }

    if (epubFile) {
      formData.append("epub_file", epubFile);
    }

    setSubmitting(true);

    try {
      const response = await apiFetch("update_book.php", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();

      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("La API no devolvió un JSON válido.");
      }

      if (!response.ok || data.error) {
        throw new Error(
          data.error || "No se pudo actualizar el libro."
        );
      }

      onSaved(data.book);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!book) {
    return (
      <main className="book-editor-page">
        <section className="catalog-message is-error">
          <p>No se ha seleccionado ningún libro.</p>
          <button type="button" onClick={onCancel}>
            Volver
          </button>
        </section>
      </main>
    );
  }

  const knownLanguages = ["es", "en", "ca", "fr", "de", "it", "pt"];
  const currentCover = !removeCover && book.cover ? publicUrl(book.cover) : "";
  const displayedCover = coverPreview || currentCover;

  return (
    <main className="goodreads-import-page book-editor-page">
      <div className="create-book-heading">
        <div>
          <span className="external-search-kicker">Administración</span>
          <h1>Editar libro</h1>
          <p>
            Actualiza la portada, la ficha técnica y los archivos sin perder la
            información que ya existe.
          </p>
        </div>
        <button
          type="button"
          className="create-book-back"
          onClick={onCancel}
          disabled={submitting}
        >
          ← Volver a la ficha
        </button>
      </div>

      <form className="goodreads-import-form book-editor-form" onSubmit={handleSubmit}>
        <section className="goodreads-step book-editor-step">
          <div className="goodreads-step-number">1</div>
          <div className="goodreads-step-content">
            <h2>Portada y apariencia</h2>
            <p>
              Conserva la portada actual o selecciona una nueva. Librélula volverá
              a calcular automáticamente el color de la cabecera.
            </p>

            <div className="book-editor-cover-layout">
              <div className={`book-editor-cover-frame${displayedCover ? " has-cover" : ""}`}>
                {displayedCover ? (
                  <img src={displayedCover} alt={`Portada de ${form.title}`} />
                ) : (
                  <div className="book-editor-cover-empty">
                    <strong>Sin portada</strong>
                    <span>Selecciona una imagen para la ficha.</span>
                  </div>
                )}
              </div>

              <div className="book-editor-cover-controls">
                <label className="goodreads-file-label">
                  {book.cover ? "Cambiar portada" : "Seleccionar portada"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCoverChange}
                  />
                </label>

                {cover && (
                  <p className="book-editor-selected-file" role="status">
                    Nueva imagen: <strong>{cover.name}</strong>
                  </p>
                )}

                <small>
                  JPG, PNG o WebP. Máximo 5 MB. Si no eliges otra imagen, se
                  conservará la actual.
                </small>

                {heroColorStatus && (
                  <p className="book-editor-inline-status" role="status">
                    {heroColorStatus}
                  </p>
                )}

                {book.cover && (
                  <label className="book-editor-checkbox">
                    <input
                      type="checkbox"
                      checked={removeCover}
                      onChange={(event) => {
                        const shouldRemove = event.target.checked;
                        setRemoveCover(shouldRemove);

                        if (shouldRemove) {
                          coverAnalysisId.current += 1;
                          setCover(null);

                          if (coverPreview) {
                            URL.revokeObjectURL(coverPreview);
                          }

                          setCoverPreview("");
                          setHeroColor(FALLBACK_HERO_COLOR);
                          setHeroColorStatus(
                            "Sin portada se usará el color neutro de reserva.",
                          );
                          heroColorPromise.current = Promise.resolve(
                            FALLBACK_HERO_COLOR,
                          );
                        } else {
                          const existingColor = normalizeHeroColor(
                            book?.hero_color || book?.heroColor,
                          );
                          setHeroColor(existingColor);
                          setHeroColorStatus("");
                          heroColorPromise.current = Promise.resolve(existingColor);
                        }
                      }}
                    />
                    <span>
                      <strong>Eliminar la portada actual</strong>
                      <small>La ficha mostrará el fondo neutro de Librélula.</small>
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="goodreads-step book-editor-step">
          <div className="goodreads-step-number">2</div>
          <div className="goodreads-step-content">
            <h2>Completa y revisa la ficha técnica</h2>
            <p>
              Estos datos se mostrarán en la cabecera, la sinopsis y las etiquetas
              técnicas de la ficha del libro.
            </p>

            <div className="goodreads-fields-grid book-editor-fields-grid">
              <label className="is-wide">
                Título *
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={updateTitleField}
                  required
                  maxLength={250}
                />
              </label>

              <label>
                Autor *
                <input
                  type="text"
                  name="author"
                  value={form.author}
                  onChange={updateField}
                  required
                  maxLength={250}
                />
              </label>

              <label>
                Idioma *
                <select
                  name="language"
                  value={form.language}
                  onChange={updateField}
                  required
                >
                  {!knownLanguages.includes(form.language) && (
                    <option value={form.language}>{form.language}</option>
                  )}
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                  <option value="ca">Catalán</option>
                  <option value="fr">Francés</option>
                  <option value="de">Alemán</option>
                  <option value="it">Italiano</option>
                  <option value="pt">Portugués</option>
                </select>
              </label>

              <label className="is-wide">
                Sinopsis
                <textarea
                  name="synopsis"
                  value={form.synopsis}
                  onChange={updateField}
                  maxLength={5000}
                  rows={8}
                  placeholder="Escribe o corrige la sinopsis del libro…"
                />
              </label>

              <div className="is-wide book-editor-genres">
                <GenreTagSelector
                  value={form.genre}
                  onChange={(genres) => {
                    setForm((currentForm) => ({ ...currentForm, genre: genres }));
                    setError("");
                  }}
                  idPrefix="edit-book-genres"
                />
              </div>

              <div className="is-wide book-editor-genres">
                <TaxonomyTagSelector
                  value={form.themes}
                  onChange={(themes) => {
                    setForm((currentForm) => ({ ...currentForm, themes }));
                    setError("");
                  }}
                  options={BOOK_THEMES}
                  label="Temas y representación"
                  help="De qué trata el libro. No se mezcla con el género ni con las sensaciones de las reseñas."
                  customPlaceholder="Ej.: rivalidad, maternidad…"
                  idPrefix="edit-book-themes"
                  maximum={10}
                />
              </div>

              <div className="is-wide book-editor-genres">
                <TaxonomyTagSelector
                  value={form.audiences}
                  onChange={(audiences) => {
                    setForm((currentForm) => ({ ...currentForm, audiences }));
                    setError("");
                  }}
                  options={BOOK_AUDIENCES}
                  label="Público"
                  help="Categoría de edad o etapa lectora; no es un género literario."
                  customLabel="Otra categoría"
                  customPlaceholder="Ej.: crossover…"
                  idPrefix="edit-book-audiences"
                  maximum={3}
                />
              </div>

              <div className="is-wide book-editor-genres">
                <TaxonomyTagSelector
                  value={form.aesthetics}
                  onChange={(aesthetics) => {
                    setForm((currentForm) => ({ ...currentForm, aesthetics }));
                    setError("");
                  }}
                  options={BOOK_AESTHETICS}
                  label="Estética"
                  help="Imaginario visual o cultural: gótico, cozy, dark academia…"
                  customPlaceholder="Ej.: folklore, academia luminosa…"
                  idPrefix="edit-book-aesthetics"
                  maximum={6}
                />
              </div>

              <label>
                Saga
                <input
                  type="text"
                  name="saga_name"
                  value={form.saga_name}
                  onChange={updateSagaField}
                  maxLength={250}
                  placeholder="Por ejemplo: Empíreo"
                />
                <small>Usa el mismo nombre en todos los tomos.</small>
              </label>

              <label>
                Número en la saga
                <input
                  type="number"
                  name="saga_number"
                  value={form.saga_number}
                  onChange={updateSagaField}
                  min="0"
                  step="any"
                  placeholder="1, 2, 3, 0.5…"
                />
                <small>Admite decimales para precuelas o relatos.</small>
              </label>

              <label>
                Año de publicación
                <input
                  type="number"
                  name="year"
                  value={form.year}
                  onChange={updateField}
                  min="1"
                  max={new Date().getFullYear() + 1}
                />
              </label>

              <label>
                Número de páginas
                <input
                  type="number"
                  name="pages"
                  value={form.pages}
                  onChange={updateField}
                  min="1"
                />
              </label>

              <label>
                Editorial
                <input
                  type="text"
                  name="publisher"
                  value={form.publisher}
                  onChange={updateField}
                  maxLength={250}
                />
              </label>

              <label>
                ISBN
                <input
                  type="text"
                  name="isbn"
                  value={form.isbn}
                  onChange={updateField}
                  maxLength={30}
                  placeholder="978…"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="goodreads-step book-editor-step">
          <div className="goodreads-step-number">3</div>
          <div className="goodreads-step-content">
            <h2>Archivos del libro</h2>
            <p>
              Puedes sustituir, conservar o eliminar el PDF y el EPUB de forma
              independiente.
            </p>

            <div className="book-editor-files-grid">
              <article className="book-editor-file-card">
                <div className="book-editor-file-heading">
                  <span className="book-editor-file-icon" aria-hidden="true">PDF</span>
                  <div>
                    <strong>Archivo PDF</strong>
                    <small>Máximo 50 MB</small>
                  </div>
                </div>

                {book.pdf_file && !removePdf ? (
                  <a
                    className="book-editor-current-file"
                    href={publicUrl(book.pdf_file)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir PDF actual
                  </a>
                ) : (
                  <span className="book-editor-file-empty">No hay PDF guardado.</span>
                )}

                <label className="goodreads-file-label">
                  {book.pdf_file ? "Sustituir PDF" : "Seleccionar PDF"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfChange}
                  />
                </label>

                {pdfFile && (
                  <p className="book-editor-selected-file">
                    Nuevo archivo: <strong>{pdfFile.name}</strong>
                  </p>
                )}

                {book.pdf_file && (
                  <label className="book-editor-checkbox is-compact">
                    <input
                      type="checkbox"
                      checked={removePdf}
                      onChange={(event) => {
                        setRemovePdf(event.target.checked);
                        if (event.target.checked) setPdfFile(null);
                      }}
                    />
                    <span>Eliminar el PDF actual</span>
                  </label>
                )}
              </article>

              <article className="book-editor-file-card">
                <div className="book-editor-file-heading">
                  <span className="book-editor-file-icon" aria-hidden="true">EPUB</span>
                  <div>
                    <strong>Archivo EPUB</strong>
                    <small>Máximo 50 MB</small>
                  </div>
                </div>

                {book.epub_file && !removeEpub ? (
                  <a
                    className="book-editor-current-file"
                    href={publicUrl(book.epub_file)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Descargar EPUB actual
                  </a>
                ) : (
                  <span className="book-editor-file-empty">No hay EPUB guardado.</span>
                )}

                <label className="goodreads-file-label">
                  {book.epub_file ? "Sustituir EPUB" : "Seleccionar EPUB"}
                  <input
                    type="file"
                    accept="application/epub+zip,.epub"
                    onChange={handleEpubChange}
                  />
                </label>

                {epubFile && (
                  <p className="book-editor-selected-file">
                    Nuevo archivo: <strong>{epubFile.name}</strong>
                  </p>
                )}

                {book.epub_file && (
                  <label className="book-editor-checkbox is-compact">
                    <input
                      type="checkbox"
                      checked={removeEpub}
                      onChange={(event) => {
                        setRemoveEpub(event.target.checked);
                        if (event.target.checked) setEpubFile(null);
                      }}
                    />
                    <span>Eliminar el EPUB actual</span>
                  </label>
                )}
              </article>
            </div>

            <div className="create-book-submit-row book-editor-submit-row">
              <button type="submit" disabled={submitting}>
                {submitting ? "Guardando…" : "Guardar cambios"}
              </button>
              <button
                type="button"
                className="is-secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancelar
              </button>
            </div>

            {error && (
              <p className="external-feedback is-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
