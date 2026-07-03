import { useEffect, useState } from "react";
import { apiFetch, publicUrl, readJsonResponse } from "./api.js";
import "./MisResenas.css";

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function scoreLabel(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) {
    return "Sin puntuación";
  }

  return `${value} de 5`;
}

export default function MisResenas({ onOpenCatalog, onSelectBook }) {
  const [reviews, setReviews] = useState([]);
  const [authenticated, setAuthenticated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      setLoading(true);
      setError("");

      try {
        const response = await apiFetch("my_reviews.php");
        const data = await readJsonResponse(response);

        if (!cancelled) {
          setAuthenticated(Boolean(data.authenticated));
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudieron cargar tus reseñas.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReviews();

    return () => {
      cancelled = true;
    };
  }, []);

  function openBook(review) {
    if (typeof onSelectBook === "function" && review?.book) {
      onSelectBook(review.book);
    }
  }

  return (
    <main className="my-reviews-page">
      <section className="my-reviews-hero">
        <div>
          <span className="my-reviews-kicker">Tu estantería emocional</span>
          <h1>Mis reseñas</h1>
          <p>
            Reúne las puntuaciones y opiniones que has dejado en Librélula.
          </p>
        </div>

        <button type="button" onClick={onOpenCatalog}>
          Explorar catálogo
        </button>
      </section>

      {loading && (
        <p className="my-reviews-message">Cargando tus reseñas…</p>
      )}

      {error && (
        <p className="my-reviews-feedback is-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !authenticated && (
        <section className="my-reviews-empty">
          <h2>Inicia sesión para ver tus reseñas</h2>
          <p>Tu lista de reseñas está vinculada a tu cuenta.</p>
        </section>
      )}

      {!loading && !error && authenticated && reviews.length === 0 && (
        <section className="my-reviews-empty">
          <h2>Todavía no has escrito reseñas</h2>
          <p>
            Puntúa o escribe tu opinión desde la ficha de cualquier libro y
            aparecerá aquí.
          </p>
          <button type="button" onClick={onOpenCatalog}>
            Buscar un libro
          </button>
        </section>
      )}

      {!loading && !error && authenticated && reviews.length > 0 && (
        <section className="my-reviews-list" aria-label="Listado de mis reseñas">
          {reviews.map((review) => {
            const book = review.book || {};
            const cover = publicUrl(book.cover || "");

            return (
              <article className="my-review-card" key={review.id || review.book_id}>
                <div className="my-review-cover">
                  {cover ? (
                    <img src={cover} alt={`Portada de ${book.title || "libro"}`} />
                  ) : (
                    <span>Sin portada</span>
                  )}
                </div>

                <div className="my-review-content">
                  <div className="my-review-heading">
                    <div>
                      <span className="my-review-score">
                        ★ {scoreLabel(review.score)}
                      </span>
                      <h2>{book.title || "Libro sin título"}</h2>
                      {book.author && <p>{book.author}</p>}
                    </div>

                    {review.date && (
                      <time dateTime={review.date}>{formatDate(review.date)}</time>
                    )}
                  </div>

                  {review.review ? (
                    <p className="my-review-text">{review.review}</p>
                  ) : (
                    <p className="my-review-text is-empty">
                      Aún no has escrito texto para esta puntuación.
                    </p>
                  )}

                  <div className="my-review-actions">
                    <button type="button" onClick={() => openBook(review)}>
                      Abrir libro
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}