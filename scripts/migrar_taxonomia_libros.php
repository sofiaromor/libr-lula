<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/book_taxonomy.php';

function migrationNormalize(string $value): string
{
    $value = function_exists('mb_strtolower')
        ? mb_strtolower($value, 'UTF-8')
        : strtolower($value);
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if (is_string($ascii) && $ascii !== '') {
        $value = $ascii;
    }
    $value = preg_replace('/[^a-z0-9]+/i', ' ', $value) ?? $value;
    return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
}

function migrationGenreItems(mixed $value): array
{
    if (is_array($value)) {
        return array_values(array_filter(array_map('strval', $value)));
    }

    $text = trim((string) $value);
    if ($text === '' || $text === '[]') {
        return [];
    }

    $decoded = json_decode($text, true);
    if (is_array($decoded)) {
        return array_values(array_filter(array_map('strval', $decoded)));
    }

    return array_values(array_filter(array_map(
        static fn(string $item): string => trim($item),
        preg_split('/[,;|]+/u', $text) ?: []
    )));
}

function migrationAppend(array &$items, string $value): void
{
    $key = migrationNormalize($value);
    if ($key === '') {
        return;
    }

    foreach ($items as $existing) {
        if (migrationNormalize((string) $existing) === $key) {
            return;
        }
    }

    $items[] = $value;
}

function migrationClassify(string $item, string $context): array
{
    $normalized = migrationNormalize($item);
    $genres = [];
    $themes = [];
    $audiences = [];
    $aesthetics = [];

    if (preg_match('/\b(romantasy|fantasy romance|romantic fantasy)\b/', $normalized)) {
        $genres = ['Fantasía', 'Romance'];
    } elseif (preg_match('/\b(erotic|erotica|erotico|novela erotica|spicy romance|dark romance)\b/', $normalized)) {
        $genres = ['Novela erótica', 'Romance'];
    } elseif (preg_match('/\b(novela romantica|romance|romantic|romantica|romantico|love story)\b/', $normalized)) {
        $genres = ['Romance'];
    } elseif (preg_match('/\b(science fiction|sci fi|scifi|ciencia ficcion|space opera|cyberpunk)\b/', $normalized)) {
        $genres = ['Ciencia ficción'];
    } elseif (preg_match('/\b(dystopia|dystopian|distopia|distopica|distopico)\b/', $normalized)) {
        $genres = ['Distopía'];
    } elseif (preg_match('/\b(magical realism|realismo magico)\b/', $normalized)) {
        $genres = ['Realismo mágico'];
    } elseif (preg_match('/\b(fantasy|fantasia|high fantasy|urban fantasy|epic fantasy)\b/', $normalized)) {
        $genres = ['Fantasía'];
    } elseif (preg_match('/\b(historical fiction|novela historica|narrativa historica)\b/', $normalized)) {
        $genres = ['Novela histórica'];
    } elseif (preg_match('/\b(police procedural|novela policial|policial|detective fiction)\b/', $normalized)) {
        $genres = ['Novela policíaca'];
    } elseif (preg_match('/\b(novela negra|crime fiction|hardboiled|noir)\b/', $normalized)) {
        $genres = ['Novela negra'];
        if ($normalized === 'noir') {
            $aesthetics[] = 'Noir';
        }
    } elseif (preg_match('/\b(mystery|misterio|murder mystery|whodunit)\b/', $normalized)) {
        $genres = ['Misterio'];
    } elseif (preg_match('/\b(suspense|suspenso)\b/', $normalized)) {
        $genres = ['Suspense'];
    } elseif (preg_match('/\b(thriller|psychological thriller)\b/', $normalized)) {
        $genres = ['Thriller'];
    } elseif (preg_match('/\b(horror|terror)\b/', $normalized)) {
        $genres = ['Terror'];
    } elseif ($normalized === 'terror o thriller') {
        $genres = ['Terror', 'Thriller'];
    } elseif (preg_match('/\b(adventure|aventura|aventuras)\b/', $normalized)) {
        $genres = ['Aventuras'];
    } elseif (preg_match('/\b(humor|humour|comedy|comedia|satire|satira)\b/', $normalized)) {
        $genres = ['Humor'];
    } elseif (preg_match('/\b(biography|biografia|autobiography|autobiografia|memoir|memorias)\b/', $normalized)) {
        $genres = ['Biografía y memorias'];
    } elseif (preg_match('/\b(essay|essays|ensayo|ensayos)\b/', $normalized)) {
        $genres = ['Ensayo'];
    } elseif (preg_match('/\b(poetry|poesia|poems|poemas)\b/', $normalized)) {
        $genres = ['Poesía'];
    } elseif (preg_match('/\b(comic|comics|graphic novel|novela grafica|manga)\b/', $normalized)) {
        $genres = ['Cómic y novela gráfica'];
    } elseif (preg_match('/\b(nonfiction|non fiction|no ficcion|divulgacion)\b/', $normalized)) {
        $genres = ['No ficción'];
    } elseif (preg_match('/\b(drama)\b/', $normalized)) {
        $genres = ['Drama'];
    } elseif (preg_match('/\b(contemporary fiction|narrativa contemporanea|ficcion literaria)\b/', $normalized)) {
        $genres = ['Narrativa contemporánea'];
    } elseif (preg_match('/\b(new adult)\b/', $normalized)) {
        $audiences = ['New Adult'];
    } elseif (preg_match('/\b(young adult|novela juvenil)\b/', $normalized)) {
        $audiences = ['Young Adult'];
    } elseif (preg_match('/\b(infantil|children|childrens|middle grade)\b/', $normalized)) {
        $audiences = ['Infantil'];
    } elseif (preg_match('/\b(lgbt|lgbtq|queer|gay|lesbian|bisexual|transgender)\b/', $normalized)) {
        $themes = ['LGBTQ+'];
    } elseif (preg_match('/\b(dark academia)\b/', $normalized)) {
        $aesthetics = ['Dark academia'];
    } elseif (preg_match('/\b(cottagecore)\b/', $normalized)) {
        $aesthetics = ['Cottagecore'];
    } elseif (preg_match('/\b(cozy|cosy)\b/', $normalized)) {
        $aesthetics = ['Cozy'];
    } elseif (preg_match('/\b(gothic|gotico|gotica)\b/', $normalized)) {
        $aesthetics = ['Gótico'];
        if (preg_match('/\b(terror|horror|fantasma|maldicion)\b/', $context)) {
            $genres = ['Terror'];
        }
    } else {
        // No eliminamos subgéneros personalizados que puedan ser válidos.
        $genres = [trim($item)];
    }

    return compact('genres', 'themes', 'audiences', 'aesthetics');
}

