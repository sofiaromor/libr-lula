<?php

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../includes/book_taxonomy.php";

function sendJson(array $data, int $status = 200): void
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    sendJson(["error" => "Método no permitido"], 405);
}

try {
    $stmt = $db->query("
        SELECT
            id,
            title,
            author,
            synopsis,
            cover,
            genre,
            year,
            pages,
            publisher,
            language,
            isbn,
            saga_name,
            saga_number,
            saga_key,
            hero_color,
            pdf_file,
            epub_file,
            created_at
        FROM books
        ORDER BY
            CASE
                WHEN TRIM(COALESCE(year, '')) GLOB '[0-9][0-9][0-9][0-9]'
                THEN CAST(year AS INTEGER)
                ELSE 0
            END DESC,
            title COLLATE NOCASE ASC,
            author COLLATE NOCASE ASC
    ");

    $books = $stmt->fetchAll(PDO::FETCH_ASSOC);
    librelulaBookTaxonomyAttach($db, $books);

    sendJson([
        "ok" => true,
        "books" => $books,
    ]);
} catch (PDOException $error) {
    sendJson([
        "error" => "No se pudieron obtener los libros",
    ], 500);
}
