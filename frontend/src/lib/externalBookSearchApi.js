function apiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function firstString(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = String(item ?? "").trim();
      if (text) return text;
    }
    return null;
  }

  const text = String(value ?? "").trim();
  return text || null;
}

function extractYear(value) {
  const text = firstString(value);
  const match = text?.match(/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalizeIsbn(value) {
  const values = Array.isArray(value) ? value : [value];
  let isbn10 = null;

  for (const candidate of values) {
    const normalized = String(candidate ?? "").toUpperCase().replace(/[^0-9X]/g, "");

    if (normalized.length === 13) return normalized;
    if (normalized.length === 10) isbn10 = normalized;
  }

  return isbn10;
}

function language(value) {
  const raw = String(firstString(value) ?? "").toLowerCase();

  const map = {
    spa: "es",
    eng: "en",
    fra: "fr",
    fre: "fr",
    deu: "de",
    ger: "de",
    ita: "it",
    por: "pt",
    cat: "ca",
    glg: "gl",
    eus: "eu",
    jpn: "ja",
    kor: "ko",
    zho: "zh",
    chi: "zh",
    rus: "ru",
  };

  if (map[raw]) return map[raw];
  return /^[a-z]{2,3}$/.test(raw) ? raw : null;
}

function cleanSubjects(value) {
  if (!Array.isArray(value)) return [];

  const blocked = [
    "accessible book",
    "protected daisy",
    "in library",
    "overdrive",
    "large type books",
    "juvenile literature",
    "translations into",
  ];

  const subjects = new Map();

  for (const subject of value) {
    const text = String(subject ?? "").trim();
    const lower = text.toLowerCase();

    if (!text || text.length > 80) continue;
    if (blocked.some((needle) => lower.includes(needle))) continue;

    subjects.set(lower, text);

    if (subjects.size >= 12) break;
  }

  return Array.from(subjects.values());
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function openLibraryEdition(doc) {
  const editions = doc?.editions?.docs;
  return Array.isArray(editions) && editions[0] && typeof editions[0] === "object"
    ? editions[0]
    : {};
}

async function openLibraryResults(query) {
  const isbnQuery = normalizeIsbn(query);
  const searchExpression = isbnQuery ? "isbn:" + isbnQuery : query;

  const fields = [
    "key",
    "title",
    "author_name",
    "first_publish_year",
    "number_of_pages_median",
    "cover_i",
    "subject",
    "publisher",
    "language",
    "isbn",
    "first_sentence",
    "edition_count",
    "editions",
    "editions.key",
    "editions.title",
    "editions.language",
    "editions.publisher",
    "editions.publish_date",
    "editions.number_of_pages",
    "editions.isbn",
    "editions.cover_i",
  ].join(",");

  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", searchExpression);
  url.searchParams.set("lang", "es");
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "20");

  const data = await fetchJson(url);
  if (!data) return null;

  const results = [];

  for (const doc of Array.isArray(data.docs) ? data.docs : []) {
    if (!doc || typeof doc !== "object") continue;

    const edition = openLibraryEdition(doc);
    const title = String(edition.title ?? doc.title ?? "").trim();
    if (!title) continue;

    const authors = Array.isArray(doc.author_name)
      ? doc.author_name.map((author) => String(author ?? "").trim()).filter(Boolean)
      : [];

    const workKey = String(doc.key ?? "").trim();
    const editionKey = String(edition.key ?? "").trim();

    let sourceId = editionKey || workKey;
    sourceId = sourceId.replace(/^\/(books|works)\//, "").replace(/^\/+|\/+$/g, "");

    if (!sourceId) {
      sourceId = String(title + "|" + authors.join(",")).toLowerCase();
    }

    const coverId = Number(edition.cover_i ?? doc.cover_i ?? 0);
    const pages = Number(edition.number_of_pages ?? doc.number_of_pages_median ?? 0);

    results.push({
      provider: "open_library",
      provider_label: "Open Library",
      source_id: sourceId,
      openlibrary_key: workKey || null,
      edition_key: editionKey || null,
      title,
      author: authors.length ? authors.join(", ") : "Autor desconocido",
      year: extractYear(edition.publish_date) ?? extractYear(doc.first_publish_year),
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      description: firstString(doc.first_sentence),
      genres: cleanSubjects(doc.subject),
      publisher: firstString(edition.publisher) ?? firstString(doc.publisher),
      language: language(edition.language) ?? language(doc.language),
      isbn: normalizeIsbn(edition.isbn) ?? normalizeIsbn(doc.isbn),
    });
  }

  return results;
}

function googleCover(volume) {
  const links = volume?.imageLinks && typeof volume.imageLinks === "object"
    ? volume.imageLinks
    : {};

  for (const size of ["extraLarge", "large", "medium", "thumbnail", "smallThumbnail"]) {
    const cover = String(links[size] ?? "").trim();

    if (cover) {
      return cover.replace("http://", "https://").replace("&edge=curl", "");
    }
  }

  return null;
}

function googleIsbn(volume) {
  const values = [];

  for (const identifier of Array.isArray(volume?.industryIdentifiers) ? volume.industryIdentifiers : []) {
    if (identifier && typeof identifier === "object") {
      values.push(identifier.identifier);
    }
  }

  return normalizeIsbn(values);
}

async function googleResults(query) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");

  const data = await fetchJson(url);
  if (!data) return null;

  const results = [];

  for (const item of Array.isArray(data.items) ? data.items : []) {
    const volume = item?.volumeInfo && typeof item.volumeInfo === "object"
      ? item.volumeInfo
      : {};

    const title = String(volume.title ?? "").trim();
    if (!title) continue;

    const authors = Array.isArray(volume.authors)
      ? volume.authors.map((author) => String(author ?? "").trim()).filter(Boolean)
      : [];

    const categories = Array.isArray(volume.categories)
      ? volume.categories.map((category) => String(category ?? "").trim()).filter(Boolean)
      : [];

    const pages = Number(volume.pageCount ?? 0);

    results.push({
      provider: "google_books",
      provider_label: "Google Books",
      source_id: String(item.id ?? title + "|" + authors.join(",")),
      title,
      author: authors.length ? authors.join(", ") : "Autor desconocido",
      year: extractYear(volume.publishedDate),
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      cover: googleCover(volume),
      description: String(volume.description ?? "").trim() || null,
      genres: categories.slice(0, 8),
      publisher: String(volume.publisher ?? "").trim() || null,
      language: language(volume.language),
      isbn: googleIsbn(volume),
    });
  }

  return results;
}

function fingerprint(result) {
  const isbn = normalizeIsbn(result?.isbn);

  if (isbn) return "isbn:" + isbn;

  return (
    "text:" +
    String((result?.title ?? "") + "|" + (result?.author ?? ""))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

export async function searchExternalBooks(query) {
  const cleanQuery = String(query ?? "").trim();

  if (cleanQuery.length < 2 || cleanQuery.length > 200) {
    throw apiError("La busqueda debe tener entre 2 y 200 caracteres.", 400);
  }

  const openResults = await openLibraryResults(cleanQuery);
  let googleFallback = null;

  if (openResults === null || openResults.length < 12) {
    googleFallback = await googleResults(cleanQuery);
  }

  if (openResults === null && googleFallback === null) {
    throw apiError(
      "No se pudo conectar con Open Library ni con el buscador alternativo. Puedes crear el libro manualmente.",
      502,
    );
  }

  const merged = [];
  const seen = new Set();

  for (const result of [...(openResults || []), ...(googleFallback || [])]) {
    const key = fingerprint(result);

    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(result);

    if (merged.length >= 20) break;
  }

  return {
    ok: true,
    query: cleanQuery,
    provider: "Open Library",
    providers: {
      open_library: openResults !== null,
      google_books: googleFallback !== null,
    },
    results: merged,
  };
}
