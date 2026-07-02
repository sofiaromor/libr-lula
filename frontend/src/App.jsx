import { useEffect, useRef, useState } from "react";
import "./Navbar.css";
import BookDetail from "./BookDetail.jsx";
import BooksCatalog from "./BooksCatalog.jsx";
import EditBook from "./EditBook.jsx";
import GoodreadsImport from "./GoodreadsImport.jsx";
import SagaBooks from "./SagaBooks.jsx";
import {
  apiFetch,
  appUrl,
  publicUrl,
  readJsonResponse,
  setCsrfToken,
} from "./api.js";

const EMPTY_SESSION = {
  authenticated: false,
  is_admin: false,
  user: null,
  csrf_token: null,
};

export default function App() {
  const [page, setPage] = useState("catalog");
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [detailBackPage, setDetailBackPage] = useState("catalog");
  const [newBookTitle, setNewBookTitle] = useState("");
  const [session, setSession] = useState(EMPTY_SESSION);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const isAdmin = Boolean(session.is_admin);
  const isLoggedIn = Boolean(session.authenticated);
  const username = session.user?.username || "Mi perfil";
  const avatarValue = String(session.user?.avatar || "").trim();
  const defaultAvatar = appUrl("images/avatar/avatar1.png");
  const avatarUrl =
    avatarValue === "" || avatarValue === "default.jpg"
      ? defaultAvatar
      : publicUrl(avatarValue);

  useEffect(() => {
    let cancelled = false;

    async function initialSessionLoad() {
      try {
        const response = await apiFetch("session.php");
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setSession(data);
          setCsrfToken(data.csrf_token || "");
        }
      } catch {
        if (!cancelled) {
          setSession(EMPTY_SESSION);
          setCsrfToken("");
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    initialSessionLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function refreshSessionOnFocus() {
      try {
        const response = await apiFetch("session.php");
        const data = await readJsonResponse(response);
        setSession(data);
        setCsrfToken(data.csrf_token || "");
      } catch {
        setSession(EMPTY_SESSION);
        setCsrfToken("");
      }
    }

    window.addEventListener("focus", refreshSessionOnFocus);
    return () => window.removeEventListener("focus", refreshSessionOnFocus);
  }, []);

  useEffect(() => {
    function closeUserMenu(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeUserMenu);
    return () => document.removeEventListener("pointerdown", closeUserMenu);
  }, []);

  function closeNavigation() {
    setNavOpen(false);
    setUserMenuOpen(false);
  }

  function updateBookQuery(bookId = null) {
    const url = new URL(window.location.href);

    if (bookId) {
      url.searchParams.set("book", String(bookId));
      url.searchParams.delete("q");
    } else {
      url.searchParams.delete("book");
    }

    window.history.replaceState({}, "", url);
  }

  function openCatalog() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("catalog");
  }

  function openAddBook(initialTitle = "") {
    if (!isAdmin) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle(String(initialTitle || "").trim());
    setPage("add-book");
  }

  function openBookDetail(book, backPage = "catalog") {
    closeNavigation();
    updateBookQuery(book?.id || null);
    setSelectedBook(book);
    setDetailBackPage(backPage);
    setPage("detail");
  }

  function openEditBook(book) {
    if (!isAdmin) return;
    closeNavigation();
    setSelectedBook(book);
    setPage("edit");
  }

  function handleBookUpdated(updatedBook) {
    setSelectedBook(updatedBook);
    setPage("detail");
  }

  function handleBookCreated(createdBook) {
    setSelectedBook(createdBook);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("catalog");
    updateBookQuery(createdBook?.id || null);
    setPage("detail");
  }

  function openSaga(sagaKey, sagaName) {
    if (!sagaKey) return;
    closeNavigation();
    updateBookQuery();
    setSelectedSaga({ key: sagaKey, name: sagaName });
    setPage("saga");
  }

  function backFromDetail() {
    if (detailBackPage === "saga" && selectedSaga) {
      updateBookQuery();
      setPage("saga");
      return;
    }
    openCatalog();
  }

  function backFromSaga() {
    if (selectedBook) {
      updateBookQuery(selectedBook.id);
      setPage("detail");
      return;
    }
    openCatalog();
  }

  return (
    <div className="catalog-app">
      <header className="site-header">
        <nav className="site-nav" aria-label="Navegación principal">
          <a
            className="site-brand"
            href={appUrl("index.php")}
            aria-label="Ir al inicio de Librélula"
          >
            <img src={appUrl("images/librelula-font.png")} alt="Librélula" />
          </a>

          <button
            className="site-nav-toggle"
            type="button"
            aria-expanded={navOpen}
            aria-controls="site-nav-panel"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
            <span className="sr-only">Abrir menú</span>
          </button>

          <div
            className={`site-nav-panel${navOpen ? " is-open" : ""}`}
            id="site-nav-panel"
          >
            <div className="site-nav-links">
              <a href={appUrl("index.php")}>Inicio</a>
              <button
                type="button"
                className="is-active"
                onClick={openCatalog}
              >
                Catálogo
              </button>

              {isLoggedIn && (
                <>
                  <a href={appUrl("perfil.php")}>Mi rincón</a>
                  <a href={appUrl("biblioteca.php")}>Mi biblioteca</a>
                  <a href={appUrl("mis_resenas.php")}>Mis reseñas</a>
                </>
              )}
            </div>

            <div className="site-nav-actions">
              {!sessionLoading && isLoggedIn && (
                <div className="user-menu" ref={userMenuRef}>
                  <button
                    className="user-btn"
                    type="button"
                    aria-expanded={userMenuOpen}
                    aria-controls="catalog-user-dropdown"
                    onClick={() => setUserMenuOpen((open) => !open)}
                  >
                    <img
                      src={avatarUrl}
                      alt={`Avatar de ${username}`}
                      className="user-avatar"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = defaultAvatar;
                      }}
                    />
                    <span>{username}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  <div
                    className={`dropdown-menu${userMenuOpen ? " show" : ""}`}
                    id="catalog-user-dropdown"
                  >
                    <a href={appUrl("perfil.php")}>Mi rincón</a>
                    <a href={appUrl("biblioteca.php")}>Mi biblioteca</a>
                    <a href={appUrl("mis_resenas.php")}>Mis reseñas</a>
                    <button type="button" onClick={openCatalog}>
                      Explorar catálogo
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => openAddBook()}>
                        Añadir un libro
                      </button>
                    )}
                    <div className="dropdown-divider" />
                    <a href={appUrl("logout.php")}>Cerrar sesión</a>
                  </div>
                </div>
              )}

              {!sessionLoading && !isLoggedIn && (
                <a href={appUrl("login.php")} className="btn-signin">
                  Iniciar sesión
                </a>
              )}
            </div>
          </div>
        </nav>
      </header>

      <div className="catalog-content">
        {page === "catalog" && (
          <BooksCatalog
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            onAddBook={openAddBook}
            onSelectBook={(book) => openBookDetail(book, "catalog")}
          />
        )}

        {page === "add-book" && isAdmin && (
          <GoodreadsImport
            initialTitle={newBookTitle}
            onCancel={openCatalog}
            onCreated={handleBookCreated}
          />
        )}

        {page === "detail" && (
          <BookDetail
            key={selectedBook?.id || "detail"}
            book={selectedBook}
            onBack={backFromDetail}
            onEdit={openEditBook}
            onOpenSaga={openSaga}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
          />
        )}

        {page === "edit" && isAdmin && (
          <EditBook
            key={selectedBook?.id || "edit"}
            book={selectedBook}
            onCancel={() => setPage("detail")}
            onSaved={handleBookUpdated}
          />
        )}

        {page === "saga" && selectedSaga && (
          <SagaBooks
            sagaKey={selectedSaga.key}
            sagaName={selectedSaga.name}
            onBack={backFromSaga}
            onSelectBook={(book) => openBookDetail(book, "saga")}
          />
        )}
      </div>
    </div>
  );
}
