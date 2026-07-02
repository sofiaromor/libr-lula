<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/profile_favorites.php';

function profileFavoritesJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function profileFavoritesTextLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function profileFavoritesNormalize(string $value): string
{
    $value = trim($value);

    if (function_exists('mb_strtolower')) {
        $value = mb_strtolower($value, 'UTF-8');
    } else {
        $value = strtolower($value);
    }

    if (class_exists('Transliterator')) {
        $transliterator = Transliterator::create('NFD; [:Nonspacing Mark:] Remove; NFC');
        if ($transliterator !== null) {
            $converted = $transliterator->transliterate($value);
            if (is_string($converted)) {
                $value = $converted;
            }
        }
    } elseif (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($converted) && $converted !== '') {
            $value = $converted;
        }
    }

    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

    return trim($value);
}

/** @return list<string> */
function profileFavoritesSplitAuthors(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        return [];
    }

    $parts = preg_split('/\s*(?:&|;|\s+y\s+)\s*/iu', $raw) ?: [$raw];
    $authors = [];

    foreach ($parts as $part) {
        $author = trim((string) $part, " \t\n\r\0\x0B,");
        if ($author === '') {
            continue;
        }

        $key = profileFavoritesNormalize($author);
        if ($key !== '' && !isset($authors[$key])) {
            $authors[$key] = $author;
        }
    }

    return array_values($authors);
}

/** @return list<array{id:string,title:string,author:string,cover:string}> */
function profileFavoritesSearchBooks(PDO $db, string $query): array
{
    $needle = profileFavoritesNormalize($query);
    $rows = $db->query('SELECT id, title, author, cover FROM books ORDER BY title COLLATE NOCASE ASC')
        ->fetchAll(PDO::FETCH_ASSOC);
    $matches = [];

    foreach ($rows as $row) {
        $title = trim((string) ($row['title'] ?? ''));
        $author = trim((string) ($row['author'] ?? ''));
        $titleNormalized = profileFavoritesNormalize($title);
        $authorNormalized = profileFavoritesNormalize($author);

        $titlePos = strpos($titleNormalized, $needle);
        $authorPos = strpos($authorNormalized, $needle);

        if ($titlePos === false && $authorPos === false) {
            continue;
        }

        $score = 50;
        if ($titleNormalized === $needle) {
            $score = 0;
        } elseif ($authorNormalized === $needle) {
            $score = 5;
        } elseif ($titlePos === 0) {
            $score = 10;
        } elseif ($authorPos === 0) {
            $score = 20;
        } elseif ($titlePos !== false) {
            $score = 30;
        } else {
            $score = 40;
        }

        $matches[] = [
            'score' => $score,
            'id' => (string) ($row['id'] ?? ''),
            'title' => $title !== '' ? $title : 'Sin título',
            'author' => $author !== '' ? $author : 'Autor desconocido',
            'cover' => trim((string) ($row['cover'] ?? '')),
        ];
    }

    usort($matches, static function (array $a, array $b): int {
        return [$a['score'], profileFavoritesNormalize($a['title'])]
            <=> [$b['score'], profileFavoritesNormalize($b['title'])];
    });

    return array_map(
        static fn (array $row): array => [
            'id' => $row['id'],
            'title' => $row['title'],
            'author' => $row['author'],
            'cover' => $row['cover'],
        ],
        array_slice($matches, 0, 12)
    );
}

/** @return array<string,array{author_name:string,book_count:int}> */
function profileFavoritesAuthorCatalog(PDO $db): array
{
    $rows = $db->query('SELECT author FROM books WHERE TRIM(COALESCE(author, "")) <> ""')
        ->fetchAll(PDO::FETCH_COLUMN);
    $catalog = [];

    foreach ($rows as $rawAuthor) {
        foreach (profileFavoritesSplitAuthors((string) $rawAuthor) as $author) {
            $key = profileFavoritesNormalize($author);
            if ($key === '') {
                continue;
            }

            if (!isset($catalog[$key])) {
                $catalog[$key] = [
                    'author_name' => $author,
                    'book_count' => 0,
                ];
            }

            $catalog[$key]['book_count']++;
        }
    }

    return $catalog;
}

/** @return list<array{author_name:string,book_count:int}> */
function profileFavoritesSearchAuthors(PDO $db, string $query): array
{
    $needle = profileFavoritesNormalize($query);
    $matches = [];

    foreach (profileFavoritesAuthorCatalog($db) as $key => $item) {
        $position = strpos($key, $needle);
        if ($position === false) {
            continue;
        }

        $matches[] = [
            'score' => $key === $needle ? 0 : ($position === 0 ? 10 : 20),
            'author_name' => $item['author_name'],
            'book_count' => $item['book_count'],
        ];
    }

    usort($matches, static function (array $a, array $b): int {
        return [$a['score'], -$a['book_count'], profileFavoritesNormalize($a['author_name'])]
            <=> [$b['score'], -$b['book_count'], profileFavoritesNormalize($b['author_name'])];
    });

    return array_map(
        static fn (array $item): array => [
            'author_name' => $item['author_name'],
            'book_count' => $item['book_count'],
        ],
        array_slice($matches, 0, 12)
    );
}

