import { useRef, useState } from "react";

import { apiFetch, publicUrl } from "./api.js";
import GenreTagSelector from "./GenreTagSelector.jsx";
import TaxonomyTagSelector from "./TaxonomyTagSelector.jsx";
import { serializeBookGenres } from "./bookGenres.js";
import { BOOK_AESTHETICS, BOOK_AUDIENCES, BOOK_THEMES, serializeTaxonomyItems } from "./bookTaxonomy.js";
import {
  extractHeroColorFromFile,
  FALLBACK_HERO_COLOR,
} from "./heroColor.js";

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

export default function CreateBook({ onCancel, onCreated }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("es");

  const [synopsis, setSynopsis] = useState("");
  const [genres, setGenres] = useState([]);
  const [themes, setThemes] = useState([]);
  const [audiences, setAudiences] = useState([]);
  const [aesthetics, setAesthetics] = useState([]);
  const [sagaName, setSagaName] = useState("");
  const [sagaNumber, setSagaNumber] = useState("");
  const [year, setYear] = useState("");
  const [pages, setPages] = useState("");
  const [publisher, setPublisher] = useState("");
  const [isbn, setIsbn] = useState("");

  const [cover, setCover] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [epubFile, setEpubFile] = useState(null);

  const [preview, setPreview] = useState("");
  const [heroColor, setHeroColor] = useState(FALLBACK_HERO_COLOR);
  const [heroColorStatus, setHeroColorStatus] = useState("");
  const heroColorPromise = useRef(Promise.resolve(FALLBACK_HERO_COLOR));
  const coverAnalysisId = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdBook, setCreatedBook] = useState(null);

  function handleTitleChange(event) {
    const value = event.target.value;
    const detectedSaga = sagaFromTitle(value);

    setTitle(value);

    if (detectedSaga) {
      setSagaName(detectedSaga.name);
      setSagaNumber(detectedSaga.number);
    }

    setError("");
    setCreatedBook(null);
  }

  function handleCoverChange(event) {
    const file = event.target.files?.[0] || null;
    const analysisId = coverAnalysisId.current + 1;
    coverAnalysisId.current = analysisId;

    setCover(file);
    setError("");
    setCreatedBook(null);

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setPreview(file ? URL.createObjectURL(file) : "");

    if (!file) {
      setHeroColor(FALLBACK_HERO_COLOR);
      setHeroColorStatus("");
      heroColorPromise.current = Promise.resolve(FALLBACK_HERO_COLOR);
      return;
    }

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
  }

  function validateOptionalFiles() {
    const maximumSize = 50 * 1024 * 1024;

    if (pdfFile && pdfFile.size > maximumSize) {
      return "El PDF no puede superar los 50 MB.";
    }

    if (epubFile && epubFile.size > maximumSize) {
      return "El EPUB no puede superar los 50 MB.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;

    setError("");
    setCreatedBook(null);

    if (!cover) {
      setError("Debes seleccionar una portada.");
      return;
    }

    const fileError = validateOptionalFiles();

    if (fileError) {
      setError(fileError);
      return;
    }

    const resolvedHeroColor = await heroColorPromise.current;
    const formData = new FormData();

    formData.append("title", title.trim());
    formData.append("author", author.trim());
    formData.append("language", language);
    formData.append("cover", cover);
    formData.append("hero_color", resolvedHeroColor || heroColor);

    if (synopsis.trim()) {
      formData.append("synopsis", synopsis.trim());
    }

    const serializedGenres = serializeBookGenres(genres);
    if (serializedGenres) {
      formData.append("genre", serializedGenres);
    }

    formData.append("themes", serializeTaxonomyItems(themes));
    formData.append("audiences", serializeTaxonomyItems(audiences));
    formData.append("aesthetics", serializeTaxonomyItems(aesthetics));

    formData.append("saga_name", sagaName.trim());
    formData.append("saga_number", sagaNumber);

    if (year) {
      formData.append("year", year);
    }

    if (pages) {
      formData.append("pages", pages);
    }

    if (publisher.trim()) {
      formData.append("publisher", publisher.trim());
    }

    if (isbn.trim()) {
      formData.append("isbn", isbn.trim());
    }

    if (pdfFile) {
      formData.append("pdf_file", pdfFile);
    }

    if (epubFile) {
      formData.append("epub_file", epubFile);
    }

    setSubmitting(true);

    try {
      const response = await apiFetch("create_book.php", {
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
        throw new Error(data.error || "No se pudo crear el libro.");
      }

      setCreatedBook(data.book);

      if (typeof onCreated === "function") {
        onCreated(data.book);
        return;
      }

      setTitle("");
      setAuthor("");
      setLanguage("es");
      setSynopsis("");
      setGenres([]);
      setThemes([]);
      setAudiences([]);
      setAesthetics([]);
      setSagaName("");
      setSagaNumber("");
      setYear("");
      setPages("");
      setPublisher("");
      setIsbn("");

      setCover(null);
      setPdfFile(null);
      setEpubFile(null);

      if (preview) {
        URL.revokeObjectURL(preview);
      }

      setPreview("");
      setHeroColor(FALLBACK_HERO_COLOR);
      setHeroColorStatus("");
      heroColorPromise.current = Promise.resolve(FALLBACK_HERO_COLOR);
      form.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }


  const inputStyle = {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: 10,
  };

  return (
    <main
      style={{
        width: "min(760px, 100%)",
        margin: "0 auto",
      }}
    >
      <div className="create-book-heading">
        <div>
          <h1>Crear un libro</h1>
          <p>Añade una edición que todavía no exista en Librélula.</p>
        </div>
        {typeof onCancel === "function" && (
          <button type="button" className="create-book-back" onClick={onCancel}>
            ← Volver al catálogo
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 18,
          padding: 24,
          background: "#ffffff",
          border: "1px solid #d8d0c4",
          borderRadius: 8,
        }}
      >
        <label>
          Título *
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            required
            maxLength={250}
            style={inputStyle}
          />
        </label>

        <label>
          Autor *
          <input
            type="text"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            required
            maxLength={250}
            style={inputStyle}
          />
        </label>

        <label>
          Idioma *
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            required
            style={inputStyle}
          >
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="ca">Catalán</option>
            <option value="fr">Francés</option>
            <option value="de">Alemán</option>
            <option value="it">Italiano</option>
            <option value="pt">Portugués</option>
          </select>
        </label>

        <label>
          Portada *
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleCoverChange}
            required
            style={inputStyle}
          />
        </label>

        {preview && (
          <img
            src={preview}
            alt="Vista previa de la portada"
            style={{
              width: 160,
              maxHeight: 240,
              objectFit: "cover",
              borderRadius: 5,
              boxShadow: `0 8px 24px ${heroColor}33`,
            }}
          />
        )}

        {heroColorStatus && (
          <small role="status">{heroColorStatus}</small>
        )}

        <hr style={{ width: "100%" }} />

        <h2 style={{ margin: 0 }}>Datos opcionales</h2>

        <label>
          Sinopsis
          <textarea
            value={synopsis}
            onChange={(event) => setSynopsis(event.target.value)}
            maxLength={5000}
            rows={6}
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
          />
        </label>

        <GenreTagSelector
          value={genres}
          onChange={setGenres}
          idPrefix="create-book-genres"
        />

        <TaxonomyTagSelector
          value={themes}
          onChange={setThemes}
          options={BOOK_THEMES}
          label="Temas y representación"
          help="Describe de qué trata el libro: familia, duelo, identidad, mitología…"
          customPlaceholder="Ej.: rivalidad, maternidad…"
          idPrefix="create-book-themes"
          maximum={10}
        />

        <TaxonomyTagSelector
          value={audiences}
          onChange={setAudiences}
          options={BOOK_AUDIENCES}
          label="Público"
          help="Categoría de edad o etapa lectora; no es un género literario."
          customLabel="Otra categoría"
          customPlaceholder="Ej.: crossover…"
          idPrefix="create-book-audiences"
          maximum={3}
        />

        <TaxonomyTagSelector
          value={aesthetics}
          onChange={setAesthetics}
          options={BOOK_AESTHETICS}
          label="Estética"
          help="Describe su imaginario visual o cultural, no la emoción que provoca."
          customPlaceholder="Ej.: academia luminosa, folklore…"
          idPrefix="create-book-aesthetics"
          maximum={6}
        />

        <label>
          Saga
          <input
            type="text"
            value={sagaName}
            onChange={(event) => setSagaName(event.target.value)}
            maxLength={250}
            placeholder="Por ejemplo: Dungeon Crawler Carl"
            style={inputStyle}
          />
          <small>
            Déjalo vacío si el libro no pertenece a una saga.
          </small>
        </label>

        <label>
          Número dentro de la saga
          <input
            type="number"
            value={sagaNumber}
            onChange={(event) => setSagaNumber(event.target.value)}
            min="0"
            step="any"
            placeholder="1, 2, 3, 0.5..."
            style={inputStyle}
          />
          <small>
            Usa decimales para precuelas o historias intermedias.
          </small>
        </label>

        <label>
          Año de publicación
          <input
            type="number"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            min="1"
            max={new Date().getFullYear() + 1}
            style={inputStyle}
          />
        </label>

        <label>
          Número de páginas
          <input
            type="number"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
            min="1"
            style={inputStyle}
          />
        </label>

        <label>
          Editorial
          <input
            type="text"
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
            maxLength={250}
            style={inputStyle}
          />
        </label>

        <label>
          ISBN
          <input
            type="text"
            value={isbn}
            onChange={(event) => setIsbn(event.target.value)}
            maxLength={30}
            placeholder="978..."
            style={inputStyle}
          />
        </label>

        <label>
          Archivo PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) =>
              setPdfFile(event.target.files?.[0] || null)
            }
            style={inputStyle}
          />
          <small>Opcional. Máximo 50 MB.</small>
        </label>

        <label>
          Archivo EPUB
          <input
            type="file"
            accept="application/epub+zip,.epub"
            onChange={(event) =>
              setEpubFile(event.target.files?.[0] || null)
            }
            style={inputStyle}
          />
          <small>Opcional. Máximo 50 MB.</small>
        </label>

        <div className="create-book-submit-row">
          <button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar libro"}
          </button>
          {typeof onCancel === "function" && (
            <button type="button" className="is-secondary" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: "#b00020",
            }}
          >
            {error}
          </p>
        )}

        {createdBook && (
          <section
            style={{
              padding: 16,
              background: "#e6f4ea",
              borderRadius: 6,
            }}
          >
            <strong>Libro creado correctamente</strong>

            <p>
              <b>Título:</b> {createdBook.title}
            </p>

            <p>
              <b>Autor:</b> {createdBook.author}
            </p>

            <img
              src={publicUrl(createdBook.cover)}
              alt={`Portada de ${createdBook.title}`}
              style={{
                width: 120,
                maxHeight: 180,
                objectFit: "cover",
              }}
            />

            {createdBook.pdf_file && (
              <p>
                <a
                  href={publicUrl(createdBook.pdf_file)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir PDF
                </a>
              </p>
            )}

            {createdBook.epub_file && (
              <p>
                <a
                  href={publicUrl(createdBook.epub_file)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar EPUB
                </a>
              </p>
            )}
          </section>
        )}
      </form>
    </main>
  );
}