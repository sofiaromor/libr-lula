<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

function searchJson(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function searchTextLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function searchFetchJson(string $url, string $service = 'external'): ?array
{
    $raw = null;
    $status = 0;
    $userAgent = 'Librelula/1.2 (personal local book catalog; ' . $service . ')';

    if (function_exists('curl_init')) {
        $ch = curl_init($url);

        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 18,
                CURLOPT_USERAGENT => $userAgent,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                    'Accept-Language: es,en;q=0.7',
                ],
            ]);

            $curlRaw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if (is_string($curlRaw)) {
                $raw = $curlRaw;
            }
        }
    }

    if (!is_string($raw) && filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 18,
                'header' => implode("\r\n", [
                    'Accept: application/json',
                    'Accept-Language: es,en;q=0.7',
                    'User-Agent: ' . $userAgent,
                    '',
                ]),
                'ignore_errors' => true,
            ],
        ]);

        $streamRaw = @file_get_contents($url, false, $context);

        if (is_string($streamRaw)) {
            $raw = $streamRaw;
            $status = 200;

            foreach (($http_response_header ?? []) as $headerLine) {
                if (preg_match('~^HTTP/\S+\s+(\d{3})~i', $headerLine, $match)) {
                    $status = (int) $match[1];
                    break;
                }
            }
        }
    }

    if (!is_string($raw) || $status < 200 || $status >= 300) {
        return null;
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function searchFirstString(mixed $value): ?string
{
    if (is_array($value)) {
        foreach ($value as $item) {
            $text = trim((string) $item);
            if ($text !== '') {
                return $text;
            }
        }

        return null;
    }

    $text = trim((string) $value);
    return $text !== '' ? $text : null;
}

function searchExtractYear(mixed $value): ?int
{
    $text = searchFirstString($value);

    if ($text !== null && preg_match('/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/', $text, $match)) {
        return (int) $match[1];
    }

    return null;
}

function searchNormalizeIsbn(mixed $value): ?string
{
    $values = is_array($value) ? $value : [$value];
    $isbn10 = null;

    foreach ($values as $candidate) {
        $normalized = strtoupper((string) preg_replace('/[^0-9X]/i', '', (string) $candidate));

        if (strlen($normalized) === 13) {
            return $normalized;
        }

        if (strlen($normalized) === 10) {
            $isbn10 = $normalized;
        }
    }

    return $isbn10;
}

function searchLanguage(mixed $value): ?string
{
    $language = strtolower((string) (searchFirstString($value) ?? ''));

    $map = [
        'spa' => 'es',
        'eng' => 'en',
        'fra' => 'fr',
        'fre' => 'fr',
        'deu' => 'de',
        'ger' => 'de',
        'ita' => 'it',
        'por' => 'pt',
        'cat' => 'ca',
        'glg' => 'gl',
        'eus' => 'eu',
        'jpn' => 'ja',
        'kor' => 'ko',
        'zho' => 'zh',
        'chi' => 'zh',
        'rus' => 'ru',
    ];

    if (isset($map[$language])) {
        return $map[$language];
    }

    return preg_match('/^[a-z]{2,3}$/', $language) ? $language : null;
}

function searchCleanSubjects(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }

    $blocked = [
        'accessible book',
        'protected daisy',
        'in library',
        'overdrive',
        'large type books',
        'juvenile literature',
        'translations into',
    ];
    $subjects = [];

    foreach ($value as $subject) {
        $text = trim((string) $subject);
        $lower = strtolower($text);

        if ($text === '' || strlen($text) > 80) {
            continue;
        }

        $skip = false;
        foreach ($blocked as $needle) {
            if (str_contains($lower, $needle)) {
                $skip = true;
                break;
            }
        }

        if (!$skip) {
            $subjects[$lower] = $text;
        }

        if (count($subjects) >= 12) {
            break;
        }
    }

    return array_values($subjects);
}

function searchOpenLibraryEdition(array $doc): array
{
    $editions = $doc['editions']['docs'] ?? [];

    if (!is_array($editions)) {
        return [];
    }

    foreach ($editions as $edition) {
        if (is_array($edition)) {
            return $edition;
        }
    }

    return [];
}

