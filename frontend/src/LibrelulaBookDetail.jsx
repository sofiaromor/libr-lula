import { useEffect, useState } from "react";
import { apiFetch } from "./api.js";

/*
========================================
FILE: librelula-book-detail.jsx
PURPOSE:
- Busca un libro en Google Books.
- Consulta en PHP los datos reales del usuario para ese libro.
BACKEND:
- /librelula/API/user_book.php
NOTE:
- El backend devuelve { user, global }.
- La puntuación se llama "score", no "rating".
========================================
*/

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=Lato:wght@300;400;700&display=swap');`;

async function readJsonResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("La API no devolvió un JSON válido.");
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || "Ha ocurrido un error en la API.");
  }

  return data;
}

// Consulta el estado del libro para el usuario actual.
async function fetchUserBook(bookId) {
  const response = await apiFetch(
    `user_book.php?book_id=${encodeURIComponent(bookId)}`
  );

  return readJsonResponse(response);
}

// Busca un libro en Google Books.
async function fetchBook(query) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        query
      )}&maxResults=1`
    );

    if (!response.ok) {
      throw new Error("Google Books no respondió correctamente.");
    }

    const data = await response.json();
    const item = data?.items?.[0];

    if (!item) {
      return null;
    }

    const volume = item.volumeInfo;

    return {
      id: item.id,
      title: volume.title || "Sin título",
      author: volume.authors?.join(", ") || "Autor desconocido",
      year: volume.publishedDate?.slice(0, 4) || "—",
      pages: volume.pageCount || null,
      cover:
        volume.imageLinks?.thumbnail
          ?.replace("http://", "https://")
          .replace("&edge=curl", "") || null,
      description: volume.description || null,
      genres: volume.categories || [],
      publisher: volume.publisher || null,
      language: volume.language || null,
      isbn:
        volume.industryIdentifiers?.find(
          (identifier) => identifier.type === "ISBN_13"
        )?.identifier || null,
      source: "google",
    };
  } catch {
    return null;
  }
}

export default function LibrelulaBookDetail() {
  const initialQuery = "Where the Trees Were Inga Simpson";

  const [query, setQuery] = useState(initialQuery);
  const [inputVal, setInputVal] = useState(initialQuery);

  const [book, setBook] = useState(null);
  const [userData, setUserData] = useState(null);
  const [globalData, setGlobalData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setBook(null);
      setUserData(null);
      setGlobalData(null);

      const result = await fetchBook(query);

      if (cancelled) {
        return;
      }

      if (!result) {
        setError(
          "No se encontró el libro. Prueba con otro título, autor o ISBN."
        );
        setLoading(false);
        return;
      }

      setBook(result);

      try {
        const apiData = await fetchUserBook(result.id);

        if (cancelled) {
          return;
        }

        setUserData(apiData.user || null);
        setGlobalData(apiData.global || null);
      } catch (apiError) {
        if (!cancelled) {
          setError(apiError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [query]);

  function handleSearch(event) {
    event.preventDefault();

    const cleanQuery = inputVal.trim();

    if (cleanQuery) {
      setQuery(cleanQuery);
    }
  }

  return (
    <>
      <style>{FONTS}</style>

      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          fontFamily: "'Lato', sans-serif",
        }}
      >
        <form
          onSubmit={handleSearch}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            value={inputVal}
            onChange={(event) => setInputVal(event.target.value)}
            placeholder="Buscar libro..."
            style={{ flex: 1, padding: 10 }}
          />

          <button type="submit">Buscar</button>
        </form>

        {error && <p style={{ color: "red" }}>{error}</p>}

        {loading && <p>Cargando...</p>}

        {!loading && book && (
          <div style={{ marginTop: 20 }}>
            <h2>{book.title}</h2>
            <p>{book.author}</p>

            {userData ? (
              <div>
                <p>Estado: {userData.status}</p>
                <p>
                  Puntuación:{" "}
                  {userData.score !== null ? userData.score : "Sin valorar"}
                </p>
                <p>Progreso: {userData.progress ?? 0}%</p>
                <p>Notas: {userData.notes || "Sin notas"}</p>
                <p>
                  Fecha de inicio: {userData.started_at || "No registrada"}
                </p>
                <p>
                  Fecha de finalización:{" "}
                  {userData.finished_at || "No registrada"}
                </p>
              </div>
            ) : (
              <p>No tienes datos de este libro todavía.</p>
            )}

            <div style={{ marginTop: 16 }}>
              <p>
                Media global:{" "}
                {globalData?.avg_rating !== null &&
                globalData?.avg_rating !== undefined
                  ? globalData.avg_rating
                  : "Sin valoraciones"}
              </p>
              <p>
                Valoraciones: {Number(globalData?.total_ratings || 0)}
              </p>
              <p>
                Lectores: {Number(globalData?.total_readers || 0)}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
