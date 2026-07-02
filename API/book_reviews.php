<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/book_taxonomy.php';

const LIBRELULA_VIBES = [
    // Ritmo y enganche
    'addictive' => ['label' => 'Adictivo', 'description' => 'No puedes dejarlo', 'category' => 'rhythm'],
    'agile' => ['label' => 'Ágil', 'description' => 'Se lee con facilidad', 'category' => 'rhythm'],
    'slow_burn' => ['label' => 'Pausado', 'description' => 'Se disfruta sin prisas', 'category' => 'rhythm'],
    'unpredictable' => ['label' => 'Impredecible', 'description' => 'Sorprende continuamente', 'category' => 'rhythm'],
    'dense' => ['label' => 'Denso', 'description' => 'Pide atención y tiempo', 'category' => 'rhythm'],

    // Emoción
    'cozy' => ['label' => 'Acogedor', 'description' => 'Como una manta cálida', 'category' => 'emotion'],
    'emotional' => ['label' => 'Emotivo', 'description' => 'Deja huella', 'category' => 'emotion'],
    'devastating' => ['label' => 'Devastador', 'description' => 'Rompe por dentro', 'category' => 'emotion'],
    'funny' => ['label' => 'Divertido', 'description' => 'Te hace sonreír', 'category' => 'emotion'],
    'nostalgic' => ['label' => 'Nostálgico', 'description' => 'Deja una dulce melancolía', 'category' => 'emotion'],
    'hopeful' => ['label' => 'Esperanzador', 'description' => 'Terminas con luz', 'category' => 'emotion'],

    // Ambiente
    'immersive' => ['label' => 'Inmersivo', 'description' => 'Te lleva a otro mundo', 'category' => 'setting'],
    'dark' => ['label' => 'Oscuro', 'description' => 'Tiene un tono sombrío', 'category' => 'setting'],
    'unsettling' => ['label' => 'Inquietante', 'description' => 'Produce desasosiego', 'category' => 'setting'],
    'dreamlike' => ['label' => 'Onírico', 'description' => 'Parece un sueño', 'category' => 'setting'],
    'nocturnal' => ['label' => 'Nocturno', 'description' => 'Ideal para leer de noche', 'category' => 'setting'],
    'luminous' => ['label' => 'Luminoso', 'description' => 'Transmite ligereza', 'category' => 'setting'],

    // Relaciones y química
    'romantic' => ['label' => 'Romántico', 'description' => 'El amor es importante', 'category' => 'relationships'],
    'tender' => ['label' => 'Tierno', 'description' => 'Vínculos dulces y cuidados', 'category' => 'relationships'],
    'romantic_tension' => ['label' => 'Tensión romántica', 'description' => 'Miradas, espera y deseo', 'category' => 'relationships'],
    'spicy' => ['label' => 'Picante', 'description' => 'Química intensa o explícita', 'category' => 'relationships'],
    'heartbreaking' => ['label' => 'Desgarrador', 'description' => 'Relaciones que duelen', 'category' => 'relationships'],

    // Ideas y huella
    'reflective' => ['label' => 'Reflexivo', 'description' => 'Invita a pensar', 'category' => 'impact'],
    'inspiring' => ['label' => 'Inspirador', 'description' => 'Despierta ganas de actuar', 'category' => 'impact'],
    'philosophical' => ['label' => 'Filosófico', 'description' => 'Plantea grandes preguntas', 'category' => 'impact'],
    'disturbing' => ['label' => 'Perturbador', 'description' => 'Sigue rondando la cabeza', 'category' => 'impact'],
    'revealing' => ['label' => 'Revelador', 'description' => 'Cambia alguna perspectiva', 'category' => 'impact'],
];

const LIBRELULA_ATMOSPHERE = [
    'pace' => ['label' => 'Ritmo', 'left' => 'Contemplativo', 'right' => 'Vertiginoso'],
    'tension' => ['label' => 'Tensión', 'left' => 'Sereno', 'right' => 'Intenso'],
    'darkness' => ['label' => 'Oscuridad', 'left' => 'Luminoso', 'right' => 'Sombrío'],
    'warmth' => ['label' => 'Calidez', 'left' => 'Frío', 'right' => 'Acogedor'],
    'emotion' => ['label' => 'Emoción', 'left' => 'Contenido', 'right' => 'Desbordante'],
    'immersion' => ['label' => 'Inmersión', 'left' => 'Distante', 'right' => 'Envolvente'],
];

function bookReviewsJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bookReviewsTextLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function bookReviewsAsset(?string $path): string
{
    $path = trim((string) $path);

    if ($path === '' || $path === 'default.jpg') {
        return 'images/avatar/avatar1.png';
    }

    if (preg_match('~^(?:https?:)?//|^data:~i', $path)) {
        return $path;
    }

    $normalized = ltrim(str_replace('\\', '/', $path), '/');
    $normalized = preg_replace('~^(?:\./|\.\./)*(?:librelula/)+~i', '', $normalized) ?? $normalized;

    return $normalized !== '' ? $normalized : 'images/avatar/avatar1.png';
}

function bookReviewsTableColumns(PDO $db, string $table): array
{
    $columns = [];
    $rows = $db->query('PRAGMA table_info(' . $table . ')')->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $name = trim((string) ($row['name'] ?? ''));
        if ($name !== '') {
            $columns[$name] = true;
        }
    }

    return $columns;
}

function bookReviewsEnsureInsightSchema(PDO $db): void
{
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS review_vibes (
            user_id INTEGER NOT NULL,
            book_id TEXT NOT NULL,
            vibe TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, book_id, vibe)
        )
    SQL);

    $db->exec(<<<'SQL'
        CREATE INDEX IF NOT EXISTS idx_review_vibes_book
        ON review_vibes (book_id, vibe)
    SQL);

    // Se conservan las columnas antiguas para que el cambio sea compatible
    // con instalaciones que ya usaban la primera versión de atmósfera.
    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS review_atmosphere (
            user_id INTEGER NOT NULL,
            book_id TEXT NOT NULL,
            mystery INTEGER NOT NULL DEFAULT 0,
            magic INTEGER NOT NULL DEFAULT 0,
            romance INTEGER NOT NULL DEFAULT 0,
            adventure INTEGER NOT NULL DEFAULT 0,
            pace INTEGER NOT NULL DEFAULT 50,
            tension INTEGER NOT NULL DEFAULT 50,
            darkness INTEGER NOT NULL DEFAULT 50,
            warmth INTEGER NOT NULL DEFAULT 50,
            emotion INTEGER NOT NULL DEFAULT 50,
            immersion INTEGER NOT NULL DEFAULT 50,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, book_id)
        )
    SQL);

    $columns = bookReviewsTableColumns($db, 'review_atmosphere');
    $requiredColumns = [
        'pace' => 'INTEGER NOT NULL DEFAULT 50',
        'tension' => 'INTEGER NOT NULL DEFAULT 50',
        'darkness' => 'INTEGER NOT NULL DEFAULT 50',
        'warmth' => 'INTEGER NOT NULL DEFAULT 50',
        'emotion' => 'INTEGER NOT NULL DEFAULT 50',
        'immersion' => 'INTEGER NOT NULL DEFAULT 50',
    ];

    foreach ($requiredColumns as $name => $definition) {
        if (!isset($columns[$name])) {
            $db->exec("ALTER TABLE review_atmosphere ADD COLUMN {$name} {$definition}");
        }
    }

    $db->exec(<<<'SQL'
        CREATE INDEX IF NOT EXISTS idx_review_atmosphere_book
        ON review_atmosphere (book_id)
    SQL);
}

function bookReviewsNormalizeText(string $value): string
{
    $value = function_exists('mb_strtolower')
        ? mb_strtolower($value, 'UTF-8')
        : strtolower($value);
    $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);

    if (is_string($converted) && $converted !== '') {
        $value = $converted;
    }

    $value = preg_replace('/[^a-z0-9\s]+/i', ' ', $value) ?? $value;
    return preg_replace('/\s+/', ' ', trim($value)) ?? trim($value);
}

function bookReviewsDimensionScore(
    string $text,
    array $positive,
    array $negative = [],
    int $base = 50
): int {
    $score = $base;

    foreach ($positive as $keyword => $weight) {
        $needle = bookReviewsNormalizeText((string) $keyword);
        if ($needle !== '' && str_contains($text, $needle)) {
            $score += (int) $weight;
        }
    }

    foreach ($negative as $keyword => $weight) {
        $needle = bookReviewsNormalizeText((string) $keyword);
        if ($needle !== '' && str_contains($text, $needle)) {
            $score -= (int) $weight;
        }
    }

    // La sinopsis solo permite una estimación prudente: evitamos extremos.
    return max(15, min(85, $score));
}

function bookReviewsHasAny(string $text, array $needles): bool
{
    foreach ($needles as $needle) {
        $normalized = bookReviewsNormalizeText((string) $needle);
        if ($normalized !== '' && str_contains($text, $normalized)) {
            return true;
        }
    }

    return false;
}

