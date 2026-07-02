<?php

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../includes/book_taxonomy.php";
require_once __DIR__ . "/../includes/auth.php";

function sendJson(array $data, int $status = 200): void
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

function curlJson(string $url): ?array
{
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_USERAGENT => "Librelula/1.0 (local development)",
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!is_string($response) || $httpCode < 200 || $httpCode >= 300) {
        return null;
    }

    $data = json_decode($response, true);

    return is_array($data) ? $data : null;
}

function lowerText(string $value): string
{
    if (function_exists("mb_strtolower")) {
        return mb_strtolower($value, "UTF-8");
    }

    return strtolower($value);
}

function normalizeText(?string $value): string
{
    $value = lowerText(trim((string) $value));

    if (function_exists("iconv")) {
        $converted = iconv(
            "UTF-8",
            "ASCII//TRANSLIT//IGNORE",
            $value
        );

        if (is_string($converted)) {
            $value = $converted;
        }
    }

    $value = preg_replace('/[^a-z0-9]+/i', ' ', $value) ?? $value;

    return trim(
        preg_replace('/\s+/', ' ', $value) ?? $value
    );
}

function cleanSearchTitle(string $title): string
{
    $clean = preg_replace(
        '/\s*\([^)]*\)\s*$/u',
        '',
        trim($title)
    );

    return trim((string) ($clean ?: $title));
}

function titleSimilarityScore(
    string $wantedTitle,
    string $candidateTitle
): float {
    $wanted = normalizeText(cleanSearchTitle($wantedTitle));
    $candidate = normalizeText(cleanSearchTitle($candidateTitle));

    if ($wanted === "" || $candidate === "") {
        return 0.0;
    }

    if ($candidate === $wanted) {
        return 70.0;
    }

    if (
        str_contains($candidate, $wanted) ||
        str_contains($wanted, $candidate)
    ) {
        return 58.0;
    }

    similar_text($wanted, $candidate, $percent);

    return $percent * 0.58;
}

function editionDocs(array $doc): array
{
    $editions = $doc["editions"]["docs"] ?? [];

    return is_array($editions) ? $editions : [];
}

function candidateTitles(array $doc): array
{
    $titles = [];

    $workTitle = trim((string) ($doc["title"] ?? ""));

    if ($workTitle !== "") {
        $titles[] = $workTitle;
    }

    foreach (editionDocs($doc) as $edition) {
        if (!is_array($edition)) {
            continue;
        }

        $editionTitle = trim(
            (string) ($edition["title"] ?? "")
        );

        if ($editionTitle !== "") {
            $titles[] = $editionTitle;
        }
    }

    return array_values(array_unique($titles));
}

function matchScore(
    array $doc,
    string $title,
    string $author
): float {
    $bestTitleScore = 0.0;

    foreach (candidateTitles($doc) as $candidateTitle) {
        $score = titleSimilarityScore($title, $candidateTitle);

        if ($score > $bestTitleScore) {
            $bestTitleScore = $score;
        }
    }

    $authors = $doc["author_name"] ?? [];

    $docAuthor = normalizeText(
        is_array($authors)
            ? implode(" ", $authors)
            : (string) $authors
    );

    $wantedAuthor = normalizeText($author);
    $authorScore = 0.0;

    if ($wantedAuthor !== "" && $docAuthor === $wantedAuthor) {
        $authorScore = 30.0;
    } elseif (
        $wantedAuthor !== "" &&
        $docAuthor !== "" &&
        (
            str_contains($docAuthor, $wantedAuthor) ||
            str_contains($wantedAuthor, $docAuthor)
        )
    ) {
        $authorScore = 26.0;
    } else {
        similar_text($wantedAuthor, $docAuthor, $authorPercent);
        $authorScore = $authorPercent * 0.30;
    }

    return $bestTitleScore + $authorScore;
}

function extractDescription(mixed $description): ?string
{
    if (is_string($description)) {
        $description = trim($description);

        return $description !== "" ? $description : null;
    }

    if (is_array($description)) {
        $value = trim(
            (string) ($description["value"] ?? "")
        );

        return $value !== "" ? $value : null;
    }

    return null;
}

function cleanSubjects(array $subjects): ?string
{
    $clean = [];

    foreach ($subjects as $subject) {
        if (!is_string($subject)) {
            continue;
        }

        $subject = trim($subject);

        $subject = preg_replace(
            '/^(genre|subject):\s*/iu',
            '',
            $subject
        ) ?? $subject;

        if (
            $subject === "" ||
            str_starts_with(lowerText($subject), "series:") ||
            mb_strlen($subject, "UTF-8") > 80
        ) {
            continue;
        }

        $clean[] = $subject;

        if (count($clean) >= 5) {
            break;
        }
    }

    $clean = array_values(array_unique($clean));

    return $clean ? implode(", ", $clean) : null;
}

function firstArrayValue(mixed $value): mixed
{
    if (is_array($value)) {
        return $value[0] ?? null;
    }

    return $value;
}

