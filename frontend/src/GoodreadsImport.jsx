import { useEffect, useRef, useState } from "react";

import { apiFetch, publicUrl } from "./api.js";
import { BOOK_GENRES, normalizeBookGenre } from "./bookGenres.js";
import {
  extractHeroColorFromFile,
  FALLBACK_HERO_COLOR,
} from "./heroColor.js";

const INITIAL_FIELDS = {
  title: "",
  author: "",
  language: "es",
  synopsis: "",
  genre: "",
  sagaName: "",
  sagaNumber: "",
  year: "",
  pages: "",
  publisher: "",
  isbn: "",
};

const STOP_HEADINGS = [
  "about the author",
  "acerca del autor",
  "sobre el autor",
  "book details",
  "book details editions",
  "detalles del libro",
  "ficha tecnica",
  "caracteristicas",
  "datos del producto",
  "detalles del producto",
  "informacion del producto",
  "especificaciones",
  "editions",
  "ediciones",
  "genres",
  "generos",
  "get a copy",
  "conseguir una copia",
  "ratings reviews",
  "valoraciones resenas",
  "community reviews",
  "resenas de la comunidad",
  "readers also enjoyed",
  "a los lectores tambien les gusto",
  "lists featuring this book",
  "listas que incluyen este libro",
  "quotes",
  "citas",
  "this edition",
  "esta edicion",
  "first published",
  "published",
  "publicado",
  "series",
  "serie",
  "format",
  "formato",
  "isbn",
  "asin",
  "language",
  "idioma",
  "more reviews",
  "mas resenas",
  "opiniones",
  "los mas leidos",
  "tambien te puede interesar",
  "productos relacionados",
  "recomendados",
];

const NOISE_LINES = [
  "goodreads",
  "want to read",
  "currently reading",
  "read",
  "rate this book",
  "open preview",
  "kindle",
  "audiobook",
  "ebook",
  "hardcover",
  "paperback",
  "mass market paperback",
  "show more",
  "mostrar mas",
  "see all formats and editions",
  "all editions",
  "friend reviews",
  "escribe una resena y accede a ventajas",
  "ver mas",
  "mostrar menos",
];

