import { useEffect, useMemo, useState } from "react";
import { publicUrl } from "./api.js";
import {
  COLLECTION_ACCENT_OPTIONS,
  deleteLibraryCollection,
  getProfileCollections,
  saveLibraryCollection,
  setCollectionFollow,
} from "./lib/libraryCollections.js";
import "./ProfileCollections.css";

function coverUrl(path) {
  const value = String(path || "").trim();
  if (!value) return publicUrl("images/librelula.png");
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) return value;
  return publicUrl(value);
}

function emptyDraft() {
  return {
    id: "",
    name: "",
    description: "",
    accentColor: COLLECTION_ACCENT_OPTIONS[0],
    visibility: "public",
    bookIds: [],
  };
}

function CollectionPreview({ collection, onSelectBook }) {
  const visible = (collection.books || []).slice(0, 5);

  return (
    <div className="profile-collection-preview" aria-label={`Libros de ${collection.name}`}>
      <div className="profile-collection-books">
        {visible.length ? visible.map((book, index) => (
          <button
            type="button"
            key={book.id || book.book_id}
            className="profile-collection-book"
            style={{ "--collection-book-index": index }}
            onClick={() => onSelectBook?.(book)}
            title={book.title}
          >
            <img
              src={coverUrl(book.cover)}
              alt={`Portada de ${book.title || "libro"}`}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = publicUrl("images/librelula.png");
              }}
            />
          </button>
        )) : (
          <div className="profile-collection-empty-books">
            <span>✦</span>
            <small>Esta balda espera sus primeros libros</small>
          </div>
        )}
      </div>
      <div className="profile-collection-wood" aria-hidden="true" />
    </div>
  );
}