librelulaBookTaxonomyEnsureSchema($db);

$stmt = $db->query('SELECT id, genre, synopsis, title FROM books ORDER BY id');
$books = $stmt->fetchAll(PDO::FETCH_ASSOC);
$stmt->closeCursor();

$updated = 0;
$moved = 0;

$db->beginTransaction();

try {
    $updateGenre = $db->prepare('UPDATE books SET genre = :genre WHERE id = :id');

    foreach ($books as $book) {
        $bookId = trim((string) ($book['id'] ?? ''));
        if ($bookId === '') {
            continue;
        }

        $context = migrationNormalize(implode(' ', [
            (string) ($book['title'] ?? ''),
            (string) ($book['synopsis'] ?? ''),
        ]));
        $genres = [];
        $themes = [];
        $audiences = [];
        $aesthetics = [];

        foreach (migrationGenreItems($book['genre'] ?? null) as $item) {
            $classified = migrationClassify((string) $item, $context);
            foreach ($classified['genres'] as $value) migrationAppend($genres, $value);
            foreach ($classified['themes'] as $value) migrationAppend($themes, $value);
            foreach ($classified['audiences'] as $value) migrationAppend($audiences, $value);
            foreach ($classified['aesthetics'] as $value) migrationAppend($aesthetics, $value);
        }

        $existing = librelulaBookTaxonomyForBook($db, $bookId);
        foreach ($existing['themes'] as $value) migrationAppend($themes, $value);
        foreach ($existing['audiences'] as $value) migrationAppend($audiences, $value);
        foreach ($existing['aesthetics'] as $value) migrationAppend($aesthetics, $value);

        $serializedGenres = $genres !== []
            ? json_encode(array_slice($genres, 0, 8), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : null;

        $updateGenre->execute([
            ':id' => $bookId,
            ':genre' => $serializedGenres,
        ]);

        librelulaBookTaxonomyReplace($db, $bookId, 'theme', $themes, 12);
        librelulaBookTaxonomyReplace($db, $bookId, 'audience', $audiences, 4);
        librelulaBookTaxonomyReplace($db, $bookId, 'aesthetic', $aesthetics, 8);

        $updated++;
        if ($themes !== [] || $audiences !== [] || $aesthetics !== []) {
            $moved++;
        }
    }

    $updateGenre->closeCursor();
    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    fwrite(STDERR, 'ERROR REAL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}

echo "Taxonomía preparada correctamente.\n";
echo "Libros revisados: {$updated}.\n";
echo "Libros con etiquetas separadas: {$moved}.\n";