function plainText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function normalized(value) {
  return plainText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isStopHeading(value) {
  const clean = normalized(value);
  return STOP_HEADINGS.some(
    (heading) => clean === heading || clean.startsWith(`${heading} `),
  );
}

function isNoiseLine(value) {
  const clean = normalized(value);

  if (!clean) return true;
  if (/^\d+(?:[.,]\d+)?\s+(ratings?|reviews?|valoraciones?|resenas?)$/.test(clean)) {
    return true;
  }

  return NOISE_LINES.some(
    (noise) => clean === noise || clean.startsWith(`${noise} `),
  );
}


function isRatingLine(value) {
  const line = plainText(value);
  return /^(?:[0-4][.,]\d{1,2}|5[.,]0{1,2})$/u.test(line);
}

function isRatingsSummary(value) {
  const line = normalized(value);
  const hasRatings = /(?:ratings?|valoraciones?)\d*/u.test(line);
  const hasReviews = /(?:reviews?|resenas?)\d*/u.test(line);
  return hasRatings && hasReviews;
}

function plausibleAuthor(value) {
  const line = plainText(value);
  const words = line.split(/\s+/u).filter(Boolean);

  if (line.length < 2 || line.length > 120) return false;
  if (words.length > 12) return false;
  if (isNoiseLine(line) || isStopHeading(line) || isRatingLine(line)) return false;
  if (/[!?;:]|\.{2,}/u.test(line)) return false;
  if (/\b(ratings?|reviews?|valoraciones?|resenas?)\b/iu.test(line)) return false;

  return true;
}

function isAuthorByline(value) {
  const line = plainText(value);
  const match = line.match(/^(?:by|por)\s+(.+)$/iu);
  return Boolean(match && plausibleAuthor(match[1]));
}

function parseSagaValue(value) {
  const line = plainText(value);
  const match = line.match(
    /^(.+?)\s*(?:\(\s*#\s*(\d+(?:[.,]\d+)?)\s*\)|#\s*(\d+(?:[.,]\d+)?))\s*$/u,
  );

  if (!match) return { name: "", number: "" };

  return {
    name: match[1].trim(),
    number: String(match[2] || match[3] || "").replace(",", "."),
  };
}

function headerBeforeRating(lines) {
  const limit = Math.min(lines.length, 20);

  for (let index = 2; index < limit; index += 1) {
    if (!isRatingLine(lines[index])) continue;

    const nearbySummary = lines
      .slice(index + 1, Math.min(lines.length, index + 4))
      .some((line) => isRatingsSummary(line));

    if (!nearbySummary) continue;

    const author = cleanAuthor(lines[index - 1]);
    const title = plainText(lines[index - 2]);

    if (!plausibleAuthor(author) || !plausibleTitle(title)) continue;

    const saga = index >= 3 ? parseSagaValue(lines[index - 3]) : { name: "", number: "" };

    return {
      title,
      author,
      authorIndex: index - 1,
      saga,
    };
  }

  return null;
}

function lineAfterLabel(lines, labels) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const clean = normalized(line);

    for (const label of labels) {
      if (clean === label) {
        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          const next = plainText(lines[nextIndex]);
          if (next && !isNoiseLine(next)) return next;
        }
      }

      if (clean.startsWith(`${label} `)) {
        const value = plainText(line.replace(/^.*?:\s*/u, ""));
        if (value && normalized(value) !== clean) return value;

        const words = plainText(line).split(/\s+/);
        const labelWords = label.split(/\s+/).length;
        const remainder = words.slice(labelWords).join(" ");
        if (remainder) return remainder;
      }
    }
  }

  return "";
}

function cleanAuthor(value) {
  return plainText(value)
    .replace(/^by\s+/i, "")
    .replace(/^por\s+/i, "")
    .replace(
      /\s*\|\s*(?:pertenece\s+a\s+la\s+)?(?:serie|saga)\b.*$/iu,
      "",
    )
    .replace(/\s*\(Goodreads Author\)\s*$/i, "")
    .replace(/\s*\(Autor de Goodreads\)\s*$/i, "")
    .trim();
}

