<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/hero_color_helpers.php';
require_once __DIR__ . '/../includes/book_taxonomy.php';

function bookJson(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id = trim((string) ($_GET['id'] ?? ''));

    if ($id === '') {
        bookJson(['error' => 'ID requerido'], 400);
    }

    $stmt = $db->prepare('SELECT * FROM books WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $book = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    $book = librelulaBookTaxonomyAttachOne($db, $book);

    bookJson([
        'source' => $book ? 'cache' : 'none',
        'book' => $book,
    ]);
}

if ($method === 'POST') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        bookJson(['error' => 'Datos inválidos'], 400);
    }

    $id = trim((string) ($data['id'] ?? ''));
    $title = trim((string) ($data['title'] ?? ''));
    $author = trim((string) ($data['author'] ?? ''));

    if ($id === '' || $title === '' || $author === '') {
        bookJson(['error' => 'Faltan el identificador, el título o el autor'], 400);
    }

    $genres = $data['genres'] ?? $data['genre'] ?? null;

    if (is_array($genres)) {
        $genres = implode(', ', array_filter(array_map('strval', $genres)));
    }

    $stmt = $db->prepare('
        INSERT INTO books (
            id, title, author, year, pages, cover, synopsis,
            language, genre, publisher, isbn, hero_color, created_by
        ) VALUES (
            :id, :title, :author, :year, :pages, :cover, :synopsis,
            :language, :genre, :publisher, :isbn, :hero_color, :created_by
        )
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            year = COALESCE(excluded.year, books.year),
            pages = COALESCE(excluded.pages, books.pages),
            cover = COALESCE(excluded.cover, books.cover),
            synopsis = COALESCE(excluded.synopsis, books.synopsis),
            language = COALESCE(excluded.language, books.language),
            genre = COALESCE(excluded.genre, books.genre),
            publisher = COALESCE(excluded.publisher, books.publisher),
            isbn = COALESCE(excluded.isbn, books.isbn),
            hero_color = COALESCE(books.hero_color, excluded.hero_color)
    ');

    $db->beginTransaction();

    try {
        $stmt->execute([
            ':id' => $id,
            ':title' => $title,
            ':author' => $author,
            ':year' => !empty($data['year']) ? (string) $data['year'] : null,
            ':pages' => isset($data['pages']) && is_numeric($data['pages']) ? (int) $data['pages'] : null,
            ':cover' => $data['cover'] ?? $data['cover_url'] ?? null,
            ':synopsis' => $data['description'] ?? $data['synopsis'] ?? null,
            ':language' => $data['language'] ?? null,
            ':genre' => is_string($genres) && trim($genres) !== '' ? trim($genres) : null,
            ':publisher' => $data['publisher'] ?? null,
            ':isbn' => $data['isbn'] ?? null,
            ':hero_color' => librelulaNormalizeHeroColor($data['hero_color'] ?? null),
            ':created_by' => $userId,
        ]);

        librelulaBookTaxonomyReplace($db, $id, 'theme', $data['themes'] ?? [], 12);
        librelulaBookTaxonomyReplace($db, $id, 'audience', $data['audiences'] ?? [], 4);
        librelulaBookTaxonomyReplace($db, $id, 'aesthetic', $data['aesthetics'] ?? [], 8);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    bookJson(['ok' => true]);
}

bookJson(['error' => 'Método no permitido'], 405);
