<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';

function bookPostitsJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bookPostitsEnsureSchema(PDO $db): void
{
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS book_postits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            book_id TEXT NOT NULL,
            quote TEXT NOT NULL,
            page INTEGER,
            color TEXT NOT NULL DEFAULT 'yellow',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            CHECK (page IS NULL OR page > 0),
            CHECK (color IN ('yellow', 'pink', 'blue', 'green', 'lilac'))
        )
    SQL);

    $db->exec('CREATE INDEX IF NOT EXISTS idx_book_postits_user_book ON book_postits(user_id, book_id, created_at)');
}

function bookPostitsLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function bookPostitsList(PDO $db, int $userId, string $bookId): array
{
    $stmt = $db->prepare(<<<'SQL'
        SELECT id, quote, page, color, created_at
        FROM book_postits
        WHERE user_id = :user_id AND book_id = :book_id
        ORDER BY datetime(created_at) ASC, id ASC
    SQL);
    $stmt->execute([
        ':user_id' => $userId,
        ':book_id' => $bookId,
    ]);

    return array_map(
        static fn (array $row): array => [
            'id' => (int) $row['id'],
            'quote' => (string) $row['quote'],
            'page' => $row['page'] === null ? null : (int) $row['page'],
            'color' => (string) $row['color'],
            'created_at' => $row['created_at'] ?: null,
        ],
        $stmt->fetchAll(PDO::FETCH_ASSOC)
    );
}

try {
    bookPostitsEnsureSchema($db);
} catch (PDOException) {
    bookPostitsJson(['error' => 'No se pudo preparar el espacio de post-its'], 500);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $bookId = trim((string) ($_GET['book_id'] ?? ''));

    if ($bookId === '') {
        bookPostitsJson(['error' => 'book_id requerido'], 400);
    }

    $userId = librelulaCurrentUserId();

    if ($userId === null) {
        bookPostitsJson([
            'authenticated' => false,
            'postits' => [],
        ]);
    }

    try {
        bookPostitsJson([
            'authenticated' => true,
            'postits' => bookPostitsList($db, $userId, $bookId),
        ]);
    } catch (PDOException) {
        bookPostitsJson(['error' => 'No se pudieron cargar tus post-its'], 500);
    }
}

if ($method === 'POST') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        bookPostitsJson(['error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    $bookId = trim((string) ($data['book_id'] ?? ''));
    $quote = trim((string) ($data['quote'] ?? ''));
    $color = trim((string) ($data['color'] ?? 'yellow'));
    $allowedColors = ['yellow', 'pink', 'blue', 'green', 'lilac'];

    if ($bookId === '') {
        bookPostitsJson(['error' => 'book_id requerido'], 400);
    }

    if ($quote === '') {
        bookPostitsJson(['error' => 'Escribe una frase antes de añadir el post-it'], 400);
    }

    if (bookPostitsLength($quote) > 1200) {
        bookPostitsJson(['error' => 'La frase no puede superar los 1200 caracteres'], 400);
    }

    if (!in_array($color, $allowedColors, true)) {
        $color = 'yellow';
    }

    $rawPage = $data['page'] ?? null;
    $page = null;

    if ($rawPage !== null && $rawPage !== '') {
        $page = filter_var($rawPage, FILTER_VALIDATE_INT);

        if ($page === false || $page < 1 || $page > 99999) {
            bookPostitsJson(['error' => 'La página debe ser un número positivo'], 400);
        }
    }

    try {
        $bookStmt = $db->prepare('SELECT 1 FROM books WHERE id = :book_id LIMIT 1');
        $bookStmt->execute([':book_id' => $bookId]);

        if (!$bookStmt->fetchColumn()) {
            bookPostitsJson(['error' => 'El libro no existe'], 404);
        }

        $stmt = $db->prepare(<<<'SQL'
            INSERT INTO book_postits (user_id, book_id, quote, page, color)
            VALUES (:user_id, :book_id, :quote, :page, :color)
        SQL);
        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':book_id', $bookId, PDO::PARAM_STR);
        $stmt->bindValue(':quote', $quote, PDO::PARAM_STR);
        $stmt->bindValue(':page', $page, $page === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':color', $color, PDO::PARAM_STR);
        $stmt->execute();

        $id = (int) $db->lastInsertId();
        $createdStmt = $db->prepare(<<<'SQL'
            SELECT id, quote, page, color, created_at
            FROM book_postits
            WHERE id = :id AND user_id = :user_id
            LIMIT 1
        SQL);
        $createdStmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
        ]);
        $row = $createdStmt->fetch(PDO::FETCH_ASSOC);

        bookPostitsJson([
            'ok' => true,
            'postit' => [
                'id' => (int) $row['id'],
                'quote' => (string) $row['quote'],
                'page' => $row['page'] === null ? null : (int) $row['page'],
                'color' => (string) $row['color'],
                'created_at' => $row['created_at'] ?: null,
            ],
        ], 201);
    } catch (PDOException) {
        bookPostitsJson(['error' => 'No se pudo guardar el post-it'], 500);
    }
}

if ($method === 'DELETE') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        bookPostitsJson(['error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);

    if ($id === false || $id < 1) {
        bookPostitsJson(['error' => 'ID de post-it inválido'], 400);
    }

    try {
        $stmt = $db->prepare('DELETE FROM book_postits WHERE id = :id AND user_id = :user_id');
        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
        ]);

        if ($stmt->rowCount() === 0) {
            bookPostitsJson(['error' => 'El post-it no existe'], 404);
        }

        bookPostitsJson(['ok' => true]);
    } catch (PDOException) {
        bookPostitsJson(['error' => 'No se pudo eliminar el post-it'], 500);
    }
}

bookPostitsJson(['error' => 'Método no permitido'], 405);
