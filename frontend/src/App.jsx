import { useEffect, useRef, useState } from "react";
import "./Navbar.css";
import Inicio from "./Inicio.jsx";
import BookDetail from "./BookDetail.jsx";
import BooksCatalog from "./BooksCatalog.jsx";
import MiBiblioteca from "./MiBiblioteca.jsx";
import MisResenas from "./MisResenas.jsx";
import PerfilSupabase from "./PerfilSupabase.jsx";
import LoginSupabase from "./LoginSupabase.jsx";
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
import {
  EMPTY_SUPABASE_SESSION,
  getSupabaseAppSession,
  onSupabaseAuthChange,
  signOutSupabase,
} from "./lib/session.js";

const EMPTY_SESSION = EMPTY_SUPABASE_SESSION;

export default function App() {
  const [page, setPage] = useState("home");
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
  const defaultAvatar = publicUrl("images/avatar/avatar1.png");
  const avatarUrl =
    avatarValue === "" || avatarValue === "default.jpg"
      ? defaultAvatar
      : publicUrl(avatarValue);

useEffect(() => {
    function closeUserMenu(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeUserMenu);
    return () => document.removeEventListener("pointerdown", closeUserMenu);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const nextSession = await getSupabaseAppSession();

        if (!cancelled) {
          setSession(nextSession);
        }
      } catch {
        if (!cancelled) {
          setSession(EMPTY_SESSION);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    loadSession();

    const unsubscribe = onSupabaseAuthChange((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
        setSessionLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
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

  function openHome() {

    closeNavigation();

    updateBookQuery();

    setSelectedBook(null);

    setSelectedSaga(null);

    setNewBookTitle("");

    setDetailBackPage("catalog");

    setPage("home");

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

  function openProfile() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("profile");
  }

  function openLibrary() {
    if (!isLoggedIn) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("library");
    setPage("library");
  }

  function openMyReviews() {
    if (!isLoggedIn) return;
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("my-reviews");
    setPage("my-reviews");
  }

  function openLogin() {
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("catalog");
    setPage("login");
  }

  function handleLoginSuccess(nextSession) {
    setSession(nextSession);
    closeNavigation();
    updateBookQuery();
    setSelectedBook(null);
    setSelectedSaga(null);
    setNewBookTitle("");
    setDetailBackPage("library");
    setPage("library");
  }

  async function handleSignOut() {
    await signOutSupabase();
    setSession(EMPTY_SESSION);
    openHome();
  }

  function openAddBook(initialTitle = "") {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

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
    setSelectedSaga(null);
    setNewBookTitle("");

    if (createdBook?.review_status === "pending") {
      setSelectedBook(null);
      setDetailBackPage("catalog");
      updateBookQuery();
      setPage("catalog");
      return;
    }

    setSelectedBook(createdBook);
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

    if (detailBackPage === "library") {
      updateBookQuery();
      setPage("library");
      return;
    }

    if (detailBackPage === "my-reviews") {
      updateBookQuery();
      setPage("my-reviews");
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
              onClick={(event) => {
                event.preventDefault();
                openHome();
              }}
            aria-label="Ir al inicio de Librélula"
          >
            <img src={publicUrl("images/librelula-font.png")} alt="Librélula" />
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
              <button
              type="button"
              className={page === "home" ? "is-active" : ""}
              onClick={openHome}
            >
              Inicio
            </button>
              <button
                type="button"
                className={["catalog", "detail", "saga"].includes(page) && !["library", "my-reviews"].includes(detailBackPage) ? "is-active" : ""}
                onClick={openCatalog}
              >
                Catálogo
              </button>

              {isLoggedIn && (
                <>
                  <button
                    type="button"
                    className={page === "profile" ? "is-active" : ""}
                    onClick={openProfile}
                  >
                    Mi rincón
                  </button>
                  <button
                    type="button"
                    className={page === "library" ? "is-active" : ""}
                    onClick={openLibrary}
                  >
                    Mi biblioteca
                  </button>
                  <button
                    type="button"
                    className={page === "my-reviews" || (page === "detail" && detailBackPage === "my-reviews") ? "is-active" : ""}
                    onClick={openMyReviews}
                  >
                    Mis reseñas
                  </button>
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
                    <button type="button" onClick={openProfile}>
                      Mi rincón
                    </button>
                    <button type="button" onClick={openLibrary}>
                      Mi biblioteca
                    </button>
                    <button type="button" onClick={openMyReviews}>
                      Mis reseñas
                    </button>
                    <button type="button" onClick={openCatalog}>
                      Explorar catálogo
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => openAddBook()}>
                        Añadir un libro
                      </button>
                    )}
                    <div className="dropdown-divider" />
                    <button type="button" onClick={handleSignOut}>
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}

              {!sessionLoading && !isLoggedIn && (
                <button type="button" className="btn-signin" onClick={openLogin}>
                  Iniciar sesión
                </button>
              )}
            </div>
          </div>
        </nav>
      </header>

      <div className="catalog-content">

        {sessionLoading && (
          <section className="lector-empty-state">
            <h3>Cargando tu sesión…</h3>
            <p>Estamos preparando tu rincón lector.</p>
          </section>
        )}

{!sessionLoading && page === "home" && (
          <Inicio
            isLoggedIn={isLoggedIn}
            onExplore={openCatalog}
            onLogin={openLogin}
            onProfile={openProfile}
            onLibrary={openLibrary}
            onReviews={openMyReviews}
          />
        )}

        {!sessionLoading && page === "catalog" && (
          <BooksCatalog
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
            onAddBook={openAddBook}
            onSelectBook={(book) => openBookDetail(book, "catalog")}
          />
        )}

        {!sessionLoading && page === "profile" && isLoggedIn && (
          <PerfilSupabase onOpenLibrary={openLibrary} onOpenCatalog={openCatalog} />
        )}

        {!sessionLoading && page === "library" && isLoggedIn && (
          <MiBiblioteca
            onOpenCatalog={openCatalog}
            onSelectBook={(book) => openBookDetail(book, "library")}
          />
        )}

        {!sessionLoading && page === "my-reviews" && isLoggedIn && (
          <MisResenas
            onOpenCatalog={openCatalog}
            onSelectBook={(book) => openBookDetail(book, "my-reviews")}
          />
        )}

        {!sessionLoading && page === "login" && !isLoggedIn && (
          <LoginSupabase
            onLoginSuccess={handleLoginSuccess}
            onOpenCatalog={openCatalog}
          />
        )}

        {!sessionLoading && page === "add-book" && isLoggedIn && (
          <GoodreadsImport
            initialTitle={newBookTitle}
            isAdmin={isAdmin}
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
            onOpenMyReviews={openMyReviews}
            isAdmin={isAdmin}
            isLoggedIn={isLoggedIn}
          />
        )}

        {!sessionLoading && page === "edit" && isAdmin && (
          <EditBook
            key={selectedBook?.id || "edit"}
            book={selectedBook}
            onCancel={() => setPage("detail")}
            onSaved={handleBookUpdated}
          />
        )}

        {!sessionLoading && page === "saga" && selectedSaga && (
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