$userId = librelulaRequireLogin($db);

try {
    librelulaInitializeProfileFavorites($db, $userId);
} catch (PDOException $error) {
    profileFavoritesJson(['error' => 'No se pudo preparar la sección de favoritos.'], 500);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $type = trim((string) ($_GET['type'] ?? ''));
    $query = trim((string) ($_GET['q'] ?? ''));

    if (!in_array($type, ['books', 'authors'], true)) {
        profileFavoritesJson(['error' => 'Tipo de búsqueda no válido.'], 400);
    }

    if (profileFavoritesTextLength($query) < 2) {
        profileFavoritesJson(['error' => 'Escribe al menos 2 letras.'], 422);
    }

    try {
        if ($type === 'books') {
            profileFavoritesJson(['books' => profileFavoritesSearchBooks($db, $query)]);
        }

        profileFavoritesJson(['authors' => profileFavoritesSearchAuthors($db, $query)]);
    } catch (PDOException $error) {
        profileFavoritesJson(['error' => 'No se pudo buscar en tu catálogo.'], 500);
    }
}

if ($method === 'POST') {
    librelulaVerifyCsrf();

    $data = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($data)) {
        profileFavoritesJson(['error' => 'La petición no contiene JSON válido.'], 400);
    }

    $bookIdsRaw = is_array($data['book_ids'] ?? null) ? $data['book_ids'] : [];
    $authorsRaw = is_array($data['authors'] ?? null) ? $data['authors'] : [];

    $bookIds = [];
    foreach ($bookIdsRaw as $value) {
        $bookId = trim((string) $value);
        if ($bookId !== '' && !in_array($bookId, $bookIds, true)) {
            $bookIds[] = $bookId;
        }
    }

    $authors = [];
    foreach ($authorsRaw as $value) {
        $author = trim((string) $value);
        $key = profileFavoritesNormalize($author);
        if ($key !== '' && !isset($authors[$key])) {
            $authors[$key] = $author;
        }
    }

    if (count($bookIds) > 6 || count($authors) > 6) {
        profileFavoritesJson(['error' => 'Puedes elegir como máximo 6 libros y 6 autores.'], 422);
    }

    try {
        $validBookIds = [];
        if ($bookIds !== []) {
            $placeholders = implode(',', array_fill(0, count($bookIds), '?'));
            $stmt = $db->prepare("SELECT id FROM books WHERE id IN ($placeholders)");
            $stmt->execute($bookIds);
            $validBookIds = array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        if (count($validBookIds) !== count($bookIds)) {
            profileFavoritesJson(['error' => 'Uno de los libros seleccionados ya no existe en el catálogo.'], 422);
        }

        $authorCatalog = profileFavoritesAuthorCatalog($db);
        $canonicalAuthors = [];
        foreach ($authors as $key => $author) {
            if (!isset($authorCatalog[$key])) {
                profileFavoritesJson(['error' => sprintf('El autor "%s" ya no está disponible en el catálogo.', $author)], 422);
            }
            $canonicalAuthors[] = $authorCatalog[$key]['author_name'];
        }

        $db->beginTransaction();

        $deleteBooks = $db->prepare('DELETE FROM profile_favorite_books WHERE user_id = :user_id');
        $deleteBooks->execute([':user_id' => $userId]);

        $insertBook = $db->prepare(<<<'SQL'
            INSERT INTO profile_favorite_books (user_id, book_id, sort_order)
            VALUES (:user_id, :book_id, :sort_order)
        SQL);

        foreach ($bookIds as $index => $bookId) {
            $insertBook->execute([
                ':user_id' => $userId,
                ':book_id' => $bookId,
                ':sort_order' => $index,
            ]);
        }

        $deleteAuthors = $db->prepare('DELETE FROM profile_favorite_authors WHERE user_id = :user_id');
        $deleteAuthors->execute([':user_id' => $userId]);

        $insertAuthor = $db->prepare(<<<'SQL'
            INSERT INTO profile_favorite_authors (user_id, author_name, sort_order)
            VALUES (:user_id, :author_name, :sort_order)
        SQL);

        foreach ($canonicalAuthors as $index => $author) {
            $insertAuthor->execute([
                ':user_id' => $userId,
                ':author_name' => $author,
                ':sort_order' => $index,
            ]);
        }

        $db->commit();

        profileFavoritesJson([
            'ok' => true,
            'book_ids' => $bookIds,
            'authors' => $canonicalAuthors,
        ]);
    } catch (PDOException $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        profileFavoritesJson(['error' => 'No se pudieron guardar tus favoritos.'], 500);
    }
}

profileFavoritesJson(['error' => 'Método no permitido.'], 405);
