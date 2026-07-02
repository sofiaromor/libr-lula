<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/hero_color_helpers.php';
require_once __DIR__ . '/../includes/book_taxonomy.php';
require_once __DIR__ . '/../includes/genre_normalization.php';

function externalJson(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function externalText(mixed $value, int $maximumLength): ?string
{
    $text = trim((string) $value);

    if ($text === '') {
        return null;
    }

    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maximumLength, 'UTF-8');
    }

    return substr($text, 0, $maximumLength);
}

function externalBookById(PDO $db, string $bookId): ?array
{
    $stmt = $db->prepare("
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
        WHERE id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $bookId]);
    $book = $stmt->fetch(PDO::FETCH_ASSOC);

    return is_array($book) ? librelulaBookTaxonomyAttachOne($db, $book) : null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    externalJson(['error' => 'Método no permitido'], 405);
}

$userId = librelulaRequireLogin($db);
$isAdmin = librelulaIsAdmin($db);
librelulaVerifyCsrf();

$raw = file_get_contents('php://input');
$payload = json_decode(is_string($raw) ? $raw : '', true);

if (!is_array($payload)) {
    externalJson(['error' => 'Los datos del libro no son válidos.'], 400);
}

$title = externalText($payload['title'] ?? null, 250);
$author = externalText($payload['author'] ?? null, 250);
$language = externalText($payload['language'] ?? null, 12) ?? 'es';

if ($title === null) {
    externalJson(['error' => 'El título es obligatorio.'], 400);
}

if ($author === null) {
    externalJson(['error' => 'El autor es obligatorio.'], 400);
}

if (!preg_match('/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i', $language)) {
    $language = 'es';
}

$synopsis = externalText($payload['description'] ?? $payload['synopsis'] ?? null, 12000);
$publisher = externalText($payload['publisher'] ?? null, 250);
$isbn = externalText($payload['isbn'] ?? null, 30);
$provider = externalText($payload['provider'] ?? null, 40) ?? 'external';
$sourceId = externalText($payload['source_id'] ?? null, 180);

if (!$isAdmin && !in_array($provider, ['open_library', 'google_books'], true)) {
    externalJson(['error' => 'Solo se pueden guardar resultados procedentes de Open Library o Google Books.'], 403);
}

$cover = externalText($payload['cover'] ?? null, 1200);

if ($cover !== null) {
    $parts = parse_url($cover);
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));

    if (!in_array($scheme, ['http', 'https'], true)) {
        $cover = null;
    }
}

$year = null;

if (isset($payload['year']) && is_numeric($payload['year'])) {
    $candidateYear = (int) $payload['year'];

    if ($candidateYear >= 1 && $candidateYear <= ((int) date('Y') + 1)) {
        $year = $candidateYear;
    }
}

$pages = null;

if (isset($payload['pages']) && is_numeric($payload['pages'])) {
    $candidatePages = (int) $payload['pages'];

    if ($candidatePages >= 1 && $candidatePages <= 100000) {
        $pages = $candidatePages;
    }
}

$classification = librelulaClassifyBookTags($payload['genres'] ?? []);
$genre = $classification['genres'] !== []
    ? json_encode($classification['genres'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    : null;

$themes = librelulaMergeTagLists($payload['themes'] ?? [], $classification['themes']);
$audiences = librelulaMergeTagLists($payload['audiences'] ?? [], $classification['audiences']);
$aesthetics = librelulaMergeTagLists($payload['aesthetics'] ?? [], $classification['aesthetics']);

try {
    $duplicateConditions = [];
    $duplicateParams = [];

    if ($isbn !== null) {
        $normalizedIsbn = preg_replace('/[^0-9X]/i', '', $isbn);

        if (is_string($normalizedIsbn) && $normalizedIsbn !== '') {
            $duplicateConditions[] = "REPLACE(REPLACE(REPLACE(UPPER(COALESCE(isbn, '')), '-', ''), ' ', ''), '.', '') = :isbn";
            $duplicateParams[':isbn'] = strtoupper($normalizedIsbn);
        }
    }

    $duplicateConditions[] = "LOWER(TRIM(title)) = LOWER(TRIM(:title)) AND LOWER(TRIM(author)) = LOWER(TRIM(:author))";
    $duplicateParams[':title'] = $title;
    $duplicateParams[':author'] = $author;

    $duplicateStmt = $db->prepare(
        'SELECT id FROM books WHERE ' . implode(' OR ', $duplicateConditions) . ' LIMIT 1'
    );
    $duplicateStmt->execute($duplicateParams);
    $existingId = $duplicateStmt->fetchColumn();

    if (is_string($existingId) && $existingId !== '') {
        externalJson([
            'ok' => true,
            'already_exists' => true,
            'message' => 'Ese libro ya estaba en el catálogo.',
            'book' => externalBookById($db, $existingId),
        ]);
    }

    $safeProvider = preg_replace('/[^a-z0-9]+/i', '_', strtolower($provider));
    $safeSourceId = preg_replace('/[^a-z0-9_-]+/i', '_', strtolower((string) $sourceId));
    $safeProvider = trim((string) $safeProvider, '_');
    $safeSourceId = trim((string) $safeSourceId, '_');

    if ($safeProvider !== '' && $safeSourceId !== '') {
        $bookId = substr($safeProvider . '_' . $safeSourceId, 0, 180);
    } else {
        $bookId = 'external_' . bin2hex(random_bytes(12));
    }

    if (externalBookById($db, $bookId) !== null) {
        $bookId = 'external_' . bin2hex(random_bytes(12));
    }

    $db->beginTransaction();

    $stmt = $db->prepare("
        INSERT INTO books (
            id,
            title,
            author,
            synopsis,
            cover,
            genre,
            year,
            pages,
            language,
            publisher,
            isbn,
            saga_name,
            saga_number,
            saga_key,
            hero_color,
            created_by,
            pdf_file,
            epub_file
        ) VALUES (
            :id,
            :title,
            :author,
            :synopsis,
            :cover,
            :genre,
            :year,
            :pages,
            :language,
            :publisher,
            :isbn,
            NULL,
            NULL,
            NULL,
            :hero_color,
            :created_by,
            NULL,
            NULL
        )
    ");

    $stmt->execute([
        ':id' => $bookId,
        ':title' => $title,
        ':author' => $author,
        ':synopsis' => $synopsis,
        ':cover' => $cover,
        ':genre' => $genre,
        ':year' => $year,
        ':pages' => $pages,
        ':language' => strtolower($language),
        ':publisher' => $publisher,
        ':isbn' => $isbn,
        ':hero_color' => LIBRELULA_FALLBACK_HERO_COLOR,
        ':created_by' => $userId,
    ]);

    librelulaBookTaxonomyReplace($db, $bookId, 'theme', $themes, 12);
    librelulaBookTaxonomyReplace($db, $bookId, 'audience', $audiences, 4);
    librelulaBookTaxonomyReplace($db, $bookId, 'aesthetic', $aesthetics, 8);
    $db->commit();

    externalJson([
        'ok' => true,
        'already_exists' => false,
        'message' => 'Libro añadido correctamente.',
        'book' => externalBookById($db, $bookId),
    ], 201);
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    externalJson([
        'error' => 'No se pudo añadir el libro al catálogo.',
    ], 500);
}