function bookReviewsSynopsisSuggestion(array $book): array
{
    $text = bookReviewsNormalizeText(implode(' ', [
        (string) ($book['title'] ?? ''),
        (string) ($book['genre'] ?? ''),
        implode(' ', is_array($book['themes'] ?? null) ? $book['themes'] : []),
        implode(' ', is_array($book['aesthetics'] ?? null) ? $book['aesthetics'] : []),
        (string) ($book['synopsis'] ?? ''),
    ]));

    $atmosphere = [
        'pace' => bookReviewsDimensionScore($text, [
            'accion' => 16, 'aventura' => 12, 'persecucion' => 18, 'huida' => 14,
            'mision' => 12, 'batalla' => 14, 'thriller' => 16, 'suspense' => 12,
            'contrarreloj' => 18, 'vertiginoso' => 20, 'viaje' => 8,
        ], [
            'contemplativo' => 20, 'pausado' => 18, 'cotidiano' => 10,
            'introspectivo' => 14, 'meditacion' => 14, 'ensayo' => 8,
        ]),
        'tension' => bookReviewsDimensionScore($text, [
            'misterio' => 14, 'secreto' => 12, 'asesinato' => 20, 'crimen' => 18,
            'amenaza' => 18, 'peligro' => 16, 'terror' => 20, 'horror' => 20,
            'guerra' => 16, 'conflicto' => 12, 'suspense' => 18, 'desaparicion' => 16,
        ], [
            'tranquilo' => 18, 'sereno' => 18, 'amable' => 10,
            'bienestar' => 12, 'relajante' => 18,
        ]),
        'darkness' => bookReviewsDimensionScore($text, [
            'muerte' => 14, 'guerra' => 16, 'violencia' => 16, 'terror' => 20,
            'horror' => 20, 'sangre' => 14, 'trauma' => 16, 'cruel' => 14,
            'distopia' => 18, 'pesadilla' => 16, 'duelo' => 10, 'venganza' => 12,
        ], [
            'comedia' => 18, 'humor' => 14, 'esperanza' => 12, 'luminoso' => 18,
            'tierno' => 12, 'acogedor' => 14, 'feel good' => 18,
        ]),
        'warmth' => bookReviewsDimensionScore($text, [
            'familia' => 12, 'amistad' => 14, 'hogar' => 16, 'comunidad' => 14,
            'amor' => 10, 'ternura' => 16, 'acogedor' => 20, 'esperanza' => 12,
            'pueblo' => 10, 'cuidado' => 12,
        ], [
            'aislamiento' => 16, 'traicion' => 14, 'cruel' => 14, 'violencia' => 12,
            'guerra' => 12, 'horror' => 16, 'frio' => 14,
        ]),
        'emotion' => bookReviewsDimensionScore($text, [
            'duelo' => 18, 'perdida' => 16, 'amor' => 12, 'familia' => 10,
            'trauma' => 16, 'identidad' => 12, 'superacion' => 14, 'corazon' => 12,
            'lagrimas' => 18, 'dolor' => 14, 'emocion' => 16,
        ], [
            'manual' => 16, 'guia practica' => 16, 'tecnico' => 12,
            'diccionario' => 20, 'referencia' => 12,
        ]),
        'immersion' => bookReviewsDimensionScore($text, [
            'mundo' => 12, 'reino' => 14, 'universo' => 16, 'ambientado' => 10,
            'fantasia' => 14, 'ciencia ficcion' => 14, 'historica' => 10,
            'viaje' => 8, 'epico' => 12, 'epica' => 12, 'mitologia' => 14,
        ], [
            'manual' => 14, 'resumen' => 10, 'introduccion' => 8,
            'consulta' => 10,
        ]),
    ];

    $vibes = [];

    if ($atmosphere['pace'] >= 65 || $atmosphere['tension'] >= 68) {
        $vibes[] = 'addictive';
    }
    if ($atmosphere['pace'] >= 64) {
        $vibes[] = 'agile';
    }
    if ($atmosphere['pace'] <= 38) {
        $vibes[] = 'slow_burn';
    }
    if ($atmosphere['immersion'] >= 62) {
        $vibes[] = 'immersive';
    }
    if ($atmosphere['darkness'] >= 64) {
        $vibes[] = 'dark';
    }
    if ($atmosphere['tension'] >= 66 && $atmosphere['darkness'] >= 55) {
        $vibes[] = 'unsettling';
    }
    if ($atmosphere['warmth'] >= 64) {
        $vibes[] = 'cozy';
    }
    if ($atmosphere['emotion'] >= 66) {
        $vibes[] = 'emotional';
    }
    if ($atmosphere['emotion'] >= 74 && $atmosphere['darkness'] >= 58) {
        $vibes[] = 'devastating';
    }
    if ($atmosphere['darkness'] <= 38) {
        $vibes[] = 'luminous';
    }

    if (bookReviewsHasAny($text, ['romance', 'romantica', 'romantico', 'amor', 'enamor'])) {
        $vibes[] = 'romantic';
    }
    if (bookReviewsHasAny($text, ['deseo', 'pasion', 'sensual', 'erotica', 'erotico', 'spicy', 'sexo'])) {
        $vibes[] = 'spicy';
    }
    if (bookReviewsHasAny($text, ['tension romantica', 'enemies to lovers', 'rivals to lovers', 'amor prohibido'])) {
        $vibes[] = 'romantic_tension';
    }
    if (bookReviewsHasAny($text, ['humor', 'comedia', 'divertido', 'hilarante'])) {
        $vibes[] = 'funny';
    }
    if (bookReviewsHasAny($text, ['nostalgia', 'recuerdo', 'memoria', 'pasado'])) {
        $vibes[] = 'nostalgic';
    }
    if (bookReviewsHasAny($text, ['esperanza', 'renacer', 'segunda oportunidad', 'superacion'])) {
        $vibes[] = 'hopeful';
    }
    if (bookReviewsHasAny($text, ['reflexion', 'sociedad', 'identidad', 'moral', 'etica'])) {
        $vibes[] = 'reflective';
    }
    if (bookReviewsHasAny($text, ['filosofia', 'existencia', 'sentido de la vida'])) {
        $vibes[] = 'philosophical';
    }
    if (bookReviewsHasAny($text, ['perturbador', 'obsesion', 'pesadilla', 'macabro'])) {
        $vibes[] = 'disturbing';
    }
    if (bookReviewsHasAny($text, ['secreto', 'giro', 'sorpresa', 'nada es lo que parece'])) {
        $vibes[] = 'unpredictable';
    }
    if (bookReviewsHasAny($text, ['sueño', 'onirico', 'surreal', 'realismo magico'])) {
        $vibes[] = 'dreamlike';
    }
    if (bookReviewsHasAny($text, ['noche', 'nocturno', 'luna', 'oscuridad'])) {
        $vibes[] = 'nocturnal';
    }

    $fallbacks = ['immersive', 'reflective', 'emotional', 'addictive'];
    foreach ($fallbacks as $fallback) {
        $vibes[] = $fallback;
    }

    $vibes = array_values(array_unique(array_filter(
        $vibes,
        fn ($key) => isset(LIBRELULA_VIBES[$key])
    )));

    return [
        'atmosphere' => $atmosphere,
        'vibes' => array_slice($vibes, 0, 4),
    ];
}