function sagaFromLabeledValue(value) {
  const line = plainText(value)
    .replace(/^(?:pertenece\s+a\s+la\s+)?(?:series?|serie(?:\s+saga)?|saga)\s*:?\s*/iu, "")
    .replace(/[.;]+$/u, "")
    .trim();

  if (!line || line.length > 120 || isStopHeading(line) || isNoiseLine(line)) {
    return { name: "", number: "" };
  }

  const goodreadsStyle = parseSagaValue(line);
  if (goodreadsStyle.name) {
    return {
      ...goodreadsStyle,
      name: goodreadsStyle.name.replace(/[,:-]+$/u, "").trim(),
    };
  }

  const numbered = line.match(
    /^(.+?)\s*(?:#|n(?:[uú]m(?:ero)?)?\.?\s*|n[.ºo]?\s+)(\d+(?:[.,]\d+)?)\s*$/iu,
  ) || line.match(/^(.+?\D)\s+(\d+(?:[.,]\d+)?)\s*$/u);

  if (numbered) {
    return {
      name: numbered[1].trim(),
      number: numbered[2].replace(",", "."),
    };
  }

  return { name: line, number: "" };
}

function sagaFromAuthorByline(value) {
  const match = plainText(value).match(
    /\|\s*(?:pertenece\s+a\s+la\s+)?(?:serie|saga)\s*:?\s*(.+)$/iu,
  );

  return sagaFromLabeledValue(match?.[1] || "");
}

function plausibleTitle(value) {
  const line = plainText(value);
  const clean = normalized(line);

  if (line.length < 2 || line.length > 250) return false;
  if (isNoiseLine(line) || isStopHeading(line)) return false;
  if (/^(by|por)\s+/i.test(line)) return false;
  if (/\b(ratings?|reviews?|valoraciones?|resenas?)\b/i.test(line)) return false;
  if (isRatingLine(line) || /^\d+(?:[.,]\d+)?$/.test(clean)) return false;
  if (parseSagaValue(line).name) return false;

  return true;
}

function extractSynopsis(text, rawLines) {
  const lines = rawLines.map((line) => plainText(line));
  const headings = ["description", "descripcion", "sinopsis", "book description"];
  const headingIndex = lines.findIndex((line) => headings.includes(normalized(line)));

  if (headingIndex >= 0) {
    const collected = [];

    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line && isStopHeading(line)) break;
      if (!line) {
        if (collected.length > 0 && collected[collected.length - 1] !== "") {
          collected.push("");
        }
        continue;
      }
      if (!isNoiseLine(line)) collected.push(line);
    }

    const result = collected.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (result.length >= 40) return result.slice(0, 5000);
  }

  const blocks = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => plainText(block.replace(/\n+/g, " ")))
    .filter((block) => block.length >= 80 && block.length <= 5000)
    .filter((block) => !isStopHeading(block))
    .filter((block) => !/\b(ratings?|reviews?|valoraciones?|resenas?)\b/i.test(block))
    .filter((block) => !/goodreads helps you keep track/i.test(block));

  blocks.sort((left, right) => right.length - left.length);
  return (blocks[0] || "").slice(0, 5000);
}

function sagaFromTitle(value) {
  const candidates = [...plainText(value).matchAll(/\(([^()]{2,120})\)/gu)]
    .map((match) => plainText(match[1]))
    .reverse();

  for (const candidate of candidates) {
    const clean = normalized(candidate);

    if (
      !clean
      || candidate.split(/\s+/u).length > 12
      || /\b(edicion|edition|especial|limitada|ilustrada|tapa|bolsillo|cantos|audiolibro|ebook|version|premio)\b/u.test(clean)
    ) {
      continue;
    }

    const preferredName = plainText(candidate.split(/\s+\/\s+/u)[0]);
    const saga = sagaFromLabeledValue(preferredName);
    if (saga.name) return saga;
  }

  return { name: "", number: "" };
}

