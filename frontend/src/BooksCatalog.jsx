import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./BookDiscovery.css";
import { apiFetch, publicUrl, readJsonResponse } from "./api.js";
import {
  BOOK_GENRE_GROUPS,
  BOOK_GENRES,
  QUICK_BOOK_GENRES,
  normalizeBookGenres,
  normalizedGenreText,
  readableRawGenre,
} from "./bookGenres.js";
import { inferTaxonomyFromSubjects, parseTaxonomyItems } from "./bookTaxonomy.js";
import ReadingStatusControl from "./ReadingStatusControl.jsx";
import { getMyBookProposals } from "./lib/myBookProposalsApi.js";
import {
  approveBookProposal,
  getPendingBookProposals,
  rejectBookProposal,
} from "./lib/bookModerationApi.js";
import { READING_STATUS_BY_VALUE } from "./readingStatuses.js";

function initialSearch() {
  return new URLSearchParams(window.location.search).get("q") || "";
}

function initialGenreFilters() {
  const params = new URLSearchParams(window.location.search);
  const combined = params.get("genres") || params.get("genre") || "";
  return normalizeBookGenres(combined.split("|")).slice(0, 8);
}

function initialGenreMode() {
  return new URLSearchParams(window.location.search).get("genre_mode") === "all"
    ? "all"
    : "any";
}

function initialYearFilter() {
  const value = new URLSearchParams(window.location.search).get("year") || "";
  return /^\d{1,4}$/.test(value) ? value : "";
}

function resultKey(book) {
  return `${book.provider || "external"}:${book.source_id || book.id || book.isbn || book.title}`;
}

function providerLabel(book) {
  if (book?.provider_label) return book.provider_label;
  if (book?.provider === "open_library") return "Open Library";
  if (book?.provider === "google_books") return "Google Books";
  return "Fuente externa";
}

function externalGenres(book) {
  return normalizeBookGenres(book?.genres || book?.genre)
    .filter((genre) => BOOK_GENRES.includes(genre))
    .slice(0, 8);
}

function normalizedIsbn(value) {
  return String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
}

function normalizedIdentity(value) {
  return String(value || "").trim().toLocaleLowerCase("es-ES");
}

function matchingCatalogBook(externalBook, catalogBooks) {
  const isbn = normalizedIsbn(externalBook?.isbn);

  if (isbn) {
    const isbnMatch = catalogBooks.find(
      (book) => normalizedIsbn(book?.isbn) === isbn,
    );
    if (isbnMatch) return isbnMatch;
  }

  const title = normalizedIdentity(externalBook?.title);
  const author = normalizedIdentity(externalBook?.author);

  if (!title || !author) return null;

  return catalogBooks.find(
    (book) => normalizedIdentity(book?.title) === title
      && normalizedIdentity(book?.author) === author,
  ) || null;
}

