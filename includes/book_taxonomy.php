<?php

declare(strict_types=1);

const LIBRELULA_TAXONOMY_KINDS = ['theme', 'aesthetic', 'audience'];

function librelulaBookTaxonomyEnsureSchema(PDO $db): void
{
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS book_taxonomy (
            book_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('theme', 'aesthetic', 'audience')),
            value TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (book_id, kind, value),
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )
    SQL);

    $db->exec(<<<'SQL'
        CREATE INDEX IF NOT EXISTS idx_book_taxonomy_book_kind
        ON book_taxonomy (book_id, kind, position)
    SQL);

    $db->exec(<<<'SQL'
        CREATE INDEX IF NOT EXISTS idx_book_taxonomy_kind_value
        ON book_taxonomy (kind, value)
    SQL);
}

function librelulaBookTaxonomyDecode(mixed $value, int $maximum = 12): array
{
    if (is_array($value)) {
        $items = $value;
    } else {
        $text = trim((string) $value);

        if ($text === '' || $text === '[]') {
            return [];
        }

        $decoded = json_decode($text, true);
        $items = is_array($decoded)
            ? $decoded
            : (preg_split('/[,;|]+/u', $text) ?: []);
    }

    $result = [];
    $seen = [];

    foreach ($items as $item) {
        $clean = trim((string) $item);
        if ($clean === '') {
            continue;
        }

        if (function_exists('mb_substr')) {
            $clean = mb_substr($clean, 0, 80, 'UTF-8');
        } else {
            $clean = substr($clean, 0, 80);
        }

        $key = function_exists('mb_strtolower')
            ? mb_strtolower($clean, 'UTF-8')
            : strtolower($clean);

        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $result[] = $clean;

        if (count($result) >= $maximum) {
            break;
        }
    }

    return $result;
}

function librelulaBookTaxonomyReplace(
    PDO $db,
    string $bookId,
    string $kind,
    mixed $values,
    int $maximum = 12
): void {
    if (!in_array($kind, LIBRELULA_TAXONOMY_KINDS, true)) {
        throw new InvalidArgumentException('Tipo de taxonomía no válido.');
    }

    librelulaBookTaxonomyEnsureSchema($db);
    $items = librelulaBookTaxonomyDecode($values, $maximum);

    $delete = $db->prepare('DELETE FROM book_taxonomy WHERE book_id = :book_id AND kind = :kind');
    $delete->execute([
        ':book_id' => $bookId,
        ':kind' => $kind,
    ]);
    $delete->closeCursor();

    if ($items === []) {
        return;
    }

    $insert = $db->prepare(<<<'SQL'
        INSERT INTO book_taxonomy (book_id, kind, value, position)
        VALUES (:book_id, :kind, :value, :position)
    SQL);

    foreach ($items as $position => $item) {
        $insert->execute([
            ':book_id' => $bookId,
            ':kind' => $kind,
            ':value' => $item,
            ':position' => $position,
        ]);
    }

    $insert->closeCursor();
}

function librelulaBookTaxonomyForBook(PDO $db, string $bookId): array
{
    librelulaBookTaxonomyEnsureSchema($db);

    $stmt = $db->prepare(<<<'SQL'
        SELECT kind, value
        FROM book_taxonomy
        WHERE book_id = :book_id
        ORDER BY kind, position, value COLLATE NOCASE
    SQL);
    $stmt->execute([':book_id' => $bookId]);

    $taxonomy = [
        'themes' => [],
        'aesthetics' => [],
        'audiences' => [],
    ];

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $kind = (string) ($row['kind'] ?? '');
        $value = trim((string) ($row['value'] ?? ''));
        if ($value === '') {
            continue;
        }

        if ($kind === 'theme') {
            $taxonomy['themes'][] = $value;
        } elseif ($kind === 'aesthetic') {
            $taxonomy['aesthetics'][] = $value;
        } elseif ($kind === 'audience') {
            $taxonomy['audiences'][] = $value;
        }
    }

    $stmt->closeCursor();
    return $taxonomy;
}

function librelulaBookTaxonomyAttach(PDO $db, array &$books): void
{
    librelulaBookTaxonomyEnsureSchema($db);

    if ($books === []) {
        return;
    }

    $bookIndexes = [];
    foreach ($books as $index => $book) {
        $bookId = trim((string) ($book['id'] ?? ''));
        if ($bookId === '') {
            continue;
        }
        $bookIndexes[$bookId][] = $index;
        $books[$index]['themes'] = [];
        $books[$index]['aesthetics'] = [];
        $books[$index]['audiences'] = [];
    }

    if ($bookIndexes === []) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($bookIndexes), '?'));
    $stmt = $db->prepare(<<<SQL
        SELECT book_id, kind, value
        FROM book_taxonomy
        WHERE book_id IN ({$placeholders})
        ORDER BY book_id, kind, position, value COLLATE NOCASE
    SQL);
    $stmt->execute(array_keys($bookIndexes));

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $bookId = (string) ($row['book_id'] ?? '');
        $kind = (string) ($row['kind'] ?? '');
        $value = trim((string) ($row['value'] ?? ''));
        if ($value === '' || !isset($bookIndexes[$bookId])) {
            continue;
        }

        $field = match ($kind) {
            'theme' => 'themes',
            'aesthetic' => 'aesthetics',
            'audience' => 'audiences',
            default => null,
        };

        if ($field === null) {
            continue;
        }

        foreach ($bookIndexes[$bookId] as $index) {
            $books[$index][$field][] = $value;
        }
    }

    $stmt->closeCursor();
}

function librelulaBookTaxonomyAttachOne(PDO $db, ?array $book): ?array
{
    if ($book === null) {
        return null;
    }

    $books = [$book];
    librelulaBookTaxonomyAttach($db, $books);
    return $books[0];
}