function extractYear(mixed $value): ?string
{
    if (is_array($value)) {
        $value = $value[0] ?? null;
    }

    $text = trim((string) $value);

    if (
        $text !== "" &&
        preg_match('/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/', $text, $match)
    ) {
        return $match[1];
    }

    return null;
}

function preferredLanguageParameter(?string $language): ?string
{
    $language = lowerText(trim((string) $language));

    $map = [
        "es" => "es",
        "spa" => "es",
        "en" => "en",
        "eng" => "en",
        "ca" => "ca",
        "cat" => "ca",
        "fr" => "fr",
        "fre" => "fr",
        "fra" => "fr",
        "de" => "de",
        "ger" => "de",
        "deu" => "de",
        "it" => "it",
        "ita" => "it",
        "pt" => "pt",
        "por" => "pt",
    ];

    return $map[$language] ?? null;
}

function bestMatchingEdition(
    array $doc,
    string $wantedTitle
): ?array {
    $bestEdition = null;
    $bestScore = -1.0;

    foreach (editionDocs($doc) as $edition) {
        if (!is_array($edition)) {
            continue;
        }

        $editionTitle = (string) ($edition["title"] ?? "");
        $score = titleSimilarityScore(
            $wantedTitle,
            $editionTitle
        );

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestEdition = $edition;
        }
    }

    return $bestEdition;
}

function findOpenLibraryMetadata(
    string $title,
    string $author,
    ?string $language = null,
    ?string $isbn = null
): ?array {
    $cleanTitle = cleanSearchTitle($title);

    $fields = implode(",", [
        "key",
        "title",
        "author_name",
        "first_publish_year",
        "number_of_pages_median",
        "cover_i",
        "subject",
        "publisher",
        "language",
        "isbn",
        "first_sentence",
        "editions",
        "editions.key",
        "editions.title",
        "editions.language",
        "editions.publisher",
        "editions.publish_date",
        "editions.number_of_pages",
        "editions.isbn",
        "editions.cover_i",
    ]);

    $queries = [];

    if (trim((string) $isbn) !== "") {
        $queries[] = [
            "q" => "isbn:" . trim((string) $isbn),
            "fields" => $fields,
            "limit" => 10,
        ];
    }

    /*
     * La búsqueda libre es importante para títulos traducidos.
     * Open Library puede guardar el título principal de la obra
     * en inglés y el título español dentro de una edición.
     */
    $queries[] = [
        "q" => trim($cleanTitle . " " . $author),
        "fields" => $fields,
        "limit" => 20,
    ];

    $queries[] = [
        "title" => $cleanTitle,
        "author" => $author,
        "fields" => $fields,
        "limit" => 20,
    ];

    if ($cleanTitle !== trim($title)) {
        $queries[] = [
            "q" => trim($title . " " . $author),
            "fields" => $fields,
            "limit" => 20,
        ];
    }

    $lang = preferredLanguageParameter($language);

    if ($lang !== null) {
        foreach ($queries as &$query) {
            $query["lang"] = $lang;
        }

        unset($query);
    }

    $docsByKey = [];

    foreach ($queries as $queryParameters) {
        $query = http_build_query($queryParameters);

        $data = curlJson(
            "https://openlibrary.org/search.json?{$query}"
        );

        foreach (($data["docs"] ?? []) as $doc) {
            if (!is_array($doc)) {
                continue;
            }

            $key = trim((string) ($doc["key"] ?? ""));

            if ($key === "") {
                $key = md5(json_encode($doc));
            }

            $docsByKey[$key] = $doc;
        }
    }

    $allDocs = array_values($docsByKey);

    if (!$allDocs) {
        return null;
    }

    $bestDoc = null;
    $bestScore = -1.0;

    foreach ($allDocs as $doc) {
        $score = matchScore($doc, $title, $author);

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestDoc = $doc;
        }
    }

    if (!$bestDoc || $bestScore < 45) {
        return null;
    }

    $bestEdition = bestMatchingEdition(
        $bestDoc,
        $title
    );

    $work = null;
    $workKey = trim(
        (string) ($bestDoc["key"] ?? "")
    );

    if ($workKey !== "") {
        if (!str_starts_with($workKey, "/works/")) {
            $workKey = "/works/" . ltrim($workKey, "/");
        }

        $work = curlJson(
            "https://openlibrary.org{$workKey}.json"
        );
    }

    $description = extractDescription(
        $work["description"] ?? null
    );

    if ($description === null) {
        $firstSentence = $bestDoc["first_sentence"] ?? null;

        if (is_array($firstSentence)) {
            $firstSentence = $firstSentence[0] ?? null;
        }

        $description = extractDescription($firstSentence);
    }

    $subjects = $work["subjects"]
        ?? ($bestDoc["subject"] ?? []);

    $genre = cleanSubjects(
        is_array($subjects) ? $subjects : []
    );

    $editionPublisher = firstArrayValue(
        $bestEdition["publisher"] ?? null
    );

    $workPublisher = firstArrayValue(
        $bestDoc["publisher"] ?? null
    );

    $editionLanguage = firstArrayValue(
        $bestEdition["language"] ?? null
    );

    $workLanguage = firstArrayValue(
        $bestDoc["language"] ?? null
    );

    $editionIsbn = firstArrayValue(
        $bestEdition["isbn"] ?? null
    );

    $workIsbn = firstArrayValue(
        $bestDoc["isbn"] ?? null
    );

    $editionCover = $bestEdition["cover_i"] ?? null;
    $workCover = $bestDoc["cover_i"] ?? null;
    $coverId = $editionCover ?: $workCover;

    $editionPages = $bestEdition["number_of_pages"] ?? null;
    $workPages = $bestDoc["number_of_pages_median"] ?? null;

    $editionYear = extractYear(
        $bestEdition["publish_date"] ?? null
    );

    $workYear = isset($bestDoc["first_publish_year"])
        ? (string) $bestDoc["first_publish_year"]
        : null;

    return [
        "year" => $editionYear ?: $workYear,
        "pages" => $editionPages
            ? (int) $editionPages
            : ($workPages ? (int) $workPages : null),
        "cover" => $coverId
            ? "https://covers.openlibrary.org/b/id/{$coverId}-L.jpg"
            : null,
        "synopsis" => $description,
        "genre" => $genre,
        "publisher" => $editionPublisher ?: $workPublisher,
        "language" => $editionLanguage ?: $workLanguage,
        "isbn" => $editionIsbn ?: $workIsbn,
        "openlibrary_key" => $bestDoc["key"] ?? null,
        "edition_key" => $bestEdition["key"] ?? null,
        "matched_title" => $bestEdition["title"]
            ?? ($bestDoc["title"] ?? null),
        "match_score" => round($bestScore, 2),
    ];
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $adminUserId = librelulaRequireAdmin($db);
    librelulaVerifyCsrf();
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    sendJson(["error" => "Método no permitido"], 405);
}