function parseBookSourceText(text) {
  const rawLines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const lines = rawLines.map((line) => plainText(line)).filter(Boolean);
  const joined = lines.join("\n");
  const header = headerBeforeRating(lines);

  let author = header?.author
    || lineAfterLabel(lines, ["author", "autor", "written by", "escrito por"]);
  let authorIndex = header?.authorIndex ?? -1;

  if (!author) {
    authorIndex = lines.findIndex((line) => isAuthorByline(line));
    if (authorIndex >= 0) author = lines[authorIndex];
  }

  if (!author) {
    authorIndex = lines.findIndex((line) => /\(Goodreads Author\)|\(Autor de Goodreads\)/i.test(line));
    if (authorIndex >= 0) author = lines[authorIndex];
  }

  const bylineSaga = sagaFromAuthorByline(author);
  author = cleanAuthor(author);

  let title = header?.title
    || lineAfterLabel(lines, ["title", "titulo", "book title"]);

  if (!title && authorIndex > 0) {
    for (let index = authorIndex - 1; index >= 0; index -= 1) {
      if (plausibleTitle(lines[index])) {
        title = lines[index];
        break;
      }
    }
  }

  if (!title) {
    title = lines.find((line) => plausibleTitle(line)) || "";
  }

  const publicationValue = lineAfterLabel(lines, [
    "ano de edicion",
    "ano de publicacion",
    "fecha de lanzamiento",
    "fecha de publicacion",
    "publication date",
    "published",
    "publicado",
  ]);
  const yearMatch = publicationValue.match(/\b((?:18|19|20)\d{2})\b/u) || joined.match(
    /(?:first published|published|publication date|fecha de publicaci[oó]n|publicado(?:\s+por\s+primera\s+vez)?)[^\d]{0,35}((?:18|19|20)\d{2})/iu,
  ) || joined.match(/\b((?:18|19|20)\d{2})\b/u);

  const pagesValue = lineAfterLabel(lines, [
    "numero de paginas",
    "paginas",
    "number of pages",
    "page count",
  ]);
  const pagesMatch = pagesValue.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d{1,5})\b/u)
    || joined.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d{1,5})\s+pages?\b/i)
    || joined.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d{1,5})\s+p[aá]ginas?\b/iu);

  const isbnValue = lineAfterLabel(lines, ["isbn", "isbn 13", "isbn 10"]);
  const isbnMatch = isbnValue.match(/\b([0-9Xx -]{10,20})\b/u)
    || joined.match(/\bISBN(?:-1[03])?\s*[:#]?\s*([0-9Xx -]{10,20})/i);

  const publisherValue = lineAfterLabel(lines, ["editorial", "publisher"]);
  const publisherMatch = joined.match(
    /(?:published|publicado)(?:\s+[^\n]{0,45}?)?\s+(?:by|por)\s+([^\n]{2,160})/i,
  ) || joined.match(/(?:editorial|publisher)\s*[:\n]\s*([^\n]{2,160})/i);

  let genre = lineAfterLabel(lines, [
    "subgeneros",
    "generos",
    "genero",
    "categorias",
    "categoria",
  ]);
  const genreIndex = lines.findIndex((line) => ["genres", "generos"].includes(normalized(line)));

  if (!genre && genreIndex >= 0) {
    const genres = [];
    for (let index = genreIndex + 1; index < lines.length && genres.length < 4; index += 1) {
      const line = lines[index];
      if (isStopHeading(line) || line.length > 45) break;
      if (!isNoiseLine(line) && !/^\d/.test(line)) genres.push(line);
    }
    genre = genres.join(", ");
  }

  if (!normalizeBookGenre(genre)) {
    genre = lines
      .slice(0, 20)
      .find((line) => line.length <= 70 && normalizeBookGenre(line)) || "";
  }

  let language = "es";
  const languageValue = lineAfterLabel(lines, ["language", "idioma"]);
  const languageText = normalized(languageValue || joined);
  if (/\b(english|ingles)\b/u.test(languageText)) language = "en";
  else if (/\b(catalan)\b/u.test(languageText)) language = "ca";
  else if (/\b(french|frances)\b/u.test(languageText)) language = "fr";
  else if (/\b(german|aleman)\b/u.test(languageText)) language = "de";
  else if (/\b(italian|italiano)\b/u.test(languageText)) language = "it";
  else if (/\b(portuguese|portugues)\b/u.test(languageText)) language = "pt";

  const seriesValue = lineAfterLabel(lines, ["series", "serie", "saga", "serie saga"]);
  const labeledSaga = sagaFromLabeledValue(seriesValue);
  const saga = labeledSaga.name
    ? labeledSaga
    : bylineSaga.name
      ? bylineSaga
      : header?.saga?.name
        ? header.saga
        : sagaFromTitle(title);

  return {
    title: plainText(title),
    author,
    language,
    synopsis: extractSynopsis(text, rawLines),
    genre: normalizeBookGenre(genre),
    sagaName: saga.name,
    sagaNumber: saga.number,
    year: yearMatch?.[1] || "",
    pages: String(pagesMatch?.[1] || "").replace(/[.,]/g, ""),
    publisher: plainText(publisherValue || publisherMatch?.[1] || "")
      .replace(/[.,;]+$/u, "")
      .slice(0, 250),
    isbn: plainText(isbnMatch?.[1] || "").replace(/\s+/g, "").slice(0, 30),
  };
}

function sourcePageUrl(value) {
  try {
    const url = new URL(String(value || "").trim());

    if (url.protocol !== "https:" || !url.hostname) return "";

    return url.toString();
  } catch {
    return "";
  }
}

export default function GoodreadsImport({ initialTitle = "", isAdmin = false, onCancel, onCreated }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [fields, setFields] = useState(() => ({
    ...INITIAL_FIELDS,
    title: String(initialTitle || "").trim(),
  }));
  const [cover, setCover] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [epubFile, setEpubFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [heroColor, setHeroColor] = useState(FALLBACK_HERO_COLOR);
  const [heroColorStatus, setHeroColorStatus] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdBook, setCreatedBook] = useState(null);
  const heroColorPromise = useRef(Promise.resolve(FALLBACK_HERO_COLOR));
  const coverAnalysisId = useRef(0);
  const canManageFiles = Boolean(isAdmin);
  const creationTitle = canManageFiles ? "Añadir un libro" : "Proponer un libro";
  const creationDescription = canManageFiles
    ? "Puedes crear la ficha manualmente o pegar el texto de una ficha web para completar los campos más rápido."
    : "Completa la ficha y la enviaremos a revisión antes de publicarla en el catálogo.";

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function updateField(name, value) {
    setFields((current) => ({ ...current, [name]: value }));
    setError("");
    setCreatedBook(null);
  }

  function handleAnalyze() {
    if (rawText.trim().length < 20) {
      setError("Pega primero el texto visible de una ficha web.");
      return;
    }

    const parsed = parseBookSourceText(rawText);
    setFields((current) => ({
      ...current,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => String(value || "").trim() !== ""),
      ),
    }));

    const detected = [
      parsed.title && "título",
      parsed.author && "autor",
      parsed.year && "año",
      parsed.synopsis && "sinopsis",
      parsed.pages && "páginas",
      parsed.publisher && "editorial",
      parsed.isbn && "ISBN",
      parsed.genre && "tipo de novela",
      parsed.sagaName && "saga",
    ].filter(Boolean);

    setParseMessage(
      detected.length > 0
        ? `Detectado: ${detected.join(", ")}. Revisa los campos antes de guardar.`
        : "No pude detectar campos con seguridad. Puedes completarlos manualmente.",
    );
    setError("");
  }

  function selectCover(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("La portada debe ser una imagen JPG, PNG o WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("La portada no puede superar los 5 MB.");
      return;
    }

    const analysisId = coverAnalysisId.current + 1;
    coverAnalysisId.current = analysisId;

    if (preview) URL.revokeObjectURL(preview);

    setCover(file);
    setPreview(URL.createObjectURL(file));
    setHeroColorStatus("Analizando el color de la portada…");
    setError("");

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

  function handlePasteCover(event) {
    const imageItem = Array.from(event.clipboardData?.items || []).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );

    const file = imageItem?.getAsFile();
    if (file) {
      event.preventDefault();
      selectCover(file);
    }
  }

  function handleDropCover(event) {
    event.preventDefault();
    const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
    if (file) selectCover(file);
  }

  function validateOptionalFiles() {
    if (!canManageFiles) return "";

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
    setError("");
    setCreatedBook(null);

    if (!fields.title.trim() || !fields.author.trim()) {
      setError("Revisa el título y el autor antes de guardar.");
      return;
    }

    if (!cover) {
      setError("Debes pegar, arrastrar o seleccionar una portada.");
      return;
    }

    const fileError = validateOptionalFiles();

    if (fileError) {
      setError(fileError);
      return;
    }

    const resolvedHeroColor = await heroColorPromise.current;
    const formData = new FormData();

    formData.append("title", fields.title.trim());
    formData.append("author", fields.author.trim());
    formData.append("language", fields.language);
    formData.append("cover", cover);
    formData.append("hero_color", resolvedHeroColor || heroColor);
    formData.append("saga_name", fields.sagaName.trim());
    formData.append("saga_number", fields.sagaNumber);

    for (const [name, value] of [
      ["synopsis", fields.synopsis],
      ["genre", fields.genre],
      ["year", fields.year],
      ["pages", fields.pages],
      ["publisher", fields.publisher],
      ["isbn", fields.isbn],
    ]) {
      if (String(value || "").trim()) formData.append(name, String(value).trim());
    }

    if (canManageFiles && pdfFile) formData.append("pdf_file", pdfFile);
    if (canManageFiles && epubFile) formData.append("epub_file", epubFile);

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
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const validSourceUrl = sourcePageUrl(sourceUrl);

  return (
    <main className="goodreads-import-page">
      <div className="create-book-heading">
        <div>
          <span className="external-search-kicker">Nuevo libro</span>
          <h1>{creationTitle}</h1>
          <p>{creationDescription}</p>
          {!canManageFiles && (
            <p className="goodreads-inline-warning">
              Tu propuesta quedará pendiente hasta que una administradora la revise.
            </p>
          )}
        </div>
        <button type="button" className="create-book-back" onClick={onCancel}>
          ← Volver al catálogo
        </button>
      </div>

      <form className="goodreads-import-form" onSubmit={handleSubmit}>
        <section className="goodreads-step">
          <div className="goodreads-step-number">1</div>
          <div className="goodreads-step-content">
            <h2>Importa los datos si los tienes <span className="goodreads-optional-badge">Opcional</span></h2>
            <p>
              Si encontraste el libro en una librería, editorial, Goodreads u otra web,
              pega el enlace y el texto visible de su ficha.
              Si no, puedes saltarte este paso y completar todo manualmente más abajo.
            </p>

            <div className="goodreads-url-row">
              <label>
                Enlace de la fuente (opcional)
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.casadellibro.com/..."
                />
              </label>
              <button
                type="button"
                disabled={!validSourceUrl}
                onClick={() => window.open(validSourceUrl, "_blank", "noopener,noreferrer")}
              >
                Abrir ficha
              </button>
            </div>

            {sourceUrl && !validSourceUrl && (
              <small className="goodreads-inline-warning">
                Introduce un enlace HTTPS válido.
              </small>
            )}

            <label>
              Texto copiado de la ficha (opcional)
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                rows={12}
                placeholder={`Ejemplo:\nTítulo del libro\nPor Nombre del autor\nSinopsis\nAquí aparece la sinopsis...\nFicha técnica\nISBN: 978...`}
              />
            </label>

            <button type="button" className="goodreads-analyze-button" onClick={handleAnalyze}>
              Completar campos desde el texto
            </button>

            {parseMessage && <p className="goodreads-detection" role="status">{parseMessage}</p>}
          </div>
        </section>

        <section className="goodreads-step">
          <div className="goodreads-step-number">2</div>
          <div className="goodreads-step-content">
            <h2>Añade la portada</h2>
            <p>
              Guarda la portada en tu equipo y selecciónala, o copia una imagen y pégala
              dentro del recuadro. Librélula la guardará en su propia carpeta.
            </p>

            <div
              className={`goodreads-cover-drop${preview ? " has-preview" : ""}`}
              tabIndex={0}
              onPaste={handlePasteCover}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDropCover}
            >
              {preview ? (
                <img src={preview} alt="Vista previa de la portada" />
              ) : (
                <div>
                  <strong>Pega o arrastra aquí la portada</strong>
                  <span>También puedes seleccionarla con el botón inferior.</span>
                </div>
              )}
            </div>

            <label className="goodreads-file-label">
              Seleccionar imagen
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => selectCover(event.target.files?.[0] || null)}
              />
            </label>

            {heroColorStatus && <small role="status">{heroColorStatus}</small>}
          </div>
        </section>

        <section className="goodreads-step">
          <div className="goodreads-step-number">3</div>
          <div className="goodreads-step-content">
            <h2>Completa y revisa la ficha</h2>
            <p>Solo título, autor, idioma y portada son obligatorios. El resto puede completarse ahora o más adelante.</p>

            <div className="goodreads-fields-grid">
              <label className="is-wide">
                Título *
                <input
                  type="text"
                  required
                  maxLength={250}
                  value={fields.title}
                  onChange={(event) => updateField("title", event.target.value)}
                />
              </label>

              <label>
                Autor *
                <input
                  type="text"
                  required
                  maxLength={250}
                  value={fields.author}
                  onChange={(event) => updateField("author", event.target.value)}
                />
              </label>

              <label>
                Idioma *
                <select
                  value={fields.language}
                  onChange={(event) => updateField("language", event.target.value)}
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

              <label className="is-wide">
                Sinopsis
                <textarea
                  rows={8}
                  maxLength={5000}
                  value={fields.synopsis}
                  onChange={(event) => updateField("synopsis", event.target.value)}
                />
              </label>

              <label>
                Año
                <input
                  type="number"
                  min="1"
                  max={new Date().getFullYear() + 1}
                  value={fields.year}
                  onChange={(event) => updateField("year", event.target.value)}
                />
              </label>

              <label>
                Páginas
                <input
                  type="number"
                  min="1"
                  value={fields.pages}
                  onChange={(event) => updateField("pages", event.target.value)}
                />
              </label>

              <label>
                Editorial
                <input
                  type="text"
                  maxLength={250}
                  value={fields.publisher}
                  onChange={(event) => updateField("publisher", event.target.value)}
                />
              </label>

              <label>
                ISBN
                <input
                  type="text"
                  maxLength={30}
                  value={fields.isbn}
                  onChange={(event) => updateField("isbn", event.target.value)}
                />
              </label>

              <label>
                Tipo de novela
                <select
                  value={fields.genre}
                  onChange={(event) => updateField("genre", event.target.value)}
                >
                  <option value="">Selecciona un tipo</option>
                  {BOOK_GENRES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label>
                Saga
                <input
                  type="text"
                  maxLength={250}
                  value={fields.sagaName}
                  onChange={(event) => updateField("sagaName", event.target.value)}
                />
              </label>

              <label>
                Número en la saga
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={fields.sagaNumber}
                  onChange={(event) => updateField("sagaNumber", event.target.value)}
                />
              </label>

              {canManageFiles ? (
                <>
                  <label>
                    PDF (opcional)
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
                    />
                  </label>

                  <label>
                    EPUB (opcional)
                    <input
                      type="file"
                      accept="application/epub+zip,.epub"
                      onChange={(event) => setEpubFile(event.target.files?.[0] || null)}
                    />
                  </label>
                </>
              ) : (
                <p className="goodreads-inline-warning">
                  La subida de PDF y EPUB está reservada para administradoras.
                </p>
              )}
            </div>

            <div className="create-book-submit-row">
              <button type="submit" disabled={submitting}>
                {submitting ? "Guardando…" : canManageFiles ? "Guardar en Librélula" : "Enviar propuesta"}
              </button>
              <button type="button" className="is-secondary" onClick={onCancel}>
                Cancelar
              </button>
            </div>

            {error && <p className="external-feedback is-error" role="alert">{error}</p>}

            {createdBook && (
              <section className="goodreads-created-card">
                <strong>
                  {createdBook.review_status === "pending"
                    ? "Propuesta enviada a revisión"
                    : "Libro creado correctamente"}
                </strong>
                <p>{createdBook.title} · {createdBook.author}</p>
                {createdBook.review_status === "pending" && (
                  <p>Cuando una administradora lo apruebe, aparecerá en el catálogo público.</p>
                )}
                {createdBook.cover && (
                  <img src={publicUrl(createdBook.cover)} alt={`Portada de ${createdBook.title}`} />
                )}
              </section>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