function bookMatchesSearch(book, normalizedSearch) {
  if (!normalizedSearch) return true;

  const normalizedGenres = normalizeBookGenres(book.genre);

  return [
    book.title,
    book.author,
    readableRawGenre(book.genre),
    normalizedGenres.join(" "),
    parseTaxonomyItems(book.themes).join(" "),
    parseTaxonomyItems(book.audiences).join(" "),
    parseTaxonomyItems(book.aesthetics).join(" "),
    book.publisher,
    book.isbn,
    book.saga_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

export default function BooksCatalog({
  isAdmin = false,
  isLoggedIn = false,
  onAddBook,
  onSelectBook,
}) {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState(initialSearch);
  const [genreFilters, setGenreFilters] = useState(initialGenreFilters);
  const [genreMode, setGenreMode] = useState(initialGenreMode);
  const [genrePickerOpen, setGenrePickerOpen] = useState(false);
  const [genrePickerSearch, setGenrePickerSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [externalResults, setExternalResults] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [externalSearchedQuery, setExternalSearchedQuery] = useState("");
  const [importingKey, setImportingKey] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [userBookItems, setUserBookItems] = useState({});
  const [userBooksLoading, setUserBooksLoading] = useState(false);
  const [savingStatusBookId, setSavingStatusBookId] = useState("");
  const [statusFeedback, setStatusFeedback] = useState(null);
  const [bookProposals, setBookProposals] = useState([]);
  const [bookProposalsLoading, setBookProposalsLoading] = useState(false);
  const [bookProposalsError, setBookProposalsError] = useState("");
  const [adminProposals, setAdminProposals] = useState([]);
  const [adminProposalsLoading, setAdminProposalsLoading] = useState(false);
  const [adminProposalsError, setAdminProposalsError] = useState("");
  const [moderatingBookId, setModeratingBookId] = useState("");
  const [expandedAdminProposalId, setExpandedAdminProposalId] = useState("");
  const directBookHandled = useRef(false);

  useEffect(() => {
    async function loadBooks() {
      try {
        setLoading(true);
        setError("");
        const response = await apiFetch("get_books.php");
        const data = await readJsonResponse(response);
        setBooks(Array.isArray(data.books) ? data.books : []);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadBooks();
  }, []);

  useEffect(() => {
    if (!genrePickerOpen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") setGenrePickerOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [genrePickerOpen]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;

    async function loadUserBooks() {
      try {
        setUserBooksLoading(true);
        const response = await apiFetch("catalog_user_books.php");
        const data = await readJsonResponse(response);
        if (!cancelled) {
          setUserBookItems(data.items && typeof data.items === "object" ? data.items : {});
        }
      } catch (requestError) {
        if (!cancelled) {
          setStatusFeedback({ type: "error", text: requestError.message });
        }
      } finally {
        if (!cancelled) setUserBooksLoading(false);
      }
    }

    loadUserBooks();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || isAdmin) {
      setBookProposals([]);
      setBookProposalsError("");
      setBookProposalsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadBookProposals() {
      try {
        setBookProposalsLoading(true);
        setBookProposalsError("");
        const items = await getMyBookProposals();

        if (!cancelled) {
          setBookProposals(Array.isArray(items) ? items : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setBookProposalsError(requestError.message);
        }
      } finally {
        if (!cancelled) setBookProposalsLoading(false);
      }
    }

    loadBookProposals();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) {
      setAdminProposals([]);
      setAdminProposalsError("");
      setAdminProposalsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadAdminProposals() {
      try {
        setAdminProposalsLoading(true);
        setAdminProposalsError("");
        const items = await getPendingBookProposals();

        if (!cancelled) {
          setAdminProposals(Array.isArray(items) ? items : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setAdminProposalsError(requestError.message);
        }
      } finally {
        if (!cancelled) setAdminProposalsLoading(false);
      }
    }

    loadAdminProposals();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isLoggedIn]);

  useEffect(() => {
    if (loading || directBookHandled.current || books.length === 0) return;

    const url = new URL(window.location.href);
    const requestedBookId = url.searchParams.get("book");

    if (!requestedBookId) {
      directBookHandled.current = true;
      return;
    }

    const requestedBook = books.find(
      (book) => String(book.id) === String(requestedBookId),
    );

    directBookHandled.current = true;

    if (requestedBook && typeof onSelectBook === "function") {
      onSelectBook(requestedBook);
    }
  }, [books, loading, onSelectBook]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const cleanSearch = search.trim();

    if (cleanSearch) url.searchParams.set("q", cleanSearch);
    else url.searchParams.delete("q");

    url.searchParams.delete("genre");
    if (genreFilters.length) url.searchParams.set("genres", genreFilters.join("|"));
    else url.searchParams.delete("genres");

    if (genreFilters.length > 1 && genreMode === "all") {
      url.searchParams.set("genre_mode", "all");
    } else {
      url.searchParams.delete("genre_mode");
    }

    if (yearFilter) url.searchParams.set("year", yearFilter);
    else url.searchParams.delete("year");

    window.history.replaceState({}, "", url);
  }, [genreFilters, genreMode, search, yearFilter]);

  const publicationYears = useMemo(() => {
    return [...new Set(books
      .map((book) => Number.parseInt(book.year, 10))
      .filter((year) => Number.isInteger(year) && year > 0))]
      .sort((left, right) => right - left);
  }, [books]);

  const genreCounts = useMemo(() => {
    const counts = Object.fromEntries(BOOK_GENRES.map((genre) => [genre, 0]));

    books.forEach((book) => {
      normalizeBookGenres(book.genre).forEach((genre) => {
        counts[genre] = (counts[genre] || 0) + 1;
      });
    });

    return counts;
  }, [books]);

  const availableGenres = useMemo(() => {
    const standard = BOOK_GENRES.filter(
      (genre) => genreCounts[genre] > 0 || genreFilters.includes(genre) || QUICK_BOOK_GENRES.includes(genre),
    );
    const custom = Object.keys(genreCounts)
      .filter((genre) => !BOOK_GENRES.includes(genre) && genreCounts[genre] > 0)
      .sort((left, right) => left.localeCompare(right, "es"));
    return [...standard, ...custom];
  }, [genreCounts, genreFilters]);

  const genreGroupsForPicker = useMemo(() => {
    const customGenres = availableGenres.filter((genre) => !BOOK_GENRES.includes(genre));
    return customGenres.length
      ? [...BOOK_GENRE_GROUPS, { key: "custom", label: "Otros géneros del catálogo", genres: customGenres }]
      : BOOK_GENRE_GROUPS;
  }, [availableGenres]);

  const searchMatchedBooks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return books.filter((book) => bookMatchesSearch(book, normalizedSearch));
  }, [books, search]);

  const filteredBooks = useMemo(() => {
    return searchMatchedBooks
      .filter((book) => {
        const bookGenres = normalizeBookGenres(book.genre);
        const matchesGenre = genreFilters.length === 0
          || (genreMode === "all"
            ? genreFilters.every((genre) => bookGenres.includes(genre))
            : genreFilters.some((genre) => bookGenres.includes(genre)));
        const matchesYear = !yearFilter || String(book.year || "") === yearFilter;
        return matchesGenre && matchesYear;
      })
      .sort((left, right) => {
        const leftYear = Number.parseInt(left.year, 10) || 0;
        const rightYear = Number.parseInt(right.year, 10) || 0;

        if (leftYear !== rightYear) return rightYear - leftYear;

        const titleOrder = String(left.title || "").localeCompare(
          String(right.title || ""),
          "es",
          { sensitivity: "base" },
        );
        if (titleOrder !== 0) return titleOrder;

        return String(left.author || "").localeCompare(
          String(right.author || ""),
          "es",
          { sensitivity: "base" },
        );
      });
  }, [genreFilters, genreMode, searchMatchedBooks, yearFilter]);

  function toggleGenreFilter(genre) {
    setGenreFilters((current) => {
      const key = normalizedGenreText(genre);
      const exists = current.some((item) => normalizedGenreText(item) === key);
      return exists
        ? current.filter((item) => normalizedGenreText(item) !== key)
        : [...current, genre].slice(0, 8);
    });
  }

  function selectQuickGenre(genre) {
    if (!genre) {
      setGenreFilters([]);
      setGenreMode("any");
      return;
    }

    setGenreFilters((current) => (
      current.length === 1 && current[0] === genre ? [] : [genre]
    ));
    setGenreMode("any");
  }

  function updateSearch(value) {
    setSearch(value);
    setExternalResults([]);
    setExternalError("");
    setExternalSearchedQuery("");
    setImportMessage("");
  }

  function clearCatalogFilters() {
    updateSearch("");
    setGenreFilters([]);
    setGenreMode("any");
    setYearFilter("");
  }

  function openBook(book) {
    if (typeof onSelectBook === "function") onSelectBook(book);
  }

  async function approveProposal(book) {
    if (!book?.id || moderatingBookId) return;

    try {
      setModeratingBookId(String(book.id));
      setAdminProposalsError("");
      await approveBookProposal(book.id);

      setAdminProposals((current) =>
        current.filter((item) => String(item.id) !== String(book.id)),
      );

      const refreshedBooks = await getCatalogBooks();
      setBooks(Array.isArray(refreshedBooks) ? refreshedBooks : refreshedBooks?.books || []);
    } catch (requestError) {
      setAdminProposalsError(requestError.message || "No se pudo aprobar la propuesta.");
    } finally {
      setModeratingBookId("");
    }
  }

  async function rejectProposal(book) {
    if (!book?.id || moderatingBookId) return;

    const note = window.prompt(
      `Motivo del rechazo para "${book.title}"`,
      "No encaja todavía con los criterios del catálogo.",
    );

    if (note === null) return;

    try {
      setModeratingBookId(String(book.id));
      setAdminProposalsError("");
      await rejectBookProposal(book.id, note);

      setAdminProposals((current) =>
        current.filter((item) => String(item.id) !== String(book.id)),
      );
    } catch (requestError) {
      setAdminProposalsError(requestError.message || "No se pudo rechazar la propuesta.");
    } finally {
      setModeratingBookId("");
    }
  }
  function startBookCreation() {
    if (!isLoggedIn || typeof onAddBook !== "function") return;
    onAddBook(search.trim());
  }

  function handleCardKeyDown(event, book) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBook(book);
    }
  }

  async function searchOutsideCatalog() {
    const cleanSearch = search.trim();

    if (cleanSearch.length < 2) {
      setExternalError("Escribe al menos dos caracteres para buscar fuera del catálogo.");
      return;
    }

    setExternalLoading(true);
    setExternalError("");
    setExternalResults([]);
    setExternalSearchedQuery(cleanSearch);
    setImportMessage("");

    try {
      const response = await apiFetch(`search.php?q=${encodeURIComponent(cleanSearch)}`);
      const data = await readJsonResponse(response);
      setExternalResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setExternalError(
        "No pudimos consultar Open Library. Puedes intentarlo de nuevo o crear la ficha directamente.",
      );
    } finally {
      setExternalLoading(false);
    }
  }

  async function ensureExternalBook(book, { openAfter = false } = {}) {
    const existingBook = matchingCatalogBook(book, books);
    if (existingBook) {
      if (openAfter) openBook(existingBook);
      return existingBook;
    }

    const key = resultKey(book);
    setImportingKey(key);
    setExternalError("");
    setImportMessage("");

    try {
      const inferredTaxonomy = inferTaxonomyFromSubjects(book?.genres || book?.genre);
      const response = await apiFetch("import_external_book.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...book,
          genres: externalGenres(book),
          ...inferredTaxonomy,
        }),
      });
      const data = await readJsonResponse(response);
      const importedBook = data.book;

      if (!importedBook) {
        throw new Error("No se recibió la ficha importada del libro.");
      }

      if (importedBook.review_status === "approved") {
        setBooks((currentBooks) => {
          const withoutDuplicate = currentBooks.filter(
            (currentBook) => String(currentBook.id) !== String(importedBook.id),
          );
          return [importedBook, ...withoutDuplicate];
        });
      }

      setImportMessage(
        data.already_exists
          ? "Ese libro ya estaba en Librélula."
          : importedBook.review_status === "pending"
            ? "Propuesta enviada a revisión."
            : "Libro incorporado correctamente a Librélula.",
      );

      if (openAfter) openBook(importedBook);
      return importedBook;
    } finally {
      setImportingKey("");
    }
  }

  async function importExternalBook(book) {
    if (!isLoggedIn) return;

    try {
      await ensureExternalBook(book, { openAfter: true });
    } catch (requestError) {
      setExternalError(requestError.message);
    }
  }

  async function saveExternalStatus(book, status) {
    if (!isLoggedIn || importingKey || savingStatusBookId) return;

    const key = resultKey(book);
    setSavingStatusBookId(key);
    setStatusFeedback(null);

    try {
      const importedBook = await ensureExternalBook(book);
      const response = await apiFetch("catalog_user_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: String(importedBook.id), status }),
      });
      const data = await readJsonResponse(response);

      if (data.item) {
        setUserBookItems((current) => ({
          ...current,
          [String(importedBook.id)]: data.item,
        }));
      }

      const label = READING_STATUS_BY_VALUE[status]?.label || "Guardado";
      setStatusFeedback({
        type: "success",
        text: `«${importedBook.title}» se ha guardado como ${label.toLowerCase()}.`,
      });
    } catch (requestError) {
      setStatusFeedback({ type: "error", text: requestError.message });
    } finally {
      setSavingStatusBookId("");
    }
  }

  async function saveCatalogStatus(book, status) {
    const bookId = String(book?.id || "");
    if (!bookId || !isLoggedIn || savingStatusBookId) return;

    const label = READING_STATUS_BY_VALUE[status]?.label || "Guardado";
    setSavingStatusBookId(bookId);
    setStatusFeedback(null);

    try {
      const response = await apiFetch("catalog_user_books.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId, status }),
      });
      const data = await readJsonResponse(response);

      if (data.item) {
        setUserBookItems((current) => ({
          ...current,
          [bookId]: data.item,
        }));
      }

      setStatusFeedback({
        type: "success",
        text: `«${book.title}» se ha añadido como ${label.toLowerCase()}.`,
      });
    } catch (requestError) {
      setStatusFeedback({ type: "error", text: requestError.message });
    } finally {
      setSavingStatusBookId("");
    }
  }

  if (loading) {
    return <div className="catalog-message">Cargando el catálogo…</div>;
  }

  if (error) {
    return <div className="catalog-message is-error" role="alert">{error}</div>;
  }

  const hasSearch = search.trim().length > 0;
  const hasCatalogFilters = Boolean(hasSearch || genreFilters.length || yearFilter);
  const extraGenreFilterCount = genreFilters.filter((genre) => !QUICK_BOOK_GENRES.includes(genre)).length;
  const activeGenreSummary = genreFilters.length
    ? `Géneros activos: ${genreFilters.join(", ")}`
    : "Abrir todos los géneros literarios";
  const noLocalSearchMatch = hasSearch && searchMatchedBooks.length === 0;
  const externalSearchFinished = Boolean(
    externalSearchedQuery && !externalLoading,
  );

  const normalizedGenreSearch = normalizedGenreText(genrePickerSearch);
  const genrePickerPortal = genrePickerOpen && typeof document !== "undefined"
    ? createPortal(
        <div className="catalog-genre-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-genre-title">
          <button
            type="button"
            className="catalog-genre-backdrop"
            aria-label="Cerrar selector de géneros"
            onClick={() => setGenrePickerOpen(false)}
          />
          <section className="catalog-genre-sheet">
            <header>
              <div>
                <span>Filtrar el catálogo</span>
                <h2 id="catalog-genre-title">Géneros literarios</h2>
                <p>Elige uno o varios. Las sensaciones, los temas y la estética no se mezclan aquí.</p>
              </div>
              <button type="button" onClick={() => setGenrePickerOpen(false)} aria-label="Cerrar">×</button>
            </header>

            <label className="catalog-genre-search">
              <span className="sr-only">Buscar género literario</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="search"
                value={genrePickerSearch}
                onChange={(event) => setGenrePickerSearch(event.target.value)}
                placeholder="Buscar género…"
                autoFocus
              />
              {genrePickerSearch && <button type="button" onClick={() => setGenrePickerSearch("")}>×</button>}
            </label>

            <div className="catalog-genre-groups">
              {genreGroupsForPicker.map((group) => {
                const visibleGenres = group.genres.filter((genre) => (
                  availableGenres.includes(genre)
                  && (!normalizedGenreSearch || normalizedGenreText(genre).includes(normalizedGenreSearch))
                ));
                if (!visibleGenres.length) return null;

                return (
                  <section key={group.key}>
                    <h3>{group.label}</h3>
                    <div>
                      {visibleGenres.map((genre) => {
                        const active = genreFilters.includes(genre);
                        return (
                          <button
                            type="button"
                            key={genre}
                            className={active ? "is-selected" : ""}
                            onClick={() => toggleGenreFilter(genre)}
                            aria-pressed={active}
                          >
                            <span>{active ? "✓" : "+"}</span>
                            {genre}
                            <small>{genreCounts[genre] || 0}</small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer>
              <button type="button" className="is-ghost" onClick={() => { setGenreFilters([]); setGenreMode("any"); }}>
                Limpiar
              </button>
              {genreFilters.length > 1 && (
                <label>
                  <input
                    type="checkbox"
                    checked={genreMode === "all"}
                    onChange={(event) => setGenreMode(event.target.checked ? "all" : "any")}
                  />
                  Debe contener todos
                </label>
              )}
              <button type="button" className="is-primary" onClick={() => setGenrePickerOpen(false)}>
                Ver {filteredBooks.length} {filteredBooks.length === 1 ? "libro" : "libros"}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
    <main className="books-page">
      <header className="books-hero">
        <div>
          <span className="catalog-kicker">Biblioteca pública</span>
          <h1>Catálogo de libros</h1>
          <p>
            {filteredBooks.length} {filteredBooks.length === 1 ? "libro" : "libros"}
            {hasCatalogFilters ? " filtrados" : " disponibles"}
          </p>
        </div>

        <div className="catalog-hero-actions">
          <label className="catalog-search">
            <span className="sr-only">Buscar en el catálogo</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="search"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                  && noLocalSearchMatch
                  && search.trim().length >= 2
                ) {
                  event.preventDefault();
                  searchOutsideCatalog();
                }
              }}
              placeholder="Título, autor, ISBN, género o saga"
            />
            {search && (
              <button type="button" onClick={() => updateSearch("")} aria-label="Limpiar búsqueda">×</button>
            )}
          </label>

          <div className="catalog-filter-stack" aria-label="Filtros del catálogo">
            <div className="catalog-quick-genres" aria-label="Géneros literarios frecuentes">
              <span>Géneros</span>
              <button
                type="button"
                className={genreFilters.length === 0 ? "is-active" : ""}
                onClick={() => selectQuickGenre("")}
              >
                Todos
              </button>
              {QUICK_BOOK_GENRES.map((genre) => (
                <button
                  type="button"
                  key={genre}
                  className={genreFilters.includes(genre) ? "is-active" : ""}
                  onClick={() => selectQuickGenre(genre)}
                  aria-pressed={genreFilters.includes(genre)}
                >
                  {genre}
                </button>
              ))}
              <button
                type="button"
                className={`catalog-more-genres${extraGenreFilterCount > 0 ? " is-active" : ""}`}
                onClick={() => setGenrePickerOpen(true)}
                title={activeGenreSummary}
                aria-label={activeGenreSummary}
              >
                Más géneros
                {extraGenreFilterCount > 0 && <small>{extraGenreFilterCount}</small>}
              </button>
            </div>

            <div className="catalog-filter-row is-secondary">
              <label className="catalog-select-filter">
                <span>Año de publicación</span>
                <select
                  value={yearFilter}
                  onChange={(event) => setYearFilter(event.target.value)}
                >
                  <option value="">Todos los años</option>
                  {publicationYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="catalog-clear-filters"
                onClick={clearCatalogFilters}
                disabled={!hasCatalogFilters}
                aria-disabled={!hasCatalogFilters}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      </header>

      {hasSearch && search.trim().length >= 2 && !externalSearchedQuery && (
        <section className="external-search-callout is-compact" aria-labelledby="outside-search-title">
          <div>
            <span className="external-search-kicker">Buscar en Open Library</span>
            <h2 id="outside-search-title">
              {noLocalSearchMatch
                ? "¿Lo buscamos fuera del catálogo?"
                : "¿No ves la edición o el libro que buscas?"}
            </h2>
            <p>
              Consultaremos Open Library y, cuando haga falta, completaremos los resultados con Google Books.
            </p>
          </div>

          <button
            type="button"
            onClick={searchOutsideCatalog}
            disabled={externalLoading || search.trim().length < 2}
          >
            {noLocalSearchMatch ? "Buscar" : "Buscar también"} «{search.trim()}»
          </button>
        </section>
      )}

      {externalLoading && (
        <section className="external-loading-card" aria-live="polite">
          <span className="external-loading-dot" aria-hidden="true" />
          Buscando «{externalSearchedQuery}» fuera de Librélula…
        </section>
      )}

      {importMessage && (
        <p className="external-feedback is-success" role="status">{importMessage}</p>
      )}

      {statusFeedback && (
        <p
          className={`external-feedback ${statusFeedback.type === "error" ? "is-error" : "is-success"}`}
          role={statusFeedback.type === "error" ? "alert" : "status"}
        >
          {statusFeedback.text}
        </p>
      )}

      {isLoggedIn && isAdmin && (
        adminProposalsLoading || adminProposalsError || adminProposals.length > 0
      ) && (
        <section className="book-proposals-panel admin-proposals-panel" aria-labelledby="admin-proposals-title">
          <div className="book-proposals-heading">
            <div>
              <span className="external-search-kicker">Moderación</span>
              <h2 id="admin-proposals-title">Propuestas pendientes</h2>
              <p>
                Revisa las fichas enviadas por lectoras antes de publicarlas en el catálogo.
              </p>
            </div>
          </div>

          {adminProposalsLoading && (
            <p className="book-proposals-muted">Cargando propuestas pendientes…</p>
          )}

          {adminProposalsError && (
            <p className="external-feedback is-error" role="alert">{adminProposalsError}</p>
          )}

          {!adminProposalsLoading && !adminProposalsError && adminProposals.length > 0 && (
            <div className="admin-proposals-list">
              {adminProposals.map((proposal) => {
                const isModerating = String(moderatingBookId) === String(proposal.id);
                const isExpanded = String(expandedAdminProposalId) === String(proposal.id);
                const proposalText =
                  proposal.description ||
                  proposal.summary ||
                  proposal.synopsis ||
                  proposal.notes ||
                  proposal.review ||
                  "";

                return (
                  <article className="admin-proposal-card" key={proposal.id}>
                    <div className="book-proposal-cover">
                      {proposal.cover ? (
                        <img
                          src={publicUrl(proposal.cover)}
                          alt={`Portada de ${proposal.title}`}
                          loading="lazy"
                        />
                      ) : (
                        <span>Sin portada</span>
                      )}
                    </div>

                    <div className="admin-proposal-main">
                      <span className="book-proposal-badge">Pendiente</span>
                      <h3>{proposal.title}</h3>
                      <p>{proposal.author || "Autor desconocido"}</p>
                      {proposalText && (
                        <small>{proposalText.slice(0, 180)}{proposalText.length > 180 ? "…" : ""}</small>
                      )}

                      {isExpanded && (
                        <dl className="admin-proposal-details">
                          <div>
                            <dt>ID</dt>
                            <dd>{proposal.id}</dd>
                          </div>
                          <div>
                            <dt>Año</dt>
                            <dd>{proposal.year || "Sin año"}</dd>
                          </div>
                          <div>
                            <dt>Origen</dt>
                            <dd>{proposal.provider || "Manual"}</dd>
                          </div>
                          <div>
                            <dt>Estado</dt>
                            <dd>{proposal.review_status}</dd>
                          </div>
                          {proposalText && (
                            <div className="admin-proposal-details-wide">
                              <dt>Texto enviado</dt>
                              <dd>{proposalText}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>

                    <div className="admin-proposal-actions">
                      <button
                        type="button"
                        className="admin-proposal-view"
                        onClick={(event) => {
                          event.preventDefault();
                          setExpandedAdminProposalId((current) =>
                            String(current) === String(proposal.id) ? "" : String(proposal.id),
                          );
                        }}
                      >
                        {isExpanded ? "Ocultar ficha" : "Ver ficha"}
                      </button>
                      <button
                        type="button"
                        className="admin-proposal-approve"
                        onClick={(event) => {
                          event.preventDefault();
                          approveProposal(proposal);
                        }}
                        disabled={isModerating}
                      >
                        {isModerating ? "Guardando…" : "Aprobar"}
                      </button>
                      <button
                        type="button"
                        className="admin-proposal-reject"
                        onClick={(event) => {
                          event.preventDefault();
                          rejectProposal(proposal);
                        }}
                        disabled={isModerating}
                      >
                        Rechazar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isLoggedIn && !isAdmin && (
        bookProposalsLoading || bookProposalsError || bookProposals.length > 0
      ) && (
        <section className="book-proposals-panel" aria-labelledby="book-proposals-title">
          <div className="book-proposals-heading">
            <div>
              <span className="external-search-kicker">Tus propuestas</span>
              <h2 id="book-proposals-title">Libros en revisión</h2>
              <p>
                Estas fichas ya se han enviado, pero todavía no aparecen en el catálogo público.
              </p>
            </div>
          </div>

          {bookProposalsLoading && (
            <p className="book-proposals-muted">Cargando tus propuestas…</p>
          )}

          {bookProposalsError && (
            <p className="external-feedback is-error" role="alert">{bookProposalsError}</p>
          )}

          {!bookProposalsLoading && !bookProposalsError && bookProposals.length > 0 && (
            <div className="book-proposals-list">
              {bookProposals.map((proposal) => (
                <article className="book-proposal-card" key={proposal.id}>
                  <div className="book-proposal-cover">
                    {proposal.cover ? (
                      <img
                        src={publicUrl(proposal.cover)}
                        alt={`Portada de ${proposal.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <span>Sin portada</span>
                    )}
                  </div>

                  <div>
                    <span className={`book-proposal-badge is-${proposal.review_status}`}>
                      {proposal.review_status === "rejected" ? "Rechazada" : "En revisión"}
                    </span>
                    <h3>{proposal.title}</h3>
                    <p>{proposal.author || "Autor desconocido"}</p>
                    {proposal.moderation_note && (
                      <small>{proposal.moderation_note}</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {externalSearchFinished && externalResults.length > 0 && !externalError && (
        <section className="external-results" aria-labelledby="external-results-title">
          <div className="external-results-heading">
            <div>
              <span className="external-search-kicker">Open Library y otras fuentes</span>
              <h2 id="external-results-title">
                {externalResults.length} {externalResults.length === 1 ? "opción" : "opciones"} para «{externalSearchedQuery}»
              </h2>
            </div>
          </div>

          <div className="external-results-grid">
            {externalResults.map((book) => {
              const key = resultKey(book);
              const importing = importingKey === key;
              const genres = normalizeBookGenres(book.genres || book.genre);
              const catalogMatch = matchingCatalogBook(book, books);
              const catalogBookId = catalogMatch ? String(catalogMatch.id) : "";
              const currentStatus = catalogBookId
                ? userBookItems[catalogBookId]?.status || ""
                : "";
              const savingExternalStatus = savingStatusBookId === key
                || (catalogBookId && savingStatusBookId === catalogBookId);

              return (
                <article className="external-book-card" key={key}>
                  <div className="external-book-cover">
                    {book.cover ? (
                      <img src={book.cover} alt={`Portada de ${book.title}`} loading="lazy" />
                    ) : (
                      <span>Sin portada</span>
                    )}
                  </div>

                  <div className="external-book-info">
                    <span className="external-provider">{providerLabel(book)}</span>
                    <h3>{book.title}</h3>
                    <p className="external-author">{book.author || "Autor desconocido"}</p>

                    <div className="external-meta">
                      {book.year && <span>{book.year}</span>}
                      {book.pages && <span>{book.pages} págs.</span>}
                    </div>

                    {genres.length > 0 && (
                      <div className="external-genres" aria-label="Géneros">
                        {genres.slice(0, 4).map((genre) => (
                          <span key={genre}>{genre}</span>
                        ))}
                        {genres.length > 4 && <span>+{genres.length - 4}</span>}
                      </div>
                    )}

                    <div className="external-book-actions">
                      <ReadingStatusControl
                        currentStatus={currentStatus}
                        isLoggedIn={isLoggedIn}
                        loading={userBooksLoading}
                        saving={Boolean(importing || savingExternalStatus)}
                        emptyLabel="+ Guardar en mi biblioteca"
                        onSelect={(status) => {
                          if (catalogMatch) {
                            saveCatalogStatus(catalogMatch, status);
                          } else {
                            saveExternalStatus(book, status);
                          }
                        }}
                      />

                      {isLoggedIn && !catalogMatch && (
                        <button
                          type="button"
                          className="external-import-only"
                          onClick={() => importExternalBook(book)}
                          disabled={Boolean(importingKey || savingStatusBookId)}
                        >
                          {importing
                            ? "Añadiendo…"
                            : isAdmin
                              ? "Añadir solo al catálogo"
                              : "Proponer al catálogo"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {isLoggedIn && (
            <div className="external-results-footer">
              <div>
                <strong>¿No es ninguno de estos?</strong>
                <span>
                  {isAdmin
                    ? "Crea una ficha y complétala manualmente o pegando los datos de Goodreads."
                    : "Propón una ficha y una administradora la revisará antes de publicarla."}
                </span>
              </div>
              <button type="button" onClick={startBookCreation}>
                {isAdmin ? "Crear libro" : "Proponer libro"}
              </button>
            </div>
          )}
        </section>
      )}

      {externalSearchFinished && (externalResults.length === 0 || externalError) && (
        <section className="external-fallback" aria-labelledby="create-missing-book-title">
          <span className="external-fallback-icon" aria-hidden="true">＋</span>
          <div>
            <span className="external-search-kicker">No lo hemos encontrado</span>
            <h2 id="create-missing-book-title">Crea la ficha de «{externalSearchedQuery}»</h2>
            <p>
              {externalError || "No hay resultados externos para esta búsqueda."}
              {isLoggedIn && (
                isAdmin
                  ? " Podrás rellenarla a mano o completar los campos pegando una ficha de Goodreads."
                  : " Puedes proponerla para revisión."
              )}
            </p>
          </div>
          {isLoggedIn && (
            <button type="button" onClick={startBookCreation}>
              {isAdmin ? "Crear libro" : "Proponer libro"}
            </button>
          )}
        </section>
      )}

      {filteredBooks.length === 0 ? (
        !noLocalSearchMatch && (
          <section className="catalog-empty">
            <span>📚</span>
            <h2>No hay libros con estos filtros</h2>
            <p>
              Cambia los géneros, el año o la búsqueda para ver más resultados.
            </p>
            <div className="catalog-empty-actions">
              <button type="button" className="is-ghost" onClick={clearCatalogFilters}>
                Ver catálogo completo
              </button>
            </div>
          </section>
        )
      ) : (
        <section className="books-grid">
          {filteredBooks.map((book) => {
            const genres = normalizeBookGenres(book.genre);
            const userBook = isLoggedIn
              ? userBookItems[String(book.id)] || null
              : null;
            const currentStatus = userBook?.status || "";
            const currentStatusLabel = READING_STATUS_BY_VALUE[currentStatus]?.label || "";

            return (
              <article
                className="book-card"
                key={book.id}
                role="button"
                tabIndex={0}
                onClick={() => openBook(book)}
                onKeyDown={(event) => handleCardKeyDown(event, book)}
              >
                <div className="book-cover">
                  {book.cover ? (
                    <img
                      src={publicUrl(book.cover)}
                      alt={`Portada de ${book.title}`}
                      loading="lazy"
                    />
                  ) : (
                    <span>Sin portada</span>
                  )}
                  {book.saga_name && <small className="book-saga">{book.saga_name}</small>}
                  {currentStatusLabel && (
                    <span className={`book-status-badge status-${currentStatus}`}>
                      {currentStatusLabel}
                    </span>
                  )}
                </div>

                <div className="book-card-body">
                  {genres.length > 0 && (
                    <div className="book-genres-list" aria-label="Géneros">
                      {genres.slice(0, 3).map((genre) => (
                        <span className="book-genre" key={genre}>{genre}</span>
                      ))}
                      {genres.length > 3 && (
                        <span className="book-genre is-more">+{genres.length - 3}</span>
                      )}
                    </div>
                  )}
                  <h2>{book.title}</h2>
                  <p className="book-author">{book.author || "Autor desconocido"}</p>

                  <div className="book-meta">
                    {book.year && <span>{book.year}</span>}
                    {book.pages && <span>{book.pages} págs.</span>}
                  </div>

                  <div className="book-card-actions">
                    <ReadingStatusControl
                      currentStatus={currentStatus}
                      isLoggedIn={isLoggedIn}
                      loading={userBooksLoading}
                      saving={savingStatusBookId === String(book.id)}
                      onSelect={(status) => saveCatalogStatus(book, status)}
                    />

                    <div className="book-resources">
                      {isAdmin && book.pdf_file && (
                        <a
                          href={publicUrl(book.pdf_file)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          PDF
                        </a>
                      )}
                      {isAdmin && book.epub_file && (
                        <a
                          href={publicUrl(book.epub_file)}
                          download
                          onClick={(event) => event.stopPropagation()}
                        >
                          EPUB
                        </a>
                      )}
                      <strong>Ver ficha →</strong>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
    {genrePickerPortal}
    </>
  );
}