function searchOpenLibraryResults(string $query): ?array
{
    $isbnQuery = searchNormalizeIsbn($query);
    $searchExpression = $isbnQuery !== null
        ? 'isbn:' . $isbnQuery
        : $query;

    $fields = implode(',', [
        'key',
        'title',
        'author_name',
        'first_publish_year',
        'number_of_pages_median',
        'cover_i',
        'subject',
        'publisher',
        'language',
        'isbn',
        'first_sentence',
        'edition_count',
        'editions',
        'editions.key',
        'editions.title',
        'editions.language',
        'editions.publisher',
        'editions.publish_date',
        'editions.number_of_pages',
        'editions.isbn',
        'editions.cover_i',
    ]);

    $url = 'https://openlibrary.org/search.json?'
        . http_build_query([
            'q' => $searchExpression,
            'lang' => 'es',
            'fields' => $fields,
            'limit' => 20,
        ]);

    $data = searchFetchJson($url, 'Open Library search');

    if ($data === null) {
        return null;
    }

    $results = [];

    foreach (($data['docs'] ?? []) as $doc) {
        if (!is_array($doc)) {
            continue;
        }

        $edition = searchOpenLibraryEdition($doc);
        $title = trim((string) ($edition['title'] ?? $doc['title'] ?? ''));

        if ($title === '') {
            continue;
        }

        $authors = array_values(array_filter(array_map(
            static fn(mixed $author): string => trim((string) $author),
            is_array($doc['author_name'] ?? null) ? $doc['author_name'] : []
        )));

        $workKey = trim((string) ($doc['key'] ?? ''));
        $editionKey = trim((string) ($edition['key'] ?? ''));
        $sourceId = $editionKey !== '' ? $editionKey : $workKey;
        $sourceId = trim(preg_replace('~^/(?:books|works)/~', '', $sourceId) ?? $sourceId, '/');

        if ($sourceId === '') {
            $sourceId = hash('sha256', $title . '|' . implode(',', $authors));
        }

        $coverId = $edition['cover_i'] ?? $doc['cover_i'] ?? null;
        $coverId = is_numeric($coverId) ? (int) $coverId : null;
        $isbn = searchNormalizeIsbn($edition['isbn'] ?? null)
            ?? searchNormalizeIsbn($doc['isbn'] ?? null);
        $firstSentence = searchFirstString($doc['first_sentence'] ?? null);
        $pages = $edition['number_of_pages'] ?? $doc['number_of_pages_median'] ?? null;
        $pages = is_numeric($pages) && (int) $pages > 0 ? (int) $pages : null;

        $results[] = [
            'provider' => 'open_library',
            'provider_label' => 'Open Library',
            'source_id' => $sourceId,
            'openlibrary_key' => $workKey !== '' ? $workKey : null,
            'edition_key' => $editionKey !== '' ? $editionKey : null,
            'title' => $title,
            'author' => $authors !== [] ? implode(', ', $authors) : 'Autor desconocido',
            'year' => searchExtractYear($edition['publish_date'] ?? null)
                ?? searchExtractYear($doc['first_publish_year'] ?? null),
            'pages' => $pages,
            'cover' => $coverId !== null
                ? "https://covers.openlibrary.org/b/id/{$coverId}-L.jpg"
                : null,
            'description' => $firstSentence,
            'genres' => searchCleanSubjects($doc['subject'] ?? []),
            'publisher' => searchFirstString($edition['publisher'] ?? null)
                ?? searchFirstString($doc['publisher'] ?? null),
            'language' => searchLanguage($edition['language'] ?? null)
                ?? searchLanguage($doc['language'] ?? null),
            'isbn' => $isbn,
        ];
    }

    return $results;
}

function searchGoogleCover(array $volume): ?string
{
    $links = is_array($volume['imageLinks'] ?? null)
        ? $volume['imageLinks']
        : [];

    foreach (['extraLarge', 'large', 'medium', 'thumbnail', 'smallThumbnail'] as $size) {
        $cover = trim((string) ($links[$size] ?? ''));

        if ($cover !== '') {
            return str_replace(
                ['http://', '&edge=curl'],
                ['https://', ''],
                $cover
            );
        }
    }

    return null;
}

