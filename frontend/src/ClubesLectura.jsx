import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "./api.js";
import {
  createClubMeeting,
  createClubPost,
  createReadingClub,
  deleteClubMeeting,
  deleteReadingClub,
  getClubDetail,
  getClubsHub,
  joinReadingClub,
  joinReadingClubByCode,
  leaveReadingClub,
  removeClubMember,
  replaceClubChapters,
  searchClubBooks,
  setClubMemberRole,
  toggleClubPostReaction,
  updateClubMeeting,
  updateClubProgress,
  updateClubSettings,
  uploadClubAsset,
} from "./lib/clubsApi.js";
import "./ClubesLectura.css";

const CLUB_TABS = [
  { id: "summary", label: "Inicio" },
  { id: "reading", label: "Lectura" },
  { id: "general", label: "Chat general" },
  { id: "chapters", label: "Capítulos" },
  { id: "achievements", label: "Logros" },
  { id: "calendar", label: "Calendario" },
  { id: "members", label: "Miembros" },
];

function assetUrl(value, fallback = "images/librelula.png") {
  const clean = String(value || "").trim();
  if (!clean) return publicUrl(fallback);
  if (/^https?:\/\//i.test(clean)) return clean;
  return publicUrl(clean);
}

function displayName(profile) {
  return profile?.display_name || profile?.username || "Lectora de Librélula";
}

function formatDateTime(value) {
  if (!value) return "Todavía sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Todavía sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: new Intl.DateTimeFormat("es-ES", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("es-ES", { month: "short" })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
    time: new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(date),
  };
}

function relativeTime(value) {
  if (!value) return "ahora";
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

function clubBackground(club) {
  const bookCover = club?.book?.cover;
  const custom = club?.banner_url;
  const image = custom || bookCover;
  const accent = club?.accent_color || "#68442f";
  return {
    "--club-accent": accent,
    backgroundImage: image
      ? `linear-gradient(90deg, rgba(33, 19, 10, .94), rgba(55, 31, 17, .78), rgba(32, 18, 10, .9)), url("${assetUrl(image)}")`
      : "linear-gradient(120deg, #2f1d13, #7a4b2c 55%, #342116)",
  };
}

function AvatarStack({ members = [], limit = 5, extra = 0 }) {
  const visible = members.slice(0, limit);
  return (
    <div className="clubs-avatar-stack" aria-label={`${members.length + extra} miembros`}>
      {visible.map((member) => (
        <img
          key={member.user_id || member.profile?.id}
          src={assetUrl(member.profile?.avatar, "images/avatar/avatar1.png")}
          alt={displayName(member.profile)}
          loading="lazy"
        />
      ))}
      {members.length + extra > limit && (
        <span>+{members.length + extra - limit}</span>
      )}
    </div>
  );
}

function BookCover({ book, className = "" }) {
  return (
    <img
      className={className}
      src={assetUrl(book?.cover)}
      alt={book?.title ? `Portada de ${book.title}` : "Portada del libro"}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.src = publicUrl("images/librelula.png");
      }}
    />
  );
}