$input = json_decode(
    file_get_contents("php://input"),
    true
);

$bookId = trim((string) ($input["id"] ?? ""));

if ($bookId === "") {
    sendJson(
        ["error" => "Falta el identificador del libro"],
        400
    );
}

$stmt = $db->prepare("
    SELECT *
    FROM books
    WHERE id = :id
    LIMIT 1
");

$stmt->execute([
    ":id" => $bookId,
]);

$book = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$book) {
    sendJson(["error" => "El libro no existe"], 404);
}

$metadata = findOpenLibraryMetadata(
    (string) $book["title"],
    (string) $book["author"],
    $book["language"] ?? null,
    $book["isbn"] ?? null
);

if ($metadata === null) {
    sendJson([
        "error" =>
            "No se encontraron datos adicionales fiables para este libro"
    ], 404);
}

$stmt = $db->prepare("
    UPDATE books SET
        year = CASE
            WHEN year IS NULL OR TRIM(CAST(year AS TEXT)) = ''
            THEN :year ELSE year END,

        pages = CASE
            WHEN pages IS NULL OR TRIM(CAST(pages AS TEXT)) = ''
            THEN :pages ELSE pages END,

        cover = CASE
            WHEN cover IS NULL OR TRIM(cover) = ''
            THEN :cover ELSE cover END,

        synopsis = CASE
            WHEN synopsis IS NULL OR TRIM(synopsis) = ''
            THEN :synopsis ELSE synopsis END,

        genre = CASE
            WHEN genre IS NULL OR TRIM(genre) = '' OR genre = '[]'
            THEN :genre ELSE genre END,

        publisher = CASE
            WHEN publisher IS NULL OR TRIM(publisher) = ''
            THEN :publisher ELSE publisher END,

        language = CASE
            WHEN language IS NULL OR TRIM(language) = ''
            THEN :language ELSE language END,

        isbn = CASE
            WHEN isbn IS NULL OR TRIM(isbn) = ''
            THEN :isbn ELSE isbn END

    WHERE id = :id
");

$stmt->execute([
    ":year" => $metadata["year"],
    ":pages" => $metadata["pages"],
    ":cover" => $metadata["cover"],
    ":synopsis" => $metadata["synopsis"],
    ":genre" => $metadata["genre"],
    ":publisher" => $metadata["publisher"],
    ":language" => $metadata["language"],
    ":isbn" => $metadata["isbn"],
    ":id" => $bookId,
]);

$stmt = $db->prepare("
    SELECT *
    FROM books
    WHERE id = :id
    LIMIT 1
");

$stmt->execute([
    ":id" => $bookId,
]);

$updatedBook = $stmt->fetch(PDO::FETCH_ASSOC);
$updatedBook = librelulaBookTaxonomyAttachOne($db, is_array($updatedBook) ? $updatedBook : null);

sendJson([
    "ok" => true,
    "message" => "Datos del libro completados",
    "book" => $updatedBook,
    "source" => [
        "name" => "Open Library",
        "key" => $metadata["openlibrary_key"],
        "edition_key" => $metadata["edition_key"],
        "matched_title" => $metadata["matched_title"],
        "match_score" => $metadata["match_score"],
    ],
]);