function searchGoogleIsbn(array $volume): ?string
{
    $values = [];

    foreach (($volume['industryIdentifiers'] ?? []) as $identifier) {
        if (is_array($identifier)) {
            $values[] = $identifier['identifier'] ?? null;
        }
    }

    return searchNormalizeIsbn($values);
}

function searchGoogleResults(string $query): ?array
{
    $url = 'https://www.googleapis.com/books/v1/volumes?'
        . http_build_query([
            'q' => $query,
            'maxResults' => 12,
            'printType' => 'books',
            'orderBy' => 'relevance',
        ]);

    $data = searchFetchJson($url, 'Google Books fallback');

    if ($data === null) {
        return null;
    }

    $results = [];

    foreach (($data['items'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }

        $volume = is_array($item['volumeInfo'] ?? null)
            ? $item['volumeInfo']
            : [];
        $title = trim((string) ($volume['title'] ?? ''));

        if ($title === '') {
            continue;
        }

        $authors = array_values(array_filter(array_map(
            static fn(mixed $author): string => trim((string) $author),
            is_array($volume['authors'] ?? null) ? $volume['authors'] : []
        )));
        $categories = array_values(array_filter(array_map(
            static fn(mixed $category): string => trim((string) $category),
            is_array($volume['categories'] ?? null) ? $volume['categories'] : []
        )));

        $results[] = [
            'provider' => 'google_books',
            'provider_label' => 'Google Books',
            'source_id' => (string) ($item['id'] ?? hash('sha256', $title . '|' . implode(',', $authors))),
            'title' => $title,
            'author' => $authors !== [] ? implode(', ', $authors) : 'Autor desconocido',
            'year' => searchExtractYear($volume['publishedDate'] ?? null),
            'pages' => isset($volume['pageCount']) && is_numeric($volume['pageCount'])
                ? max(1, (int) $volume['pageCount'])
                : null,
            'cover' => searchGoogleCover($volume),
            'description' => trim((string) ($volume['description'] ?? '')) ?: null,
            'genres' => array_slice($categories, 0, 8),
            'publisher' => trim((string) ($volume['publisher'] ?? '')) ?: null,
            'language' => searchLanguage($volume['language'] ?? null),
            'isbn' => searchGoogleIsbn($volume),
        ];
    }

    return $results;
}

function searchFingerprint(array $result): string
{
    $isbn = searchNormalizeIsbn($result['isbn'] ?? null);

    if ($isbn !== null) {
        return 'isbn:' . $isbn;
    }

    $text = strtolower(trim(
        (string) ($result['title'] ?? '')
        . '|'
        . (string) ($result['author'] ?? '')
    ));

    if (function_exists('iconv')) {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if (is_string($ascii)) {
            $text = $ascii;
        }
    }

    $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? $text;
    return 'text:' . trim($text);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    searchJson(['error' => 'Método no permitido'], 405);
}

$query = trim((string) ($_GET['q'] ?? ''));
$length = searchTextLength($query);

if ($length < 2 || $length > 200) {
    searchJson([
        'error' => 'La búsqueda debe tener entre 2 y 200 caracteres',
    ], 400);
}

$openLibraryResults = searchOpenLibraryResults($query);
$googleResults = null;

/*
 * Open Library es la fuente principal. Google Books completa la búsqueda
 * cuando Open Library devuelve pocos resultados o no está disponible.
 */
if ($openLibraryResults === null || count($openLibraryResults) < 12) {
    $googleResults = searchGoogleResults($query);
}

if ($openLibraryResults === null && $googleResults === null) {
    searchJson([
        'error' => 'No se pudo conectar con Open Library ni con el buscador alternativo. Puedes crear el libro manualmente.',
    ], 502);
}

$merged = [];
$seen = [];

foreach (array_merge($openLibraryResults ?? [], $googleResults ?? []) as $result) {
    if (!is_array($result)) {
        continue;
    }

    $fingerprint = searchFingerprint($result);

    if (isset($seen[$fingerprint])) {
        continue;
    }

    $seen[$fingerprint] = true;
    $merged[] = $result;

    if (count($merged) >= 20) {
        break;
    }
}

searchJson([
    'ok' => true,
    'query' => $query,
    'provider' => 'Open Library',
    'providers' => [
        'open_library' => $openLibraryResults !== null,
        'google_books' => $googleResults !== null,
    ],
    'results' => $merged,
]);