function CreateClubPanel({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    visibility: "public",
    chapterCount: 10,
    nextMeetingAt: "",
  });
  const [bookSearch, setBookSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchClubBooks(bookSearch);
        if (!cancelled) setBooks(rows);
      } catch (nextError) {
        if (!cancelled) setError(nextError.message || "No se pudieron buscar libros.");
      } finally {
        if (!cancelled) setLoadingBooks(false);
      }
    }, bookSearch ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookSearch]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const club = await createReadingClub({
        ...form,
        bookId: selectedBook?.id,
        nextMeetingAt: form.nextMeetingAt
          ? new Date(form.nextMeetingAt).toISOString()
          : null,
      });
      onCreated(club);
    } catch (nextError) {
      setError(nextError.message || "No se pudo crear el club.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clubs-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="clubs-create-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clubs-create-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="clubs-kicker">Una nueva mesa lectora</span>
            <h2 id="clubs-create-title">Crear un club</h2>
          </div>
          <button type="button" className="clubs-icon-button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <label>
            Nombre del club
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="El salón de medianoche"
              maxLength={80}
              required
            />
          </label>

          <label>
            Descripción
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="¿Qué tipo de lecturas y conversaciones tendrá este club?"
              rows={3}
            />
          </label>

          <div className="clubs-form-grid">
            <label>
              Privacidad
              <select
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => ({ ...current, visibility: event.target.value }))
                }
              >
                <option value="public">Público · cualquiera puede unirse</option>
                <option value="private">Privado · requiere código</option>
              </select>
            </label>
            <label>
              Capítulos iniciales
              <input
                type="number"
                min="1"
                max="80"
                value={form.chapterCount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, chapterCount: event.target.value }))
                }
              />
            </label>
          </div>

          <label>
            Próxima reunión (opcional)
            <input
              type="datetime-local"
              value={form.nextMeetingAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, nextMeetingAt: event.target.value }))
              }
            />
          </label>

          <fieldset className="clubs-book-picker">
            <legend>Libro con el que empieza el club</legend>
            <input
              type="search"
              value={bookSearch}
              onChange={(event) => {
                setLoadingBooks(true);
                setBookSearch(event.target.value);
              }}
              placeholder="Buscar por título, autora o ISBN…"
            />
            <div className="clubs-book-results">
              {loadingBooks && <p>Buscando en el catálogo…</p>}
              {!loadingBooks && books.length === 0 && <p>No encontramos libros con esa búsqueda.</p>}
              {books.map((book) => (
                <button
                  type="button"
                  key={book.id}
                  className={selectedBook?.id === book.id ? "is-selected" : ""}
                  onClick={() => setSelectedBook(book)}
                >
                  <BookCover book={book} />
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                  </span>
                  <i aria-hidden="true">{selectedBook?.id === book.id ? "✓" : "+"}</i>
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p className="clubs-form-error">{error}</p>}

          <footer>
            <button type="button" className="clubs-secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="clubs-primary-button" disabled={saving || !selectedBook}>
              {saving ? "Preparando el club…" : "Crear el club"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ClubCard({ club, onSelect }) {
  const meeting = compactDate(club.next_meeting_at);
  return (
    <button
      type="button"
      className="clubs-my-card"
      style={clubBackground(club)}
      onClick={() => onSelect(club)}
    >
      <BookCover book={club.book} />
      <span className="clubs-my-card-copy">
        <small>Leyendo ahora</small>
        <strong>{club.name}</strong>
        <span>{club.book?.title || "Lectura por escoger"}</span>
        <em>{club.book?.author || ""}</em>
        <span className="clubs-card-progress">
          <i style={{ width: `${club.membership?.progress || 0}%` }} />
        </span>
      </span>
      <span className="clubs-my-card-meta">
        <b>{club.member_count} miembros</b>
        {meeting && <b>{meeting.weekday} · {meeting.time}</b>}
      </span>
    </button>
  );
}

function ClubPreview({ club, onEnter, onInvite, onSelectBook }) {
  const meeting = compactDate(club.next_meeting_at);
  const progress = club.membership?.progress || 0;
  return (
    <section className="clubs-featured">
      <header className="clubs-featured-hero" style={clubBackground(club)}>
        <div className="clubs-featured-emblem">
          <BookCover book={club.book} />
        </div>
        <div className="clubs-featured-title">
          <span>{club.visibility === "private" ? "▣ Club privado" : "◌ Club público"}</span>
          <h2>{club.name}</h2>
          <p>{club.description || "Un lugar para leer sin prisa y conversar sin adelantos."}</p>
          <small>{club.member_count} miembros</small>
        </div>
        <div className="clubs-featured-actions">
          <button type="button" className="clubs-primary-button" onClick={() => onEnter(club)}>
            ↪ Entrar al club
          </button>
          {club.is_member && (
            <button type="button" className="clubs-light-button" onClick={() => onInvite(club)}>
              ♙ Invitar
            </button>
          )}
        </div>
      </header>

      <div className="clubs-preview-tabs" aria-hidden="true">
        <span className="is-active">Resumen</span>
        <span>Lectura</span>
        <span>Debate</span>
        <span>Miembros</span>
        <span>Calendario</span>
      </div>

      <div className="clubs-preview-grid">
        <article className="clubs-preview-reading">
          <h3>Lectura del mes</h3>
          <div>
            <BookCover book={club.book} />
            <span>
              <strong>{club.book?.title || "Sin lectura seleccionada"}</strong>
              <small>{club.book?.author || ""}</small>
              <label>Progreso colectivo</label>
              <i><b style={{ width: `${progress}%` }} /></i>
              <em>{progress}%</em>
              {club.book && (
                <button type="button" onClick={() => onSelectBook?.(club.book)}>
                  Ver ficha del libro
                </button>
              )}
            </span>
          </div>
        </article>

        <article className="clubs-preview-meeting">
          <h3>Próxima reunión</h3>
          {meeting ? (
            <div className="clubs-meeting-date">
              <span><b>{meeting.month}</b><strong>{meeting.day}</strong></span>
              <p><strong>{meeting.time}</strong><small>{meeting.weekday}</small></p>
            </div>
          ) : (
            <p className="clubs-soft-empty">El club todavía no ha fijado su próxima cita.</p>
          )}
          <button type="button" onClick={() => onEnter(club)}>Ver calendario</button>
        </article>

        <article>
          <h3>Últimos debates</h3>
          <ul className="clubs-preview-list">
            <li>¿Qué escena te cambió la lectura?</li>
            <li>Personajes que brillan entre las páginas</li>
            <li>Teorías, pistas y sensaciones finales</li>
          </ul>
          <button type="button" onClick={() => onEnter(club)}>Entrar en las conversaciones →</button>
        </article>

        <article>
          <h3>Actividad del club</h3>
          <p className="clubs-soft-empty">
            Entra para ver los avances, citas y comentarios de las personas del club.
          </p>
          <button type="button" onClick={() => onEnter(club)}>Ver actividad →</button>
        </article>
      </div>
    </section>
  );
}

function ClubPost({ post, currentChapter, onReact, onReveal, isRevealed }) {
  const futureLocked = post.channel === "chapter" && Number(post.chapter_number) > currentChapter;
  const spoilerHidden = post.contains_spoilers && !isRevealed;
  const profile = post.profile;

  if (futureLocked) {
    return (
      <article className="club-post club-post-locked">
        <span className="club-post-lock">▣</span>
        <div>
          <strong>Mensaje de un capítulo futuro</strong>
          <p>Avanza hasta el capítulo {post.chapter_number} para desbloquearlo.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="club-post">
      <img
        className="club-post-avatar"
        src={assetUrl(profile?.avatar, "images/avatar/avatar1.png")}
        alt={displayName(profile)}
      />
      <div className="club-post-body">
        <header>
          <strong>{displayName(profile)}</strong>
          <span>{relativeTime(post.created_at)}</span>
          {post.channel === "chapter" && <em>Cap. {post.chapter_number}</em>}
        </header>

        {spoilerHidden ? (
          <button type="button" className="club-spoiler-cover" onClick={() => onReveal(post.id)}>
            <b>◉ Spoiler del capítulo {post.chapter_number || "actual"}</b>
            <span>Este contenido puede revelar detalles importantes.</span>
            <i>Mostrar</i>
          </button>
        ) : (
          <>
            {post.content && <p>{post.content}</p>}
            {post.quote_text && <blockquote>“{post.quote_text}”</blockquote>}
            {post.image_url && <img className="club-post-image" src={post.image_url} alt="Imagen compartida" />}
          </>
        )}

        <footer>
          <button
            type="button"
            className={post.liked_by_me ? "is-active" : ""}
            onClick={() => onReact(post.id, "heart")}
          >
            ♥ <span>{post.heart_count || 0}</span>
          </button>
          <button
            type="button"
            className={post.leafed_by_me ? "is-active" : ""}
            onClick={() => onReact(post.id, "leaf")}
          >
            ❧ <span>{post.leaf_count || 0}</span>
          </button>
          <span>○ Responder</span>
        </footer>
      </div>
    </article>
  );
}

function ClubComposer({ clubId, channel, chapterNumber, onPublished }) {
  const [content, setContent] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [showQuote, setShowQuote] = useState(false);
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createClubPost({
        clubId,
        channel,
        chapterNumber,
        content,
        quoteText,
        imageFile,
        containsSpoilers,
      });
      setContent("");
      setQuoteText("");
      setShowQuote(false);
      setImageFile(null);
      setContainsSpoilers(false);
      if (inputRef.current) inputRef.current.value = "";
      await onPublished();
    } catch (nextError) {
      setError(nextError.message || "No se pudo publicar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="club-composer" onSubmit={submit}>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={channel === "chapter" ? "Escribe sobre este capítulo…" : "Comparte una idea con el club…"}
        rows={2}
      />
      {showQuote && (
        <input
          value={quoteText}
          onChange={(event) => setQuoteText(event.target.value)}
          placeholder="Añade una cita del libro…"
        />
      )}
      {imageFile && <span className="club-file-chip">Imagen: {imageFile.name}</span>}
      {error && <p className="clubs-form-error">{error}</p>}
      <footer>
        <label className="club-composer-tool">
          ▧ Imagen
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => setImageFile(event.target.files?.[0] || null)}
          />
        </label>
        <button type="button" onClick={() => setShowQuote((value) => !value)}>❞ Cita</button>
        <label className={containsSpoilers ? "is-active" : ""}>
          ◉ Spoiler
          <input
            type="checkbox"
            checked={containsSpoilers}
            onChange={(event) => setContainsSpoilers(event.target.checked)}
          />
        </label>
        <button type="submit" className="club-send-button" disabled={saving}>
          {saving ? "…" : "➤"}<span className="sr-only">Enviar</span>
        </button>
      </footer>
    </form>
  );
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function meetingTypeLabel(type) {
  return {
    meeting: "Reunión",
    reading: "Lectura conjunta",
    debate: "Debate",
    deadline: "Meta de lectura",
    other: "Otro evento",
  }[type] || "Evento";
}

function ClubProgressEditor({ club, membership, chapters, onSaved, compact = false }) {
  const totalPages = Math.max(0, Number(club?.book?.pages) || 0);
  const initialPage = Math.max(0, Number(membership?.current_page) || 0);
  const [chapter, setChapter] = useState(Math.max(1, Number(membership?.current_chapter) || 1));
  const [page, setPage] = useState(initialPage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const percentage = totalPages > 0
    ? Math.min(100, Math.round((Math.min(page, totalPages) / totalPages) * 100))
    : Math.max(0, Math.min(100, Number(membership?.progress) || 0));

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await updateClubProgress(club.id, chapter, page, percentage);
      setMessage("Tu avance se ha guardado.");
      await onSaved?.();
    } catch (error) {
      setMessage(error.message || "No se pudo guardar el avance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`club-progress-editor club-progress-editor-v2 ${compact ? "is-compact" : ""}`}>
      <div className="club-progress-editor-heading">
        <div>
          <span className="clubs-kicker">Tu ritmo, sin adelantos</span>
          <h2>Mi progreso</h2>
        </div>
        <strong>{percentage}%</strong>
      </div>
      <div className="club-progress-page-summary">
        <b>{Math.min(page, totalPages || page)}</b>
        <span>{totalPages > 0 ? `de ${totalPages} páginas` : "páginas leídas"}</span>
      </div>
      <i className="club-progress-track"><span style={{ width: `${percentage}%` }} /></i>
      <div className="club-progress-fields">
        <label>
          Página actual
          <input
            type="number"
            min="0"
            max={totalPages || undefined}
            value={page}
            onChange={(event) => setPage(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label>
          Capítulo actual
          <select value={chapter} onChange={(event) => setChapter(Number(event.target.value))}>
            {chapters.map((item) => (
              <option key={item.id} value={item.chapter_number}>
                {item.chapter_number}. {item.title || `Capítulo ${item.chapter_number}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="clubs-primary-button" onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar progreso"}
      </button>
      {message && <p className="club-inline-message">{message}</p>}
    </article>
  );
}

function ClubCalendar({ club, meetings, isAdmin, onReload }) {
  const initial = meetings[0]?.starts_at ? new Date(meetings[0].starts_at) : new Date();
  const [viewDate, setViewDate] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(localDateKey(new Date()));
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    title: "Reunión del club",
    startsAt: "",
    endsAt: "",
    location: "",
    description: "",
    eventType: "meeting",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(viewDate);
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const eventsByDay = useMemo(() => {
    const map = new Map();
    meetings.forEach((meeting) => {
      const key = localDateKey(meeting.starts_at);
      const rows = map.get(key) || [];
      rows.push(meeting);
      map.set(key, rows);
    });
    return map;
  }, [meetings]);
  const selectedEvents = eventsByDay.get(selectedDay) || [];

  function openCreate(day = selectedDay) {
    const date = day || localDateKey(new Date());
    setEditing(null);
    setForm({
      title: "Reunión del club",
      startsAt: `${date}T20:00`,
      endsAt: "",
      location: "",
      description: "",
      eventType: "meeting",
    });
    setFormOpen(true);
    setMessage("");
  }

  function openEdit(meeting) {
    const toLocalInput = (value) => {
      if (!value) return "";
      const date = new Date(value);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    };
    setEditing(meeting);
    setForm({
      title: meeting.title || "Reunión del club",
      startsAt: toLocalInput(meeting.starts_at),
      endsAt: toLocalInput(meeting.ends_at),
      location: meeting.location || "",
      description: meeting.description || "",
      eventType: meeting.event_type || "meeting",
    });
    setFormOpen(true);
    setMessage("");
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!form.startsAt) return;
    setSaving(true);
    setMessage("");
    try {
      const values = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      if (editing) await updateClubMeeting(editing.id, values);
      else await createClubMeeting({ clubId: club.id, ...values });
      setFormOpen(false);
      setEditing(null);
      setMessage(editing ? "Evento actualizado." : "Evento añadido al calendario.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo guardar el evento.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(meeting) {
    if (!window.confirm(`¿Eliminar “${meeting.title}” del calendario?`)) return;
    try {
      await deleteClubMeeting(meeting.id);
      setMessage("Evento eliminado.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo eliminar el evento.");
    }
  }

  return (
    <div className="club-calendar-v2">
      <header className="club-calendar-toolbar">
        <div>
          <span className="clubs-kicker">Fechas compartidas</span>
          <h2>Calendario del club</h2>
        </div>
        {isAdmin && <button type="button" className="clubs-primary-button" onClick={() => openCreate()}>＋ Añadir evento</button>}
      </header>
      <div className="club-calendar-shell">
        <section className="club-calendar-month">
          <header>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>←</button>
            <h3>{monthLabel}</h3>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>→</button>
          </header>
          <div className="club-calendar-weekdays">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="club-calendar-grid">
            {days.map((day) => {
              const key = localDateKey(day);
              const dayEvents = eventsByDay.get(key) || [];
              const outside = day.getMonth() !== viewDate.getMonth();
              const today = key === localDateKey(new Date());
              return (
                <button
                  type="button"
                  key={key}
                  className={`${selectedDay === key ? "is-selected" : ""} ${outside ? "is-outside" : ""} ${today ? "is-today" : ""}`}
                  onClick={() => setSelectedDay(key)}
                >
                  <b>{day.getDate()}</b>
                  <span>{dayEvents.slice(0, 2).map((item) => <i key={item.id}>{item.title}</i>)}</span>
                  {dayEvents.length > 2 && <small>+{dayEvents.length - 2}</small>}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="club-calendar-day-panel">
          <span className="clubs-kicker">{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDay}T12:00:00`))}</span>
          <h3>{selectedEvents.length ? `${selectedEvents.length} evento${selectedEvents.length === 1 ? "" : "s"}` : "Día libre"}</h3>
          {selectedEvents.length === 0 && <p>Este día todavía no tiene ninguna cita del club.</p>}
          {selectedEvents.map((meeting) => (
            <article key={meeting.id}>
              <span>{meetingTypeLabel(meeting.event_type)}</span>
              <h4>{meeting.title}</h4>
              <b>{new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(meeting.starts_at))}</b>
              <p>{meeting.location || "Lugar por confirmar"}</p>
              {meeting.description && <small>{meeting.description}</small>}
              {isAdmin && <div><button type="button" onClick={() => openEdit(meeting)}>Editar</button><button type="button" onClick={() => removeEvent(meeting)}>Eliminar</button></div>}
            </article>
          ))}
          {isAdmin && <button type="button" className="clubs-secondary-button" onClick={() => openCreate(selectedDay)}>Añadir en este día</button>}
        </aside>
      </div>
      {message && <p className="club-inline-message">{message}</p>}

      {formOpen && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setFormOpen(false)}>
          <form className="club-event-form" onSubmit={saveEvent} onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="clubs-kicker">Calendario</span><h2>{editing ? "Editar evento" : "Nueva cita"}</h2></div><button type="button" onClick={() => setFormOpen(false)}>×</button></header>
            <label>Título<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <div className="club-form-columns">
              <label>Empieza<input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} required /></label>
              <label>Termina<input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            </div>
            <div className="club-form-columns">
              <label>Tipo<select value={form.eventType} onChange={(event) => setForm((current) => ({ ...current, eventType: event.target.value }))}><option value="meeting">Reunión</option><option value="reading">Lectura conjunta</option><option value="debate">Debate</option><option value="deadline">Meta de lectura</option><option value="other">Otro</option></select></label>
              <label>Lugar o enlace<input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label>
            </div>
            <label>Descripción<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <footer><button type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="clubs-primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar evento"}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}

function ClubSettingsPanel({ club, chapters, membership, onReload, onClose, onExitClub }) {
  const isOwner = membership?.role === "owner";
  const isAdmin = isOwner || membership?.role === "moderator";
  const bannerInput = useRef(null);
  const iconInput = useRef(null);
  const [form, setForm] = useState({
    name: club.name || "",
    description: club.description || "",
    visibility: club.visibility || "public",
    bannerUrl: club.banner_url || "",
    iconUrl: club.icon_url || "",
    rulesText: (club.rules || []).join("\n"),
    chaptersText: chapters.map((item) => item.title || `Capítulo ${item.chapter_number}`).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");

  async function upload(kind, file) {
    if (!file) return;
    setUploading(kind);
    setMessage("");
    try {
      const url = await uploadClubAsset(club.id, file, kind);
      setForm((current) => ({ ...current, [kind === "banner" ? "bannerUrl" : "iconUrl"]: url }));
      setMessage("Imagen preparada. Pulsa Guardar cambios para aplicarla.");
    } catch (error) {
      setMessage(error.message || "No se pudo subir la imagen.");
    } finally {
      setUploading("");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateClubSettings({
        clubId: club.id,
        name: form.name,
        description: form.description,
        visibility: form.visibility,
        bannerUrl: form.bannerUrl,
        iconUrl: form.iconUrl,
        rules: form.rulesText.split("\n"),
      });
      await replaceClubChapters(club.id, form.chaptersText.split("\n"));
      setMessage("Ajustes guardados.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    if (!window.confirm("¿Abandonar el club? Perderás los marcapáginas y logros obtenidos dentro de él.")) return;
    try {
      await leaveReadingClub(club.id);
      onExitClub?.("Has abandonado el club.");
    } catch (error) {
      setMessage(error.message || "No se pudo abandonar el club.");
    }
  }

  async function removeClub() {
    const confirmation = window.prompt(`Escribe ${club.name} para eliminar definitivamente el club.`);
    if (confirmation !== club.name) return;
    try {
      await deleteReadingClub(club.id);
      onExitClub?.("El club se ha eliminado.");
    } catch (error) {
      setMessage(error.message || "No se pudo eliminar el club.");
    }
  }

  return (
    <div className="clubs-modal-backdrop" onMouseDown={onClose}>
      <form className="club-settings-panel" onSubmit={saveSettings} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="clubs-kicker">Gestión del club</span><h2>{isAdmin ? "Ajustes" : "Opciones"}</h2></div><button type="button" onClick={onClose}>×</button></header>
        {isAdmin ? (
          <>
            <div className="club-image-settings">
              <button type="button" onClick={() => bannerInput.current?.click()}>{uploading === "banner" ? "Subiendo…" : "▣ Cambiar portada"}</button>
              <button type="button" onClick={() => iconInput.current?.click()}>{uploading === "icon" ? "Subiendo…" : "◉ Cambiar icono"}</button>
              <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => upload("banner", event.target.files?.[0])} />
              <input ref={iconInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => upload("icon", event.target.files?.[0])} />
            </div>
            <label>Nombre<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label>Descripción<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Privacidad<select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}><option value="public">Público</option><option value="private">Privado</option></select></label>
            <label>Normas del club <small>Una norma por línea</small><textarea rows="6" value={form.rulesText} onChange={(event) => setForm((current) => ({ ...current, rulesText: event.target.value }))} /></label>
            <label>Capítulos <small>Un capítulo por línea; el orden define su número</small><textarea rows="9" value={form.chaptersText} onChange={(event) => setForm((current) => ({ ...current, chaptersText: event.target.value }))} /></label>
            <button type="submit" className="clubs-primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
          </>
        ) : <p>Desde aquí puedes abandonar el club. Tus mensajes se conservarán, pero perderás los marcapáginas y logros exclusivos del club.</p>}
        {message && <p className="club-inline-message">{message}</p>}
        <footer className="club-danger-zone">
          {!isOwner && <button type="button" onClick={leave}>Abandonar club</button>}
          {isOwner && <button type="button" className="is-danger" onClick={removeClub}>Eliminar club definitivamente</button>}
        </footer>
      </form>
    </div>
  );
}

function ClubMembersPanel({ club, membership, members, onReload, onOpenProfile }) {
  const isOwner = membership?.role === "owner";
  const isAdmin = isOwner || membership?.role === "moderator";
  const [message, setMessage] = useState("");

  async function changeRole(member) {
    const nextRole = member.role === "moderator" ? "member" : "moderator";
    try {
      await setClubMemberRole(club.id, member.user_id, nextRole);
      setMessage(nextRole === "moderator" ? "Moderadora añadida." : "Rol de moderación retirado.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo cambiar el rol.");
    }
  }

  async function remove(member) {
    if (!window.confirm(`¿Retirar a ${displayName(member.profile)} del club? Perderá sus logros del club.`)) return;
    try {
      await removeClubMember(club.id, member.user_id);
      setMessage("La persona ya no pertenece al club.");
      await onReload?.();
    } catch (error) {
      setMessage(error.message || "No se pudo retirar a la persona.");
    }
  }

  return (
    <div className="club-simple-panel club-members-panel-v2">
      <span className="clubs-kicker">Personas que comparten esta historia</span>
      <h2>{members.length} miembros</h2>
      <p className="club-panel-intro">Pulsa sobre una persona para visitar su perfil lector.</p>
      {message && <p className="club-inline-message">{message}</p>}
      <div className="club-members-grid club-members-grid-v2">
        {members.map((member) => {
          const canRemove = isAdmin && member.role !== "owner" && !(membership?.role === "moderator" && member.role === "moderator");
          return (
            <article key={member.user_id}>
              <button type="button" className="club-member-profile-button" onClick={() => onOpenProfile?.(member.user_id)}>
                <img src={assetUrl(member.profile?.avatar, "images/avatar/avatar1.png")} alt="" />
                <div><h3>{displayName(member.profile)}</h3><p>@{member.profile?.username || "lectora"}</p><small>{member.role === "owner" ? "Creadora" : member.role === "moderator" ? "Moderadora" : "Miembro"}</small></div>
                <span><b>{member.progress}%</b><small>{member.current_page || 0} págs. · cap. {member.current_chapter}</small></span>
              </button>
              {(isOwner || canRemove) && <footer>{isOwner && member.role !== "owner" && <button type="button" onClick={() => changeRole(member)}>{member.role === "moderator" ? "Quitar moderación" : "Hacer moderadora"}</button>}{canRemove && <button type="button" onClick={() => remove(member)}>Retirar</button>}</footer>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ClubBookmarks({ achievements, membership }) {
  const mine = achievements.filter((item) => item.user_id === membership?.user_id);
  return (
    <div className="club-simple-panel club-bookmarks-panel">
      <span className="clubs-kicker">Recuerdos de esta lectura compartida</span>
      <h2>Marcapáginas del club</h2>
      <p>Los logros se convertirán en marcapáginas coleccionables. La estructura ya está preparada, pero su colección se diseñará más adelante.</p>
      {mine.length > 0 ? <div className="club-bookmark-grid">{mine.map((item) => <article key={item.id}><span>❧</span><h3>{item.label}</h3><p>{item.description}</p></article>)}</div> : <div className="club-bookmark-placeholder"><span>❧</span><strong>Tu primer marcapáginas aparecerá aquí</strong><small>Se conservará en tu perfil mientras pertenezcas al club.</small></div>}
    </div>
  );
}

function ClubInside({ data, tab, onTab, onBack, onReload, onSelectBook, onInvite, onOpenProfile, onExitClub }) {
  const { club, membership, members, chapters, posts, meetings, achievements = [] } = data;
  const [selectedChapter, setSelectedChapter] = useState(membership?.current_chapter || 1);
  const [revealed, setRevealed] = useState(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const currentChapter = membership?.current_chapter || 1;
  const selectedChapterInfo = chapters.find((item) => item.chapter_number === selectedChapter);
  const isAdmin = membership?.role === "owner" || membership?.role === "moderator";
  const [renderReferenceTime] = useState(() => Date.now());
  const futureMeetings = meetings.filter((item) => new Date(item.starts_at).getTime() >= renderReferenceTime - 3600000);
  const meeting = futureMeetings[0] || null;
  const meetingParts = compactDate(meeting?.starts_at);
  const collectiveProgress = Math.round(members.reduce((sum, item) => sum + Number(item.progress || 0), 0) / Math.max(1, members.length));

  const chapterPosts = useMemo(
    () => posts.filter((post) => post.channel === "chapter" && post.chapter_number === selectedChapter),
    [posts, selectedChapter],
  );
  const generalPosts = useMemo(() => posts.filter((post) => post.channel === "general"), [posts]);

  async function react(postId, reaction) {
    try {
      await toggleClubPostReaction(postId, reaction);
      await onReload();
    } catch (error) {
      setNotice(error.message || "No se pudo guardar la reacción.");
    }
  }

  function reveal(postId) {
    setRevealed((current) => new Set(current).add(postId));
  }

  const feed = tab === "general" ? generalPosts : chapterPosts;

  return (
    <section className="club-inside club-inside-v2">
      <button type="button" className="clubs-back-button" onClick={onBack}>← Todos mis clubes</button>
      <header className="club-inside-banner" style={clubBackground(club)}>
        <div className="club-inside-emblem"><img src={assetUrl(club.icon_url || club.book?.cover)} alt={`Icono de ${club.name}`} /></div>
        <div><span>{club.visibility === "private" ? "▣ Club privado" : "◌ Club público"} · {members.length} miembros</span><h1>{club.name}</h1><p>{club.description}</p></div>
        <div className="club-inside-actions">
          <button type="button" className="clubs-light-button" onClick={() => onInvite(club)}>♙ Invitar</button>
          <button type="button" className="clubs-light-button" onClick={() => setSettingsOpen(true)}>⚙ {isAdmin ? "Ajustes" : "Opciones"}</button>
          <span className="club-owner-badge">{membership?.role === "owner" ? "Creadora" : membership?.role === "moderator" ? "Moderadora" : "Miembro"}</span>
        </div>
      </header>

      <nav className="club-tabs" aria-label="Secciones del club">
        {CLUB_TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => onTab(item.id)}>{item.label}{item.id === "general" && generalPosts.length > 0 && <span>{generalPosts.length}</span>}</button>)}
      </nav>
      {notice && <div className="clubs-notice is-inline">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}

      {(tab === "chapters" || tab === "general") && (
        <div className="club-conversation-layout">
          <aside className="club-reading-sidebar">
            <article className="club-current-book-card"><BookCover book={club.book} /><div><strong>{club.book?.title || "Lectura del club"}</strong><small>{club.book?.author}</small><label>Tu progreso <b>{membership?.progress || 0}%</b></label><i><span style={{ width: `${membership?.progress || 0}%` }} /></i><small>{membership?.current_page || 0} / {club.book?.pages || "?"} páginas · capítulo {currentChapter}</small><button type="button" onClick={() => onTab("reading")}>Actualizar mi progreso</button>{club.book && <button type="button" onClick={() => onSelectBook?.(club.book)}>Ver libro</button>}</div></article>
            {tab === "chapters" && <article className="club-chapter-list"><h3>Conversaciones por capítulos</h3>{chapters.map((chapter) => { const locked = chapter.chapter_number > currentChapter; return <button type="button" key={chapter.id} className={selectedChapter === chapter.chapter_number ? "is-active" : ""} onClick={() => !locked && setSelectedChapter(chapter.chapter_number)} disabled={locked}><span>{chapter.chapter_number}. {chapter.title}</span><i>{locked ? "▣" : chapter.chapter_number < currentChapter ? "✓" : "○"}</i></button>; })}<p>❧ Avanza en Lectura para desbloquear nuevos capítulos.</p></article>}
          </aside>
          <main className="club-conversation-main">
            {tab === "chapters" && <article className="club-spoiler-mode"><span>♧</span><div><strong>Modo sin spoilers activado</strong><p>Ves conversaciones hasta el capítulo {currentChapter}.</p></div><button type="button" onClick={() => onTab("reading")}>Página {membership?.current_page || 0} · cap. {currentChapter}</button></article>}
            <header className="club-feed-heading"><div><h2>{tab === "general" ? "Chat general" : `Capítulo ${selectedChapter} · ${selectedChapterInfo?.title || "Conversación"}`}</h2><p>{members.filter((member) => member.current_chapter === selectedChapter).length} leyendo este capítulo</p></div></header>
            <div className="club-feed">{feed.length === 0 && <div className="clubs-empty-card"><span>☕</span><h3>Todavía no hay mensajes aquí</h3><p>Sé la primera persona en abrir esta conversación.</p></div>}{feed.map((post) => <ClubPost key={post.id} post={post} currentChapter={currentChapter} onReact={react} onReveal={reveal} isRevealed={revealed.has(post.id)} />)}</div>
            <ClubComposer clubId={club.id} channel={tab === "general" ? "general" : "chapter"} chapterNumber={tab === "general" ? null : selectedChapter} onPublished={onReload} />
          </main>
          <aside className="club-detail-sidebar">
            <article className="club-next-meeting-card"><h3>Próxima reunión</h3>{meetingParts ? <><div className="clubs-meeting-date"><span><b>{meetingParts.month}</b><strong>{meetingParts.day}</strong></span><p><strong>{meetingParts.time}</strong><small>{meetingParts.weekday}</small></p></div><p>{meeting?.title}</p><button type="button" onClick={() => onTab("calendar")}>Ver calendario</button></> : <p className="clubs-soft-empty">Todavía no hay una fecha fijada.</p>}</article>
            <article className="club-rules-card"><h3>Normas del club</h3>{(club.rules || []).map((rule, index) => <p key={`${rule}-${index}`}>{index + 1}. {rule}</p>)}{isAdmin && <button type="button" onClick={() => setSettingsOpen(true)}>Editar normas</button>}</article>
          </aside>
        </div>
      )}

      {tab === "summary" && <div className="club-summary-layout club-summary-layout-v2"><article className="club-summary-reading"><h2>Lectura del club</h2><div><BookCover book={club.book} /><span><h3>{club.book?.title || "Sin libro seleccionado"}</h3><p>{club.book?.author}</p><label>Progreso colectivo · {collectiveProgress}%</label><i><b style={{ width: `${collectiveProgress}%` }} /></i><button type="button" onClick={() => onSelectBook?.(club.book)}>Ver ficha completa</button></span></div></article><ClubProgressEditor club={club} membership={membership} chapters={chapters} onSaved={onReload} compact /><article className="club-summary-meeting"><h2>Próxima cita</h2><p>{formatDateTime(meeting?.starts_at)}</p>{meeting && <strong>{meeting.title}</strong>}<AvatarStack members={members} /><button type="button" onClick={() => onTab("calendar")}>Abrir calendario</button></article><article className="club-summary-members"><h2>El círculo del club</h2><div className="club-member-mini-grid">{members.slice(0, 8).map((member) => <button type="button" key={member.user_id} onClick={() => onOpenProfile?.(member.user_id)}><img src={assetUrl(member.profile?.avatar, "images/avatar/avatar1.png")} alt="" /><b>{displayName(member.profile)}</b><small>{member.current_page || 0} págs. · {member.progress}%</small></button>)}</div><button type="button" onClick={() => onTab("members")}>Ver todos los miembros</button></article></div>}

      {tab === "reading" && <div className="club-reading-tab club-reading-tab-v2"><article><BookCover book={club.book} /><div><span className="clubs-kicker">Lectura actual</span><h2>{club.book?.title}</h2><p>{club.book?.author}</p><p>{club.book?.pages ? `${club.book.pages} páginas` : "Número de páginas no disponible"}</p><button type="button" className="clubs-primary-button" onClick={() => onSelectBook?.(club.book)}>Abrir ficha</button></div></article><ClubProgressEditor club={club} membership={membership} chapters={chapters} onSaved={onReload} /><article className="club-reading-help"><span>♧</span><h3>¿Cómo marco por dónde voy?</h3><p>Introduce la página exacta y el capítulo. Librélula calculará el porcentaje y desbloqueará las conversaciones que ya puedes leer sin spoilers.</p>{isAdmin && <button type="button" onClick={() => setSettingsOpen(true)}>Editar lista de capítulos</button>}</article></div>}

      {tab === "achievements" && <ClubBookmarks achievements={achievements} membership={membership} />}
      {tab === "calendar" && <ClubCalendar club={club} meetings={meetings} isAdmin={isAdmin} onReload={onReload} />}
      {tab === "members" && <ClubMembersPanel club={club} membership={membership} members={members} onReload={onReload} onOpenProfile={onOpenProfile} />}

      {settingsOpen && <ClubSettingsPanel club={club} chapters={chapters} membership={membership} onReload={onReload} onClose={() => setSettingsOpen(false)} onExitClub={onExitClub} />}
    </section>
  );
}


export default function ClubesLectura({
  isLoggedIn,
  onLogin,
  onSelectBook,
  onHome,
  onCatalog,
  onProfile,
  onOpenProfile,
}) {
  const [state, setState] = useState({ loading: true, error: "", hub: null });
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [insideClub, setInsideClub] = useState(false);
  const [clubData, setClubData] = useState(null);
  const [clubLoading, setClubLoading] = useState(false);
  const [clubTab, setClubTab] = useState("summary");
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteClub, setInviteClub] = useState(null);
  const [inviteCode, setInviteCode] = useState("");
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const loadHub = useCallback(async () => {
    if (!isLoggedIn) {
      setState({ loading: false, error: "", hub: null });
      return;
    }
    try {
      const hub = await getClubsHub();
      setState({ loading: false, error: "", hub });
      setSelectedClubId((current) => current || hub.myClubs[0]?.id || hub.discoverClubs[0]?.id || null);
    } catch (error) {
      setState({ loading: false, error: error.message || "No se pudieron cargar los clubes.", hub: null });
    }
  }, [isLoggedIn]);

  useEffect(() => {
    let cancelled = false;

    async function initialHubLoad() {
      if (!isLoggedIn) {
        if (!cancelled) setState({ loading: false, error: "", hub: null });
        return;
      }

      try {
        const hub = await getClubsHub();
        if (!cancelled) {
          setState({ loading: false, error: "", hub });
          setSelectedClubId((current) =>
            current || hub.myClubs[0]?.id || hub.discoverClubs[0]?.id || null,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error.message || "No se pudieron cargar los clubes.",
            hub: null,
          });
        }
      }
    }

    initialHubLoad();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const selectedClub = useMemo(() => {
    const all = [...(state.hub?.myClubs || []), ...(state.hub?.discoverClubs || [])];
    return all.find((club) => String(club.id) === String(selectedClubId)) || all[0] || null;
  }, [selectedClubId, state.hub]);

  const loadDetail = useCallback(async (clubId) => {
    setClubLoading(true);
    setNotice("");
    try {
      const detail = await getClubDetail(clubId);
      setClubData(detail);
      return detail;
    } catch (error) {
      setNotice(error.message || "No se pudo abrir el club.");
      return null;
    } finally {
      setClubLoading(false);
    }
  }, []);

  async function enterClub(club) {
    if (!club.is_member) {
      if (club.visibility === "private") {
        setInviteClub(club);
        return;
      }
      try {
        await joinReadingClub(club.id);
        await loadHub();
      } catch (error) {
        setNotice(error.message || "No se pudo entrar en el club.");
        return;
      }
    }
    const detail = await loadDetail(club.id);
    if (detail?.membership) {
      setSelectedClubId(club.id);
      setInsideClub(true);
      setClubTab("summary");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function joinPrivate() {
    if (!inviteClub) return;
    try {
      await joinReadingClub(inviteClub.id, inviteCode);
      setInviteClub(null);
      setInviteCode("");
      await loadHub();
      const detail = await loadDetail(inviteClub.id);
      if (detail?.membership) {
        setSelectedClubId(inviteClub.id);
        setInsideClub(true);
      }
    } catch (error) {
      setNotice(error.message || "No se pudo usar la invitación.");
    }
  }

  async function joinByCode() {
    try {
      const clubId = await joinReadingClubByCode(inviteCode);
      setCodeDialogOpen(false);
      setInviteCode("");
      await loadHub();
      const detail = await loadDetail(clubId);
      if (detail?.membership) {
        setSelectedClubId(clubId);
        setClubData(detail);
        setInsideClub(true);
      }
    } catch (error) {
      setNotice(error.message || "No se pudo usar la invitación.");
    }
  }

  async function copyInvite(club) {
    const code = club?.invite_code || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Código ${code} copiado. Compártelo con quien quieras invitar.`);
    } catch {
      setNotice(`Código de invitación: ${code}`);
    }
  }

  async function reloadCurrentClub() {
    if (!selectedClubId) return;
    await loadDetail(selectedClubId);
  }

  if (!isLoggedIn) {
    return (
      <main className="clubs-page">
        <section className="clubs-login-card">
          <span>☾</span>
          <h1>Clubes de lectura</h1>
          <p>Inicia sesión para leer en compañía, conversar por capítulos y avanzar sin spoilers.</p>
          <button type="button" className="clubs-primary-button" onClick={onLogin}>Iniciar sesión</button>
        </section>
      </main>
    );
  }

  if (state.loading) {
    return <main className="clubs-page"><section className="clubs-loading"><span /><p>Preparando las mesas de lectura…</p></section></main>;
  }

  if (state.error) {
    return <main className="clubs-page"><section className="clubs-login-card"><h1>No se pudieron abrir los clubes</h1><p>{state.error}</p><button type="button" onClick={loadHub}>Reintentar</button></section></main>;
  }

  if (insideClub && clubData) {
    return (
      <main className="clubs-page clubs-page-inside">
        {notice && <div className="clubs-notice">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}
        <ClubInside
          data={clubData}
          tab={clubTab}
          onTab={setClubTab}
          onBack={() => { setInsideClub(false); setClubData(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onReload={reloadCurrentClub}
          onSelectBook={onSelectBook}
          onInvite={copyInvite}
          onOpenProfile={onOpenProfile}
          onExitClub={async (message) => {
            setNotice(message || "");
            setInsideClub(false);
            setClubData(null);
            setSelectedClubId(null);
            await loadHub();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        <nav className="clubs-mobile-bottom-nav" aria-label="Navegación móvil">
          <button type="button" onClick={onHome}>⌂<span>Inicio</span></button>
          <button type="button" onClick={onCatalog}>⌕<span>Buscar</span></button>
          <button type="button" className="is-create" onClick={() => setCreateOpen(true)}>＋<span>Crear</span></button>
          <button type="button" className="is-active">♟<span>Clubes</span></button>
          <button type="button" onClick={onProfile}>♙<span>Perfil</span></button>
        </nav>
        {createOpen && <CreateClubPanel onClose={() => setCreateOpen(false)} onCreated={async (club) => { setCreateOpen(false); await loadHub(); await enterClub({ ...club, is_member: true }); }} />}
      </main>
    );
  }

  const myClubs = state.hub?.myClubs || [];
  const discover = state.hub?.discoverClubs || [];

  return (
    <main className="clubs-page">
      {notice && <div className="clubs-notice">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}
      <header className="clubs-page-heading">
        <div>
          <span className="clubs-kicker">La comunidad de Librélula</span>
          <h1>Clubes de lectura</h1>
          <p>Historias que se disfrutan mejor en compañía.</p>
        </div>
        <div>
          <button type="button" className="clubs-primary-button" onClick={() => setCreateOpen(true)}>♙ Crear un club</button>
          <button type="button" className="clubs-secondary-button" onClick={() => setCodeDialogOpen(true)}>▣ Tengo un código</button>
          <button type="button" className="clubs-secondary-button" onClick={() => document.getElementById("discover-clubs")?.scrollIntoView({ behavior: "smooth" })}>◉ Explorar</button>
        </div>
      </header>

      <section className="clubs-my-section">
        <header><h2>Mis clubes</h2><span>{myClubs.length} en tu estantería social</span></header>
        {myClubs.length > 0 ? (
          <div className="clubs-my-grid">
            {myClubs.slice(0, 3).map((club) => <ClubCard key={club.id} club={club} onSelect={(nextClub) => setSelectedClubId(nextClub.id)} />)}
          </div>
        ) : (
          <div className="clubs-empty-card clubs-empty-wide">
            <span>☕</span><h3>Tu primera mesa está esperando</h3><p>Crea un club o únete a uno público para empezar.</p><button type="button" onClick={() => setCreateOpen(true)}>Crear mi primer club</button>
          </div>
        )}
      </section>

      {selectedClub && (
        <ClubPreview club={selectedClub} onEnter={enterClub} onInvite={copyInvite} onSelectBook={onSelectBook} />
      )}

      <section className="clubs-discover" id="discover-clubs">
        <div className="clubs-discover-main">
          <header><div><span className="clubs-kicker">Encuentra tu próxima conversación</span><h2>Descubre nuevos clubes</h2></div><span>{discover.length} públicos</span></header>
          {discover.length > 0 ? (
            <div className="clubs-discover-grid">
              {discover.slice(0, 6).map((club) => (
                <article key={club.id}>
                  <BookCover book={club.book} />
                  <div><span>{club.visibility === "public" ? "◌ Club público" : "▣ Club privado"}</span><h3>{club.name}</h3><p>Leyendo ahora</p><strong>{club.book?.title || "Próxima lectura por elegir"}</strong><small>{club.member_count} miembros</small></div>
                  <button type="button" onClick={() => enterClub(club)}>Unirme</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="clubs-empty-card"><span>❧</span><h3>No hay clubes públicos todavía</h3><p>El primero puede ser el tuyo.</p></div>
          )}
        </div>

        <aside className="clubs-recommended">
          <span className="clubs-kicker">Cerca de tus lecturas</span>
          <h2>Recomendados para ti</h2>
          {(discover.length ? discover.slice(0, 4) : myClubs.slice(0, 4)).map((club) => (
            <button type="button" key={club.id} onClick={() => setSelectedClubId(club.id)}>
              <BookCover book={club.book} /><span><strong>{club.name}</strong><small>{club.member_count} miembros</small></span><i>→</i>
            </button>
          ))}
          {discover.length === 0 && myClubs.length === 0 && <p>Cuando haya clubes, aparecerán aquí los más cercanos a tus gustos.</p>}
        </aside>
      </section>

      <nav className="clubs-mobile-bottom-nav" aria-label="Navegación móvil">
        <button type="button" onClick={onHome}>⌂<span>Inicio</span></button>
        <button type="button" onClick={onCatalog}>⌕<span>Buscar</span></button>
        <button type="button" className="is-create" onClick={() => setCreateOpen(true)}>＋<span>Crear</span></button>
        <button type="button" className="is-active">♟<span>Clubes</span></button>
        <button type="button" onClick={onProfile}>♙<span>Perfil</span></button>
      </nav>

      {createOpen && <CreateClubPanel onClose={() => setCreateOpen(false)} onCreated={async (club) => { setCreateOpen(false); await loadHub(); setSelectedClubId(club.id); const detail = await loadDetail(club.id); if (detail) { setClubData(detail); setInsideClub(true); } }} />}

      {inviteClub && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setInviteClub(null)}>
          <section className="clubs-invite-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <span>▣</span><h2>Este club es privado</h2><p>Introduce el código que te ha enviado una persona del club.</p>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="CÓDIGO DE INVITACIÓN" />
            <div><button type="button" onClick={() => setInviteClub(null)}>Cancelar</button><button type="button" className="clubs-primary-button" onClick={joinPrivate}>Entrar</button></div>
          </section>
        </div>
      )}

      {codeDialogOpen && (
        <div className="clubs-modal-backdrop" onMouseDown={() => setCodeDialogOpen(false)}>
          <section className="clubs-invite-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <span>✦</span><h2>Entrar con una invitación</h2><p>Pega el código del club privado que te han compartido.</p>
            <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="CÓDIGO DE INVITACIÓN" />
            <div><button type="button" onClick={() => setCodeDialogOpen(false)}>Cancelar</button><button type="button" className="clubs-primary-button" onClick={joinByCode}>Entrar</button></div>
          </section>
        </div>
      )}

      {clubLoading && <div className="clubs-overlay-loading"><span /><p>Abriendo el club…</p></div>}
    </main>
  );
}