function CollectionCard({ collection, isOwner, onEdit, onDelete, onFollow, onSelectBook, busy }) {
  return (
    <article
      className="profile-collection-card"
      style={{ "--collection-accent": collection.accent_color || COLLECTION_ACCENT_OPTIONS[0] }}
    >
      <header>
        <div>
          <span className="profile-collection-visibility">
            {collection.visibility === "public" ? "Pública" : "Privada"}
          </span>
          <h3>{collection.name}</h3>
          {collection.description ? <p>{collection.description}</p> : null}
        </div>
        {isOwner ? (
          <div className="profile-collection-owner-actions">
            <button type="button" onClick={() => onEdit(collection)} aria-label={`Editar ${collection.name}`}>✎</button>
            <button type="button" onClick={() => onDelete(collection)} aria-label={`Eliminar ${collection.name}`}>×</button>
          </div>
        ) : null}
      </header>

      <CollectionPreview collection={collection} onSelectBook={onSelectBook} />

      <footer>
        <div>
          <strong>{collection.books?.length || 0}</strong>
          <span>{collection.books?.length === 1 ? "libro" : "libros"}</span>
          {collection.visibility === "public" ? (
            <>
              <i aria-hidden="true">·</i>
              <strong>{collection.follower_count || 0}</strong>
              <span>{collection.follower_count === 1 ? "seguidor" : "seguidores"}</span>
            </>
          ) : null}
        </div>
        {!isOwner && collection.visibility === "public" ? (
          <button
            type="button"
            className={`profile-collection-follow ${collection.followed_by_viewer ? "is-following" : ""}`}
            disabled={busy}
            onClick={() => onFollow(collection)}
          >
            {collection.followed_by_viewer ? "Siguiendo" : "Seguir"}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function CollectionEditor({ draft, shelfBooks, onChange, onClose, onSave, saving }) {
  const [bookSearch, setBookSearch] = useState("");
  const normalizedSearch = bookSearch.trim().toLocaleLowerCase("es");
  const selected = new Set(draft.bookIds || []);
  const visibleBooks = (shelfBooks || []).filter((book) => {
    if (!normalizedSearch) return true;
    return `${book.title || ""} ${book.author || ""}`.toLocaleLowerCase("es").includes(normalizedSearch);
  });

  function toggleBook(bookId) {
    const next = new Set(selected);
    if (next.has(bookId)) next.delete(bookId);
    else next.add(bookId);
    onChange({ ...draft, bookIds: [...next] });
  }

  return (
    <div className="collection-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="collection-editor" role="dialog" aria-modal="true" aria-labelledby="collection-editor-title">
        <header>
          <div>
            <span className="profile-eyebrow">Tu selección</span>
            <h2 id="collection-editor-title">{draft.id ? "Editar colección" : "Nueva colección"}</h2>
            <p>Crea una balda con personalidad propia y decide si quieres compartirla.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
        </header>

        <div className="collection-editor-fields">
          <label className="is-wide">
            <span>Nombre</span>
            <input
              value={draft.name}
              maxLength={80}
              placeholder="Ej. Otoño cozy"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="is-wide">
            <span>Descripción</span>
            <textarea
              value={draft.description}
              maxLength={280}
              rows={3}
              placeholder="Qué une a estos libros…"
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </label>
          <fieldset className="collection-color-field">
            <legend>Color de la balda</legend>
            <div>
              {COLLECTION_ACCENT_OPTIONS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={draft.accentColor === color ? "is-selected" : ""}
                  style={{ "--swatch": color }}
                  onClick={() => onChange({ ...draft, accentColor: color })}
                  aria-label={`Elegir color ${color}`}
                  aria-pressed={draft.accentColor === color}
                />
              ))}
            </div>
          </fieldset>
          <label>
            <span>Visibilidad</span>
            <select value={draft.visibility} onChange={(event) => onChange({ ...draft, visibility: event.target.value })}>
              <option value="public">Pública · aparece en mi perfil</option>
              <option value="private">Privada · solo para mí</option>
            </select>
          </label>
        </div>

        <div className="collection-book-picker">
          <div className="collection-book-picker-heading">
            <div>
              <strong>Libros</strong>
              <small>{selected.size} seleccionados</small>
            </div>
            <input
              type="search"
              value={bookSearch}
              onChange={(event) => setBookSearch(event.target.value)}
              placeholder="Buscar en mi biblioteca"
            />
          </div>

          <div className="collection-book-options">
            {visibleBooks.length ? visibleBooks.map((book) => {
              const bookId = String(book.id || book.book_id || "");
              const isSelected = selected.has(bookId);
              return (
                <button
                  type="button"
                  key={bookId}
                  className={isSelected ? "is-selected" : ""}
                  onClick={() => toggleBook(bookId)}
                  aria-pressed={isSelected}
                >
                  <img src={coverUrl(book.cover)} alt="" />
                  <span>
                    <strong>{book.title || "Libro sin título"}</strong>
                    <small>{book.author || "Autor desconocido"}</small>
                  </span>
                  <i>{isSelected ? "✓" : "+"}</i>
                </button>
              );
            }) : (
              <p>No encontramos libros con esa búsqueda.</p>
            )}
          </div>
        </div>

        <footer>
          <button type="button" className="profile-button secondary" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="button" className="profile-button primary" disabled={saving || !draft.name.trim()} onClick={onSave}>
            {saving ? "Guardando…" : "Guardar colección"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function ProfileCollections({ profileId, isOwner, shelfBooks, onSelectBook }) {
  const [state, setState] = useState({ loading: true, available: true, collections: [], error: "" });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function reload() {
    try {
      const result = await getProfileCollections(profileId);
      setState({ loading: false, available: result.available, collections: result.collections, error: "" });
    } catch (error) {
      setState({ loading: false, available: true, collections: [], error: error?.message || "No se pudieron cargar las colecciones." });
    }
  }

  useEffect(() => {
    let cancelled = false;
    getProfileCollections(profileId)
      .then((result) => {
        if (!cancelled) setState({ loading: false, available: result.available, collections: result.collections, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, available: true, collections: [], error: error?.message || "No se pudieron cargar las colecciones." });
      });
    return () => { cancelled = true; };
  }, [profileId]);

  const publicCount = useMemo(
    () => state.collections.filter((collection) => collection.visibility === "public").length,
    [state.collections],
  );

  function startCreate() {
    setDraft(emptyDraft());
  }

  function startEdit(collection) {
    setDraft({
      id: collection.id,
      name: collection.name || "",
      description: collection.description || "",
      accentColor: collection.accent_color || COLLECTION_ACCENT_OPTIONS[0],
      visibility: collection.visibility || "private",
      bookIds: (collection.books || []).map((book) => String(book.id || book.book_id || "")).filter(Boolean),
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveLibraryCollection(draft);
      setDraft(null);
      await reload();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo guardar la colección." }));
    } finally {
      setSaving(false);
    }
  }

  async function removeCollection(collection) {
    if (!window.confirm(`¿Eliminar “${collection.name}”? Los libros seguirán en tu biblioteca.`)) return;
    setBusyId(collection.id);
    try {
      await deleteLibraryCollection(collection.id);
      await reload();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo eliminar la colección." }));
    } finally {
      setBusyId("");
    }
  }

  async function toggleFollow(collection) {
    setBusyId(collection.id);
    try {
      await setCollectionFollow(collection.id, !collection.followed_by_viewer);
      setState((current) => ({
        ...current,
        collections: current.collections.map((item) => item.id === collection.id
          ? {
              ...item,
              followed_by_viewer: !item.followed_by_viewer,
              follower_count: Math.max(0, Number(item.follower_count || 0) + (item.followed_by_viewer ? -1 : 1)),
            }
          : item),
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "No se pudo actualizar el seguimiento." }));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="profile-collections-view" id="profile-panel-collections" role="tabpanel">
      <header className="profile-collections-intro">
        <div>
          <span className="profile-eyebrow">Estanterías con historia</span>
          <h2>Colecciones</h2>
          <p>
            {isOwner
              ? "Agrupa libros por mood, género o recuerdo y decide qué baldas quieres compartir."
              : "Una selección de baldas creadas por esta lectora."}
          </p>
        </div>
        <div className="profile-collections-intro-actions">
          <span>{publicCount} {publicCount === 1 ? "pública" : "públicas"}</span>
          {isOwner ? <button type="button" onClick={startCreate}>+ Nueva colección</button> : null}
        </div>
      </header>

      {state.error ? <p className="profile-collections-message is-error">{state.error}</p> : null}

      {state.loading ? (
        <div className="profile-collections-loading"><span /> Preparando las baldas…</div>
      ) : null}

      {!state.loading && !state.available ? (
        <article className="profile-collections-empty is-preview">
          <span>❧</span>
          <h3>La vitrina de colecciones está preparada</h3>
          <p>La interfaz ya está diseñada. Falta activar de forma segura las tablas de colecciones antes de guardar datos reales.</p>
          {isOwner ? <button type="button" onClick={startCreate}>Previsualizar creador</button> : null}
        </article>
      ) : null}

      {!state.loading && state.available && state.collections.length ? (
        <div className="profile-collections-grid">
          {state.collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              isOwner={isOwner && collection.is_owner}
              onEdit={startEdit}
              onDelete={removeCollection}
              onFollow={toggleFollow}
              onSelectBook={onSelectBook}
              busy={busyId === collection.id}
            />
          ))}
        </div>
      ) : null}

      {!state.loading && state.available && !state.collections.length ? (
        <article className="profile-collections-empty">
          <span>📚</span>
          <h3>{isOwner ? "Crea tu primera colección" : "Todavía no hay colecciones públicas"}</h3>
          <p>{isOwner ? "Empieza con una idea sencilla: cinco estrellas, otoño cozy o libros que volverías a leer." : "Cuando esta lectora publique una colección aparecerá aquí."}</p>
          {isOwner ? <button type="button" onClick={startCreate}>Crear colección</button> : null}
        </article>
      ) : null}

      {draft ? (
        <CollectionEditor
          draft={draft}
          shelfBooks={shelfBooks}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          saving={saving}
        />
      ) : null}
    </section>
  );
}
