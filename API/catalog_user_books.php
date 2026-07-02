<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/user_book_status_schema.php';

const CATALOG_READING_STATUSES = [
    'planned',
    'reading',
    'paused',
    'completed',
    'dropped',
    'rereading',
];

function catalogUserBooksJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function catalogUserBookRow(PDO $db, int $userId, string $bookId): ?array
{
    $stmt = $db->prepare(<<<'SQL'
        SELECT
            book_id,
            status,
            progress,
            started_at,
            finished_at,
            read_count,
            paused_at,
            dropped_at
        FROM user_books
        WHERE user_id = :user_id AND book_id = :book_id
        ORDER BY id DESC
        LIMIT 1
    SQL);
    $stmt->execute([
        ':user_id' => $userId,
        ':book_id' => $bookId,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $stmt->closeCursor();
    return is_array($row) ? $row : null;
}

try {
    librelulaEnsureUserBookStatusSchema($db);
} catch (Throwable) {
    catalogUserBooksJson(['error' => 'No se pudo preparar la biblioteca personal.'], 500);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $userId = librelulaCurrentUserId();

    if ($userId === null) {
        catalogUserBooksJson([
            'authenticated' => false,
            'item' => null,
            'items' => new stdClass(),
        ]);
    }

    $requestedBookId = trim((string) ($_GET['book_id'] ?? ''));

    try {
        if ($requestedBookId !== '') {
            catalogUserBooksJson([
                'authenticated' => true,
                'item' => catalogUserBookRow($db, $userId, $requestedBookId),
            ]);
        }

        $stmt = $db->prepare(<<<'SQL'
            SELECT
                book_id,
                status,
                progress,
                started_at,
                finished_at,
                read_count,
                paused_at,
                dropped_at
            FROM user_books
            WHERE user_id = :user_id
            ORDER BY id DESC
        SQL);
        $stmt->execute([':user_id' => $userId]);

        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $bookId = (string) ($row['book_id'] ?? '');
            if ($bookId !== '' && !isset($items[$bookId])) {
                $items[$bookId] = $row;
            }
        }
        $stmt->closeCursor();

        catalogUserBooksJson([
            'authenticated' => true,
            'items' => $items,
        ]);
    } catch (PDOException) {
        catalogUserBooksJson(['error' => 'No se pudo consultar tu biblioteca.'], 500);
    }
}

if ($method !== 'POST') {
    catalogUserBooksJson(['error' => 'Método no permitido.'], 405);
}

$userId = librelulaRequireLogin($db);
librelulaVerifyCsrf();

$data = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($data)) {
    catalogUserBooksJson(['error' => 'El cuerpo debe ser JSON válido.'], 400);
}

$bookId = trim((string) ($data['book_id'] ?? ''));
$status = trim((string) ($data['status'] ?? ''));

if ($bookId === '') {
    catalogUserBooksJson(['error' => 'Falta el libro.'], 400);
}
if (!in_array($status, CATALOG_READING_STATUSES, true)) {
    catalogUserBooksJson(['error' => 'El estado seleccionado no es válido.'], 400);
}

try {
    $bookStmt = $db->prepare('SELECT 1 FROM books WHERE id = :book_id LIMIT 1');
    $bookStmt->execute([':book_id' => $bookId]);
    $bookExists = (bool) $bookStmt->fetchColumn();
    $bookStmt->closeCursor();

    if (!$bookExists) {
        catalogUserBooksJson(['error' => 'El libro no existe en el catálogo.'], 404);
    }

    $existingStmt = $db->prepare(<<<'SQL'
        SELECT
            id,
            status,
            progress,
            started_at,
            finished_at,
            read_count,
            paused_at,
            dropped_at
        FROM user_books
        WHERE user_id = :user_id AND book_id = :book_id
        ORDER BY id DESC
        LIMIT 1
    SQL);
    $existingStmt->execute([
        ':user_id' => $userId,
        ':book_id' => $bookId,
    ]);
    $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    $existingStmt->closeCursor();

    $today = date('Y-m-d');
    $previousStatus = (string) ($existing['status'] ?? '');
    $progress = max(0, min(100, (int) ($existing['progress'] ?? 0)));
    $startedAt = $existing['started_at'] ?? null;
    $finishedAt = $existing['finished_at'] ?? null;
    $pausedAt = $existing['paused_at'] ?? null;
    $droppedAt = $existing['dropped_at'] ?? null;
    $readCount = max(0, (int) ($existing['read_count'] ?? 0));

    switch ($status) {
        case 'planned':
            $progress = 0;
            $startedAt = null;
            $finishedAt = null;
            $pausedAt = null;
            $droppedAt = null;
            break;

        case 'reading':
            if ($progress >= 100 || in_array($previousStatus, ['completed', 'rereading'], true)) {
                $progress = 0;
            }
            $startedAt = $startedAt ?: $today;
            $finishedAt = null;
            $pausedAt = null;
            $droppedAt = null;
            break;

        case 'paused':
            $startedAt = $startedAt ?: $today;
            $finishedAt = null;
            $pausedAt = $today;
            $droppedAt = null;
            break;

        case 'rereading':
            $progress = 0;
            $startedAt = $today;
            $finishedAt = null;
            $pausedAt = null;
            $droppedAt = null;
            if ($previousStatus !== 'rereading') {
                $readCount = max(1, $readCount) + 1;
            }
            break;

        case 'completed':
            $progress = 100;
            $startedAt = $startedAt ?: $today;
            $finishedAt = $today;
            $pausedAt = null;
            $droppedAt = null;
            if ($previousStatus !== 'completed') {
                $readCount = max(1, $readCount);
            }
            break;

        case 'dropped':
            $finishedAt = null;
            $pausedAt = null;
            $droppedAt = $today;
            break;
    }

    if ($existing) {
        $stmt = $db->prepare(<<<'SQL'
            UPDATE user_books
            SET
                status = :status,
                progress = :progress,
                started_at = :started_at,
                finished_at = :finished_at,
                read_count = :read_count,
                paused_at = :paused_at,
                dropped_at = :dropped_at
            WHERE id = :id AND user_id = :user_id
        SQL);
        $stmt->execute([
            ':status' => $status,
            ':progress' => $progress,
            ':started_at' => $startedAt,
            ':finished_at' => $finishedAt,
            ':read_count' => $readCount,
            ':paused_at' => $pausedAt,
            ':dropped_at' => $droppedAt,
            ':id' => (int) $existing['id'],
            ':user_id' => $userId,
        ]);
    } else {
        $stmt = $db->prepare(<<<'SQL'
            INSERT INTO user_books (
                user_id,
                book_id,
                status,
                progress,
                started_at,
                finished_at,
                read_count,
                paused_at,
                dropped_at
            ) VALUES (
                :user_id,
                :book_id,
                :status,
                :progress,
                :started_at,
                :finished_at,
                :read_count,
                :paused_at,
                :dropped_at
            )
        SQL);
        $stmt->execute([
            ':user_id' => $userId,
            ':book_id' => $bookId,
            ':status' => $status,
            ':progress' => $progress,
            ':started_at' => $startedAt,
            ':finished_at' => $finishedAt,
            ':read_count' => $readCount,
            ':paused_at' => $pausedAt,
            ':dropped_at' => $droppedAt,
        ]);
    }

    catalogUserBooksJson([
        'ok' => true,
        'item' => catalogUserBookRow($db, $userId, $bookId),
    ]);
} catch (PDOException) {
    catalogUserBooksJson(['error' => 'No se pudo guardar el estado del libro.'], 500);
}