function bookReviewsVibeRows(array $counts, string $source): array
{
    $rows = [];

    foreach ($counts as $key => $count) {
        if (!isset(LIBRELULA_VIBES[$key])) {
            continue;
        }

        $rows[] = [
            'key' => $key,
            'label' => LIBRELULA_VIBES[$key]['label'],
            'description' => LIBRELULA_VIBES[$key]['description'],
            'category' => LIBRELULA_VIBES[$key]['category'],
            'count' => (int) $count,
            'source' => $source,
        ];
    }

    return $rows;
}

function bookReviewsAtmosphereValues(array $row): array
{
    $values = [];

    foreach (LIBRELULA_ATMOSPHERE as $key => $data) {
        $value = isset($row[$key]) ? (float) $row[$key] : 50;
        $values[$key] = (int) round(max(0, min(100, $value)));
    }

    return $values;
}

function bookReviewsPayload(PDO $db, string $bookId, ?int $currentUserId): array
{
    bookReviewsEnsureInsightSchema($db);

    $bookStmt = $db->prepare('SELECT id, title, genre, synopsis FROM books WHERE id = :book_id LIMIT 1');
    $bookStmt->execute([':book_id' => $bookId]);
    $book = $bookStmt->fetch(PDO::FETCH_ASSOC);
    $book = is_array($book) ? librelulaBookTaxonomyAttachOne($db, $book) : null;

    if (!$book) {
        throw new RuntimeException('BOOK_NOT_FOUND');
    }

    $suggestions = bookReviewsSynopsisSuggestion($book);

    $summaryStmt = $db->prepare(<<<'SQL'
        SELECT
            ROUND(AVG(CASE WHEN score BETWEEN 1 AND 5 THEN score END), 1) AS avg_rating,
            SUM(CASE WHEN score BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS total_ratings,
            SUM(CASE WHEN TRIM(COALESCE(notes, '')) <> '' THEN 1 ELSE 0 END) AS total_reviews,
            SUM(CASE WHEN score = 5 THEN 1 ELSE 0 END) AS five_stars,
            SUM(CASE WHEN score = 4 THEN 1 ELSE 0 END) AS four_stars,
            SUM(CASE WHEN score = 3 THEN 1 ELSE 0 END) AS three_stars,
            SUM(CASE WHEN score = 2 THEN 1 ELSE 0 END) AS two_stars,
            SUM(CASE WHEN score = 1 THEN 1 ELSE 0 END) AS one_star
        FROM user_books
        WHERE book_id = :book_id
    SQL);
    $summaryStmt->execute([':book_id' => $bookId]);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $reviewsStmt = $db->prepare(<<<'SQL'
        SELECT
            ub.user_id,
            u.username,
            u.avatar,
            ub.score,
            ub.notes,
            ub.started_at,
            ub.finished_at
        FROM user_books ub
        INNER JOIN users u ON u.id = ub.user_id
        WHERE ub.book_id = :book_id
          AND (
              ub.score BETWEEN 1 AND 5
              OR TRIM(COALESCE(ub.notes, '')) <> ''
          )
        ORDER BY
            CASE WHEN ub.user_id = :current_user_id THEN 0 ELSE 1 END,
            COALESCE(ub.finished_at, ub.started_at, '0000-00-00') DESC,
            ub.rowid DESC
        LIMIT 100
    SQL);
    $reviewsStmt->bindValue(':book_id', $bookId, PDO::PARAM_STR);
    $reviewsStmt->bindValue(':current_user_id', $currentUserId ?? 0, PDO::PARAM_INT);
    $reviewsStmt->execute();

    $reviews = [];

    foreach ($reviewsStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $reviews[] = [
            'user_id' => (int) $row['user_id'],
            'username' => (string) $row['username'],
            'avatar' => bookReviewsAsset($row['avatar'] ?? null),
            'score' => $row['score'] === null ? null : (int) $row['score'],
            'review' => trim((string) ($row['notes'] ?? '')),
            'started_at' => $row['started_at'] ?: null,
            'finished_at' => $row['finished_at'] ?: null,
            'is_mine' => $currentUserId !== null && (int) $row['user_id'] === $currentUserId,
        ];
    }

    $myReview = null;

    if ($currentUserId !== null) {
        $myStmt = $db->prepare(<<<'SQL'
            SELECT score, notes, started_at, finished_at
            FROM user_books
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        SQL);
        $myStmt->execute([':user_id' => $currentUserId, ':book_id' => $bookId]);
        $myRow = $myStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $myVibesStmt = $db->prepare(<<<'SQL'
            SELECT vibe
            FROM review_vibes
            WHERE user_id = :user_id AND book_id = :book_id
            ORDER BY created_at ASC, vibe ASC
        SQL);
        $myVibesStmt->execute([':user_id' => $currentUserId, ':book_id' => $bookId]);
        $myVibes = array_values(array_filter(
            $myVibesStmt->fetchAll(PDO::FETCH_COLUMN),
            fn ($key) => isset(LIBRELULA_VIBES[(string) $key])
        ));

        $myAtmosphereStmt = $db->prepare(<<<'SQL'
            SELECT pace, tension, darkness, warmth, emotion, immersion
            FROM review_atmosphere
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        SQL);
        $myAtmosphereStmt->execute([':user_id' => $currentUserId, ':book_id' => $bookId]);
        $myAtmosphereRow = $myAtmosphereStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $hasMyOpinion = (
            $myRow
            && (
                ($myRow['score'] !== null && (int) $myRow['score'] >= 1 && (int) $myRow['score'] <= 5)
                || trim((string) ($myRow['notes'] ?? '')) !== ''
            )
        ) || !empty($myVibes) || $myAtmosphereRow !== null;

        if ($hasMyOpinion) {
            $myReview = [
                'user_id' => $currentUserId,
                'score' => $myRow && $myRow['score'] !== null ? (int) $myRow['score'] : null,
                'review' => $myRow ? trim((string) ($myRow['notes'] ?? '')) : '',
                'started_at' => $myRow && $myRow['started_at'] ? $myRow['started_at'] : null,
                'finished_at' => $myRow && $myRow['finished_at'] ? $myRow['finished_at'] : null,
                'vibes' => $myVibes,
                'atmosphere' => $myAtmosphereRow ? bookReviewsAtmosphereValues($myAtmosphereRow) : null,
                'is_mine' => true,
            ];
        }
    }

    $vibeStmt = $db->prepare(<<<'SQL'
        SELECT vibe, COUNT(*) AS total
        FROM review_vibes
        WHERE book_id = :book_id
        GROUP BY vibe
        ORDER BY total DESC, vibe ASC
        LIMIT 4
    SQL);
    $vibeStmt->execute([':book_id' => $bookId]);
    $vibeCounts = [];

    foreach ($vibeStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $vibeCounts[(string) $row['vibe']] = (int) $row['total'];
    }

    $atmosphereStmt = $db->prepare(<<<'SQL'
        SELECT
            COUNT(*) AS participants,
            AVG(pace) AS pace,
            AVG(tension) AS tension,
            AVG(darkness) AS darkness,
            AVG(warmth) AS warmth,
            AVG(emotion) AS emotion,
            AVG(immersion) AS immersion
        FROM review_atmosphere
        WHERE book_id = :book_id
    SQL);
    $atmosphereStmt->execute([':book_id' => $bookId]);
    $atmosphereRow = $atmosphereStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $participants = (int) ($atmosphereRow['participants'] ?? 0);

    $insightSource = $participants > 0 ? 'community' : 'synopsis';
    $atmosphere = $participants > 0
        ? bookReviewsAtmosphereValues($atmosphereRow)
        : $suggestions['atmosphere'];

    $vibes = $vibeCounts
        ? bookReviewsVibeRows($vibeCounts, 'community')
        : bookReviewsVibeRows(array_fill_keys($suggestions['vibes'], 0), 'synopsis');

    return [
        'authenticated' => $currentUserId !== null,
        'summary' => [
            'avg_rating' => $summary['avg_rating'] === null ? null : (float) $summary['avg_rating'],
            'total_ratings' => (int) ($summary['total_ratings'] ?? 0),
            'total_reviews' => (int) ($summary['total_reviews'] ?? 0),
            'distribution' => [
                '5' => (int) ($summary['five_stars'] ?? 0),
                '4' => (int) ($summary['four_stars'] ?? 0),
                '3' => (int) ($summary['three_stars'] ?? 0),
                '2' => (int) ($summary['two_stars'] ?? 0),
                '1' => (int) ($summary['one_star'] ?? 0),
            ],
        ],
        'my_review' => $myReview,
        'reviews' => $reviews,
        'insights' => [
            'source' => $insightSource,
            'participant_count' => $participants,
            'vibes' => $vibes,
            'atmosphere' => $atmosphere,
        ],
        'suggestions' => [
            'source' => 'synopsis',
            'vibes' => $suggestions['vibes'],
            'atmosphere' => $suggestions['atmosphere'],
        ],
        'options' => [
            'vibes' => array_map(
                fn ($data, $key) => ['key' => $key] + $data,
                LIBRELULA_VIBES,
                array_keys(LIBRELULA_VIBES)
            ),
            'atmosphere' => array_map(
                fn ($data, $key) => ['key' => $key] + $data,
                LIBRELULA_ATMOSPHERE,
                array_keys(LIBRELULA_ATMOSPHERE)
            ),
        ],
    ];
}

function bookReviewsValidatedAtmosphere(mixed $raw): ?array
{
    if ($raw === null) {
        return null;
    }

    if (!is_array($raw)) {
        throw new InvalidArgumentException('La atmósfera debe ser un objeto válido');
    }

    $result = [];

    foreach (LIBRELULA_ATMOSPHERE as $key => $data) {
        $value = $raw[$key] ?? 50;
        $validated = filter_var($value, FILTER_VALIDATE_INT);

        if ($validated === false || $validated < 0 || $validated > 100) {
            throw new InvalidArgumentException("El valor de {$data['label']} debe estar entre 0 y 100");
        }

        $result[$key] = (int) $validated;
    }

    return $result;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $bookId = trim((string) ($_GET['book_id'] ?? ''));

    if ($bookId === '') {
        bookReviewsJson(['error' => 'book_id requerido'], 400);
    }

    try {
        bookReviewsJson(bookReviewsPayload($db, $bookId, librelulaCurrentUserId()));
    } catch (RuntimeException $error) {
        if ($error->getMessage() === 'BOOK_NOT_FOUND') {
            bookReviewsJson(['error' => 'El libro no existe'], 404);
        }
        bookReviewsJson(['error' => 'No se pudieron cargar las reseñas del libro'], 500);
    } catch (PDOException) {
        bookReviewsJson(['error' => 'No se pudieron cargar las reseñas del libro'], 500);
    }
}

if ($method === 'DELETE') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        bookReviewsJson(['error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    $bookId = trim((string) ($data['book_id'] ?? ''));
    $target = trim((string) ($data['target'] ?? ''));

    if ($bookId === '') {
        bookReviewsJson(['error' => 'book_id requerido'], 400);
    }

    if (!in_array($target, ['rating', 'review', 'all'], true)) {
        bookReviewsJson(['error' => 'Indica si quieres borrar rating, review o all'], 400);
    }

    try {
        bookReviewsEnsureInsightSchema($db);

        $bookStmt = $db->prepare('SELECT 1 FROM books WHERE id = :book_id LIMIT 1');
        $bookStmt->execute([':book_id' => $bookId]);

        if (!$bookStmt->fetchColumn()) {
            bookReviewsJson(['error' => 'El libro no existe'], 404);
        }

        $db->beginTransaction();

        $existingStmt = $db->prepare(<<<'SQL'
            SELECT id
            FROM user_books
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        SQL);
        $existingStmt->execute([':user_id' => $userId, ':book_id' => $bookId]);
        $existingId = $existingStmt->fetchColumn();

        if ($existingId !== false) {
            if ($target === 'rating') {
                $clearStmt = $db->prepare(
                    'UPDATE user_books SET score = NULL WHERE id = :id AND user_id = :user_id'
                );
            } elseif ($target === 'review') {
                $clearStmt = $db->prepare(
                    'UPDATE user_books SET notes = NULL WHERE id = :id AND user_id = :user_id'
                );
            } else {
                $clearStmt = $db->prepare(
                    'UPDATE user_books SET score = NULL, notes = NULL WHERE id = :id AND user_id = :user_id'
                );
            }

            $clearStmt->execute([
                ':id' => (int) $existingId,
                ':user_id' => $userId,
            ]);
        }

        if ($target === 'review' || $target === 'all') {
            $deleteVibesStmt = $db->prepare(
                'DELETE FROM review_vibes WHERE user_id = :user_id AND book_id = :book_id'
            );
            $deleteVibesStmt->execute([':user_id' => $userId, ':book_id' => $bookId]);

            $deleteAtmosphereStmt = $db->prepare(
                'DELETE FROM review_atmosphere WHERE user_id = :user_id AND book_id = :book_id'
            );
            $deleteAtmosphereStmt->execute([':user_id' => $userId, ':book_id' => $bookId]);
        }

        $db->commit();

        $payload = bookReviewsPayload($db, $bookId, $userId);
        $payload['ok'] = true;
        $payload['message'] = match ($target) {
            'rating' => 'Tu puntuación se ha borrado.',
            'review' => 'Tu reseña, sensaciones y atmósfera se han borrado.',
            default => 'Tu puntuación y tu reseña se han borrado.',
        };

        bookReviewsJson($payload);
    } catch (PDOException) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        bookReviewsJson(['error' => 'No se pudo borrar tu opinión'], 500);
    }
}

if ($method === 'POST') {
    $userId = librelulaRequireLogin($db);
    librelulaVerifyCsrf();

    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        bookReviewsJson(['error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    $bookId = trim((string) ($data['book_id'] ?? ''));

    if ($bookId === '') {
        bookReviewsJson(['error' => 'book_id requerido'], 400);
    }

    $ratingOnly = !empty($data['rating_only']);
    $hasScore = array_key_exists('score', $data);
    $hasReview = array_key_exists('review', $data);
    $hasVibes = array_key_exists('vibes', $data);
    $hasAtmosphere = array_key_exists('atmosphere', $data);

    $rawScore = $data['score'] ?? null;
    $score = $rawScore === '' || $rawScore === null
        ? null
        : filter_var($rawScore, FILTER_VALIDATE_INT);

    if ($hasScore && $score !== null && ($score === false || $score < 1 || $score > 5)) {
        bookReviewsJson(['error' => 'La puntuación debe estar entre 1 y 5'], 400);
    }

    $review = trim((string) ($data['review'] ?? ''));

    if ($hasReview && bookReviewsTextLength($review) > 5000) {
        bookReviewsJson(['error' => 'La reseña no puede superar los 5000 caracteres'], 400);
    }

    $vibes = [];

    if ($hasVibes) {
        if (!is_array($data['vibes'])) {
            bookReviewsJson(['error' => 'Las sensaciones deben enviarse como una lista'], 400);
        }

        foreach ($data['vibes'] as $vibe) {
            $key = trim((string) $vibe);
            if (isset(LIBRELULA_VIBES[$key])) {
                $vibes[] = $key;
            }
        }

        $vibes = array_values(array_unique($vibes));

        if (count($vibes) > 5) {
            bookReviewsJson(['error' => 'Puedes elegir un máximo de 5 sensaciones'], 400);
        }
    }

    try {
        $atmosphere = $hasAtmosphere
            ? bookReviewsValidatedAtmosphere($data['atmosphere'])
            : null;
    } catch (InvalidArgumentException $error) {
        bookReviewsJson(['error' => $error->getMessage()], 400);
    }

    if (!$ratingOnly && !$hasScore && !$hasReview && !$hasVibes && !$hasAtmosphere) {
        bookReviewsJson(['error' => 'No hay cambios que guardar'], 400);
    }

    try {
        bookReviewsEnsureInsightSchema($db);

        $bookStmt = $db->prepare('SELECT 1 FROM books WHERE id = :book_id LIMIT 1');
        $bookStmt->execute([':book_id' => $bookId]);

        if (!$bookStmt->fetchColumn()) {
            bookReviewsJson(['error' => 'El libro no existe'], 404);
        }

        $db->beginTransaction();

        $existingStmt = $db->prepare(<<<'SQL'
            SELECT id, score, notes
            FROM user_books
            WHERE user_id = :user_id AND book_id = :book_id
            LIMIT 1
        SQL);
        $existingStmt->execute([':user_id' => $userId, ':book_id' => $bookId]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $nextScore = $hasScore
            ? $score
            : ($existing && $existing['score'] !== null ? (int) $existing['score'] : null);
        $nextReview = $hasReview
            ? $review
            : ($existing ? trim((string) ($existing['notes'] ?? '')) : '');

        if ($existing) {
            $updateStmt = $db->prepare(<<<'SQL'
                UPDATE user_books
                SET score = :score,
                    notes = :notes
                WHERE id = :id AND user_id = :user_id
            SQL);
            $updateStmt->bindValue(':score', $nextScore, $nextScore === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
            $updateStmt->bindValue(':notes', $nextReview === '' ? null : $nextReview, $nextReview === '' ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $updateStmt->bindValue(':id', (int) $existing['id'], PDO::PARAM_INT);
            $updateStmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
            $updateStmt->execute();
        } else {
            $insertStmt = $db->prepare(<<<'SQL'
                INSERT INTO user_books (
                    user_id, book_id, status, score, progress, notes
                ) VALUES (
                    :user_id, :book_id, 'planned', :score, 0, :notes
                )
            SQL);
            $insertStmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
            $insertStmt->bindValue(':book_id', $bookId, PDO::PARAM_STR);
            $insertStmt->bindValue(':score', $nextScore, $nextScore === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
            $insertStmt->bindValue(':notes', $nextReview === '' ? null : $nextReview, $nextReview === '' ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $insertStmt->execute();
        }

        if ($hasVibes) {
            $deleteVibesStmt = $db->prepare(
                'DELETE FROM review_vibes WHERE user_id = :user_id AND book_id = :book_id'
            );
            $deleteVibesStmt->execute([':user_id' => $userId, ':book_id' => $bookId]);

            if ($vibes) {
                $insertVibeStmt = $db->prepare(<<<'SQL'
                    INSERT INTO review_vibes (user_id, book_id, vibe)
                    VALUES (:user_id, :book_id, :vibe)
                SQL);

                foreach ($vibes as $vibe) {
                    $insertVibeStmt->execute([
                        ':user_id' => $userId,
                        ':book_id' => $bookId,
                        ':vibe' => $vibe,
                    ]);
                }
            }
        }

        if ($hasAtmosphere && $atmosphere !== null) {
            $atmosphereStmt = $db->prepare(<<<'SQL'
                INSERT INTO review_atmosphere (
                    user_id, book_id, pace, tension, darkness, warmth, emotion, immersion, updated_at
                ) VALUES (
                    :user_id, :book_id, :pace, :tension, :darkness, :warmth, :emotion, :immersion, CURRENT_TIMESTAMP
                )
                ON CONFLICT(user_id, book_id) DO UPDATE SET
                    pace = excluded.pace,
                    tension = excluded.tension,
                    darkness = excluded.darkness,
                    warmth = excluded.warmth,
                    emotion = excluded.emotion,
                    immersion = excluded.immersion,
                    updated_at = CURRENT_TIMESTAMP
            SQL);
            $atmosphereStmt->execute([
                ':user_id' => $userId,
                ':book_id' => $bookId,
                ':pace' => $atmosphere['pace'],
                ':tension' => $atmosphere['tension'],
                ':darkness' => $atmosphere['darkness'],
                ':warmth' => $atmosphere['warmth'],
                ':emotion' => $atmosphere['emotion'],
                ':immersion' => $atmosphere['immersion'],
            ]);
        }

        $db->commit();

        $payload = bookReviewsPayload($db, $bookId, $userId);
        $payload['ok'] = true;
        $payload['message'] = $ratingOnly
            ? 'Tu puntuación se ha guardado.'
            : ($existing ? 'Tu reseña se ha actualizado.' : 'Tu reseña se ha publicado.');

        bookReviewsJson($payload);
    } catch (PDOException) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        bookReviewsJson(['error' => 'No se pudo guardar la reseña'], 500);
    }
}

bookReviewsJson(['error' => 'Método no permitido'], 405);
