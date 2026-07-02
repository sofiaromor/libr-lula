<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/includes/book_taxonomy.php';
require_once dirname(__DIR__) . '/includes/genre_normalization.php';

$db->exec('PRAGMA busy_timeout = 10000');
librelulaBookTaxonomyEnsureSchema($db);

$stmt = $db->query('SELECT id, genre FROM books ORDER BY id');
$books = $stmt->fetchAll(PDO::FETCH_ASSOC);
$stmt->closeCursor();

$updated = 0;
$withGenres = 0;
$movedTags = 0;

$db->beginTransaction();

try {
    $update = $db->prepare('UPDATE books SET genre = :genre WHERE id = :id');

    foreach ($books as $book) {
        $bookId = trim((string) ($book['id'] ?? ''));
        if ($bookId === '') {
            continue;
        }

        $classification = librelulaClassifyBookTags($book['genre'] ?? null);
        $existing = librelulaBookTaxonomyForBook($db, $bookId);

        $themes = librelulaMergeTagLists($existing['themes'], $classification['themes']);
        $audiences = [];
        foreach (librelulaMergeTagLists($existing['audiences'], $classification['audiences']) as $audience) {
            $canonical = librelulaCanonicalAudience((string) $audience) ?? trim((string) $audience);
            if ($canonical !== '') {
                librelulaGenreAppend($audiences, $canonical, 4);
            }
        }
        $aesthetics = librelulaMergeTagLists($existing['aesthetics'], $classification['aesthetics']);

        $serialized = $classification['genres'] !== []
            ? json_encode(
                $classification['genres'],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            )
            : null;

        $update->execute([
            ':id' => $bookId,
            ':genre' => $serialized,
        ]);

        librelulaBookTaxonomyReplace($db, $bookId, 'theme', $themes, 12);
        librelulaBookTaxonomyReplace($db, $bookId, 'audience', $audiences, 4);
        librelulaBookTaxonomyReplace($db, $bookId, 'aesthetic', $aesthetics, 8);

        $updated++;
        if ($classification['genres'] !== []) {
            $withGenres++;
        }
        if ($classification['themes'] !== [] || $classification['audiences'] !== [] || $classification['aesthetics'] !== []) {
            $movedTags++;
        }
    }

    $update->closeCursor();
    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    fwrite(STDERR, 'ERROR REAL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}

echo "Géneros normalizados correctamente.\n";
echo "Libros revisados: {$updated}.\n";
echo "Libros con géneros canónicos: {$withGenres}.\n";
echo "Libros con etiquetas movidas a temas, público o estética: {$movedTags}.\n";
