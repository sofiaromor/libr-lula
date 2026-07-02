<?php

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../includes/auth.php";
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

function deleteLocalFile(?string $publicPath): void
{
    if (!$publicPath) {
        return;
    }

    $path = parse_url($publicPath, PHP_URL_PATH);
    $normalized = ltrim(is_string($path) ? $path : $publicPath, "/");

    if (str_starts_with($normalized, "librelula/")) {
        $normalized = substr($normalized, strlen("librelula/"));
    }

    $allowedDirectories = [
        "images/covers/" => dirname(__DIR__) . "/images/covers/",
        "files/pdf/" => dirname(__DIR__) . "/files/pdf/",
        "files/epub/" => dirname(__DIR__) . "/files/epub/",
    ];

    foreach ($allowedDirectories as $publicDirectory => $diskDirectory) {
        if (str_starts_with($normalized, $publicDirectory)) {
            $diskPath = $diskDirectory . basename($normalized);

            if (is_file($diskPath)) {
                unlink($diskPath);
            }

            return;
        }
    }
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    sendJson(["error" => "Método no permitido"], 405);
}

$input = json_decode(file_get_contents("php://input"), true);

if (!is_array($input)) {
    sendJson(["error" => "La petición no contiene un JSON válido"], 400);
}

$bookId = trim((string) ($input["id"] ?? ""));

if ($bookId === "") {
    sendJson(["error" => "Falta el identificador del libro"], 400);
}

try {
    $stmt = $db->prepare("
        SELECT
            id,
            title,
            cover,
            pdf_file,
            epub_file
        FROM books
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ":id" => $bookId,
    ]);

    $book = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$book) {
        sendJson(["error" => "El libro no existe"], 404);
    }

    $db->beginTransaction();

    /*
     * Borramos primero las relaciones para evitar problemas
     * si existen claves foráneas.
     */
    librelulaBookTaxonomyEnsureSchema($db);

    $stmt = $db->prepare("
        DELETE FROM book_taxonomy
        WHERE book_id = :book_id
    ");

    $stmt->execute([
        ":book_id" => $bookId,
    ]);

    $stmt = $db->prepare("
        DELETE FROM reviews
        WHERE book_id = :book_id
    ");

    $stmt->execute([
        ":book_id" => $bookId,
    ]);

    $stmt = $db->prepare("
        DELETE FROM user_books
        WHERE book_id = :book_id
    ");

    $stmt->execute([
        ":book_id" => $bookId,
    ]);

    $stmt = $db->prepare("
        DELETE FROM books
        WHERE id = :id
    ");

    $stmt->execute([
        ":id" => $bookId,
    ]);

    $db->commit();

    /*
     * Los archivos se eliminan después de confirmar la operación.
     * Las URLs externas de Goodreads/Open Library no se tocan.
     */
    deleteLocalFile($book["cover"] ?? null);
    deleteLocalFile($book["pdf_file"] ?? null);
    deleteLocalFile($book["epub_file"] ?? null);

    sendJson([
        "ok" => true,
        "message" => "Libro eliminado correctamente",
        "deleted_book" => [
            "id" => $book["id"],
            "title" => $book["title"],
        ],
    ]);

} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    sendJson([
        "error" => "No se pudo eliminar el libro",
    ], 500);
}
