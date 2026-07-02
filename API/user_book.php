<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/user_book_status_schema.php';

try {
    librelulaEnsureUserBookStatusSchema($db);
} catch (Throwable) {
    userBookJson(['error' => 'No se pudo preparar la biblioteca personal'], 500);
}

function userBookJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function userBookTextLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function userBookGlobalData(PDO $db, string $bookId): array
{
    $stmt = $db->prepare('
        SELECT
            ROUND(AVG(score), 1) AS avg_rating,
            COUNT(score) AS total_ratings,
            COUNT(*) AS total_readers
        FROM user_books
        WHERE book_id = :book_id
    ');
    $stmt->execute([':book_id' => $bookId]);

    return $stmt->fetch() ?: [
        'avg_rating' => null,
        'total_ratings' => 0,
        'total_readers' => 0,
    ];
}

function userBookEnsureActivityTable(PDO $db): void
{
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS reading_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            activity_date DATE NOT NULL,
            points INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, activity_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    SQL);

    $db->exec('CREATE INDEX IF NOT EXISTS idx_reading_activity_user_date ON reading_activity(user_id, activity_date)');
}

function userBookLogActivity(PDO $db, int $userId, int $points): void
{
    userBookEnsureActivityTable($db);

    $stmt = $db->prepare(<<<'SQL'
        INSERT INTO reading_activity (user_id, activity_date, points)
        VALUES (:user_id, :activity_date, :points)
        ON CONFLICT(user_id, activity_date) DO UPDATE SET
            points = reading_activity.points + excluded.points,
            updated_at = CURRENT_TIMESTAMP
    SQL);
    $stmt->execute([
        ':user_id' => $userId,
        ':activity_date' => date('Y-m-d'),
        ':points' => max(1, $points),
    ]);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $bookId = trim((string) ($_GET['book_id'] ?? ''));

    if ($bookId === '') {
        userBookJson(['error' => 'book_id requerido'], 400);
    }

    $userId = librelulaCurrentUserId();
    $userBook = null;

    try {
        if ($userId !== null) {
            $stmt = $db->prepare('
                SELECT status, score, progress, notes, started_at, finished_at, read_count, paused_at, dropped_at
                FROM user_books
                WHERE user_id = :user_id AND book_id = :book_id
                LIMIT 1
            ');
            $stmt->execute([
                ':user_id' => $userId,
                ':book_id' => $bookId,
            ]);
            $userBook = $stmt->fetch() ?: null;
        }

        userBookJson([
            'authenticated' => $userId !== null,
            'user' => $userBook,
            'global' => userBookGlobalData($db, $bookId),
        ]);
    } catch (PDOException) {
        userBookJson(['error' => 'No se pudo consultar la información del libro'], 500);
    }
}

if ($method === 'POST') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        userBookJson(['error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    $bookId = trim((string) ($data['book_id'] ?? ''));

    if ($bookId === '') {
        userBookJson(['error' => 'book_id requerido'], 400);
    }

    $status = (string) ($data['status'] ?? 'planned');
    $allowedStatuses = ['reading', 'rereading', 'paused', 'completed', 'planned', 'dropped'];

    if (!in_array($status, $allowedStatuses, true)) {
        userBookJson(['error' => 'Estado no válido'], 400);
    }

    $score = $data['score'] ?? null;

    if ($score !== null && (!is_numeric($score) || $score < 1 || $score > 5)) {
        userBookJson(['error' => 'La puntuación debe estar entre 1 y 5'], 400);
    }

    $score = $score === null ? null : (int) $score;
    $progress = max(0, min(100, (int) ($data['progress'] ?? 0)));
    $notes = isset($data['notes']) ? trim((string) $data['notes']) : null;

    if ($notes !== null && userBookTextLength($notes) > 5000) {
        userBookJson(['error' => 'Las notas no pueden superar los 5000 caracteres'], 400);
    }

    $startedAt = !empty($data['started_at']) ? (string) $data['started_at'] : null;
    $finishedAt = !empty($data['finished_at']) ? (string) $data['finished_at'] : null;

    if (in_array($status, ['reading', 'rereading', 'paused'], true) && !$startedAt) {
        $startedAt = date('Y-m-d');
    }

    if ($status === 'completed') {
        $progress = 100;
        $finishedAt = $finishedAt ?: date('Y-m-d');
    } else {
        $finishedAt = null;
    }

    try {
        $existingStmt = $db->prepare('
            SELECT id, status, progress, read_count, paused_at, dropped_at
            FROM user_books
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        ');
        $existingStmt->execute([
            ':user_id' => $userId,
            ':book_id' => $bookId,
        ]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        $readCount = max(0, (int) ($existing['read_count'] ?? 0));
        $pausedAt = $status === 'paused' ? date('Y-m-d') : null;
        $droppedAt = $status === 'dropped' ? date('Y-m-d') : null;

        if ($status === 'rereading' && (string) ($existing['status'] ?? '') !== 'rereading') {
            $readCount = max(1, $readCount) + 1;
            $progress = 0;
            $startedAt = date('Y-m-d');
            $finishedAt = null;
        } elseif ($status === 'completed' && (string) ($existing['status'] ?? '') !== 'completed') {
            $readCount = max(1, $readCount);
        }

        if ($existing !== null) {
            $stmt = $db->prepare(<<<'SQL'
                UPDATE user_books
                SET
                    status = :status,
                    score = :score,
                    progress = :progress,
                    notes = :notes,
                    started_at = CASE
                        WHEN :status = 'rereading' THEN :started_at
                        ELSE COALESCE(started_at, :started_at)
                    END,
                    finished_at = :finished_at,
                    read_count = :read_count,
                    paused_at = :paused_at,
                    dropped_at = :dropped_at
                WHERE id = :id AND user_id = :user_id
            SQL);
            $stmt->execute([
                ':status' => $status,
                ':score' => $score,
                ':progress' => $progress,
                ':notes' => $notes ?: null,
                ':started_at' => $startedAt,
                ':finished_at' => $finishedAt,
                ':read_count' => $readCount,
                ':paused_at' => $pausedAt,
                ':dropped_at' => $droppedAt,
                ':id' => $existing['id'],
                ':user_id' => $userId,
            ]);
        } else {
            $stmt = $db->prepare(<<<'SQL'
                INSERT INTO user_books (
                    user_id, book_id, status, score, progress,
                    notes, started_at, finished_at, read_count, paused_at, dropped_at
                ) VALUES (
                    :user_id, :book_id, :status, :score, :progress,
                    :notes, :started_at, :finished_at, :read_count,
                    :paused_at, :dropped_at
                )
            SQL);
            $stmt->execute([
                ':user_id' => $userId,
                ':book_id' => $bookId,
                ':status' => $status,
                ':score' => $score,
                ':progress' => $progress,
                ':notes' => $notes ?: null,
                ':started_at' => $startedAt,
                ':finished_at' => $finishedAt,
                ':read_count' => $readCount,
                ':paused_at' => $pausedAt,
                ':dropped_at' => $droppedAt,
            ]);
        }

        $previousProgress = (int) ($existing['progress'] ?? 0);
        $previousStatus = (string) ($existing['status'] ?? '');
        $activityPoints = 1;

        if ($progress > $previousProgress) {
            $activityPoints += min(2, max(1, (int) ceil(($progress - $previousProgress) / 25)));
        }

        if ($status === 'completed' && $previousStatus !== 'completed') {
            $activityPoints += 2;
        }

        userBookLogActivity($db, $userId, $activityPoints);

        $stmt = $db->prepare('
            SELECT status, score, progress, notes, started_at, finished_at, read_count, paused_at, dropped_at
            FROM user_books
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        ');
        $stmt->execute([
            ':user_id' => $userId,
            ':book_id' => $bookId,
        ]);

        userBookJson([
            'ok' => true,
            'user' => $stmt->fetch() ?: null,
            'global' => userBookGlobalData($db, $bookId),
        ]);
    } catch (PDOException) {
        userBookJson(['error' => 'No se pudo guardar la información del libro'], 500);
    }
}

userBookJson(['error' => 'Método no permitido'], 405);
