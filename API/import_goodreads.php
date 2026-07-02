<?php
ini_set('display_errors', 0);
error_reporting(0);
set_time_limit(300);
ini_set('memory_limit', '256M');
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { exit; }

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"]);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../includes/auth.php";
require_once __DIR__ . "/hero_color_helpers.php";
require_once __DIR__ . "/../includes/book_taxonomy.php";
require_once __DIR__ . "/../includes/genre_normalization.php";

$user_id = librelulaRequireLogin($db);
librelulaVerifyCsrf();

function curlGet($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $httpCode === 200 ? $response : null;
}

function fetchGoodreadsShelf($goodreadsId, $shelf) {
    $url = "https://api.piratereads.com/{$goodreadsId}/{$shelf}?per_page=100";
    $raw = curlGet($url);
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return $data["books"] ?? [];
}

function fetchBookMetadata($title, $author) {
    $query = urlencode("{$title} {$author}");

    $raw = curlGet("https://www.googleapis.com/books/v1/volumes?q={$query}&maxResults=1");
    if ($raw) {
        $data = json_decode($raw, true);
        $item = $data["items"][0] ?? null;
        if ($item) {
            $v = $item["volumeInfo"];
            $isbn = null;
            foreach (($v["industryIdentifiers"] ?? []) as $id) {
                if ($id["type"] === "ISBN_13") { $isbn = $id["identifier"]; break; }
            }
            $cover = $v["imageLinks"]["thumbnail"] ?? null;
            if ($cover) {
                $cover = str_replace("http://", "https://", $cover);
                $cover = str_replace("&edge=curl", "", $cover);
            }
            return [
                "id"          => $item["id"],
                "title"       => $v["title"] ?? $title,
                "author"      => implode(", ", $v["authors"] ?? [$author]),
                "year"        => substr($v["publishedDate"] ?? "", 0, 4) ?: null,
                "pages"       => $v["pageCount"] ?? null,
                "cover_url"   => $cover,
                "description" => $v["description"] ?? null,
                "genres"      => json_encode($v["categories"] ?? []),
                "publisher"   => $v["publisher"] ?? null,
                "language"    => $v["language"] ?? null,
                "isbn"        => $isbn,
            ];
        }
    }

    $raw2 = curlGet("https://openlibrary.org/search.json?q={$query}&limit=1");
    if ($raw2) {
        $data2 = json_decode($raw2, true);
        $doc   = $data2["docs"][0] ?? null;
        if ($doc) {
            $coverId = $doc["cover_i"] ?? null;
            return [
                "id"          => str_replace("/works/", "", $doc["key"] ?? uniqid()),
                "title"       => $doc["title"] ?? $title,
                "author"      => implode(", ", $doc["author_name"] ?? [$author]),
                "year"        => isset($doc["first_publish_year"]) ? (string)$doc["first_publish_year"] : null,
                "pages"       => $doc["number_of_pages_median"] ?? null,
                "cover_url"   => $coverId ? "https://covers.openlibrary.org/b/id/{$coverId}-L.jpg" : null,
                "description" => null,
                "genres"      => json_encode(array_slice($doc["subject"] ?? [], 0, 4)),
                "publisher"   => $doc["publisher"][0] ?? null,
                "language"    => $doc["language"][0] ?? null,
                "isbn"        => $doc["isbn"][0] ?? null,
            ];
        }
    }

    return null;
}

function saveBook($db, $bookMeta) {
    $classification = librelulaClassifyBookTags($bookMeta["genres"] ?? []);
    $serializedGenres = $classification["genres"] !== []
        ? json_encode($classification["genres"], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        : null;

    $check = $db->prepare("SELECT id FROM books WHERE id = ?");
    $check->execute([$bookMeta["id"]]);
    $exists = (bool) $check->fetchColumn();
    $check->closeCursor();

    if ($exists) {
        $stmt = $db->prepare("
            UPDATE books SET
                cover    = COALESCE(:cover, cover),
                synopsis = COALESCE(:synopsis, synopsis),
                pages    = COALESCE(:pages, pages),
                year     = COALESCE(:year, year),
                genre    = CASE
                    WHEN genre IS NULL OR TRIM(genre) = '' OR genre = '[]'
                    THEN :genre ELSE genre END,
                language = COALESCE(NULLIF(language, ''), :language)
            WHERE id = :id
        ");
        $stmt->execute([
            ":id"       => $bookMeta["id"],
            ":cover"    => $bookMeta["cover_url"] ?? null,
            ":synopsis" => $bookMeta["description"] ?? null,
            ":pages"    => $bookMeta["pages"] ?? null,
            ":year"     => $bookMeta["year"] ?? null,
            ":genre"    => $serializedGenres,
            ":language" => $bookMeta["language"] ?? "es",
        ]);
        $stmt->closeCursor();
    } else {
        $stmt = $db->prepare("
            INSERT INTO books (id, title, author, year, pages, cover, synopsis, language, genre, publisher, isbn, hero_color)
            VALUES (:id, :title, :author, :year, :pages, :cover, :synopsis, :language, :genre, :publisher, :isbn, :hero_color)
        ");
        $stmt->execute([
            ":id"          => $bookMeta["id"],
            ":title"       => $bookMeta["title"],
            ":author"      => $bookMeta["author"],
            ":year"        => $bookMeta["year"] ?? null,
            ":pages"       => $bookMeta["pages"] ?? null,
            ":cover"       => $bookMeta["cover_url"] ?? null,
            ":synopsis"    => $bookMeta["description"] ?? null,
            ":language"    => $bookMeta["language"] ?? "es",
            ":genre"       => $serializedGenres,
            ":publisher"   => $bookMeta["publisher"] ?? null,
            ":isbn"        => $bookMeta["isbn"] ?? null,
            ":hero_color"  => LIBRELULA_FALLBACK_HERO_COLOR,
        ]);
        $stmt->closeCursor();
    }

    $existing = librelulaBookTaxonomyForBook($db, (string) $bookMeta["id"]);
    librelulaBookTaxonomyReplace(
        $db,
        (string) $bookMeta["id"],
        'theme',
        librelulaMergeTagLists($existing['themes'], $classification['themes']),
        12
    );
    librelulaBookTaxonomyReplace(
        $db,
        (string) $bookMeta["id"],
        'audience',
        librelulaMergeTagLists($existing['audiences'], $classification['audiences']),
        4
    );
    librelulaBookTaxonomyReplace(
        $db,
        (string) $bookMeta["id"],
        'aesthetic',
        librelulaMergeTagLists($existing['aesthetics'], $classification['aesthetics']),
        8
    );
}

function saveUserBook($db, $userId, $bookId, $status, $rating = null) {
    $statusMap = [
        "read"              => "completed",
        "currently-reading" => "reading",
        "to-read"           => "planned",
    ];
    $libStatus   = $statusMap[$status] ?? "planned";
    $finished_at = ($libStatus === "completed") ? date("Y-m-d") : null;
    $started_at  = ($libStatus === "reading")   ? date("Y-m-d") : null;

    $check = $db->prepare("SELECT id FROM user_books WHERE user_id = ? AND book_id = ?");
    $check->execute([$userId, $bookId]);

    if ($check->fetch()) {
        $stmt = $db->prepare("
            UPDATE user_books SET
                status      = :status,
                score       = COALESCE(:score, score),
                finished_at = COALESCE(:finished_at, finished_at),
                started_at  = COALESCE(:started_at, started_at)
            WHERE user_id = :user_id AND book_id = :book_id
        ");
    } else {
        $stmt = $db->prepare("
            INSERT INTO user_books (user_id, book_id, status, score, started_at, finished_at)
            VALUES (:user_id, :book_id, :status, :score, :started_at, :finished_at)
        ");
    }

    $stmt->execute([
        ":user_id"     => $userId,
        ":book_id"     => $bookId,
        ":status"      => $libStatus,
        ":score"       => $rating ?: null,
        ":started_at"  => $started_at,
        ":finished_at" => $finished_at,
    ]);
}

$data        = json_decode(file_get_contents("php://input"), true);
$goodreadsId = $data["goodreads_id"] ?? null;

if (!$goodreadsId) {
    echo json_encode(["error" => "goodreads_id requerido"]);
    exit;
}

$shelves = [
    "read"              => "completed",
    "currently-reading" => "reading",
    "to-read"           => "planned",
];

$results     = ["imported" => 0, "skipped" => 0, "errors" => [], "shelves" => []];

foreach ($shelves as $shelf => $libStatus) {
    $books      = fetchGoodreadsShelf($goodreadsId, $shelf);
    $shelfCount = 0;

    foreach ($books as $book) {
        $title  = $book["book_title"]  ?? null;
        $author = $book["book_author"] ?? null;
        $rating = $book["rating"]      ?? null;

        if (!$title) { $results["skipped"]++; continue; }

        $coverFromGoodreads = $book["book_cover_large"] ?? $book["book_cover_medium"] ?? null;
        $meta               = fetchBookMetadata($title, $author ?? "");

        if (!$meta) {
            $meta = [
                "id"          => "gr_" . md5($title . $author),
                "title"       => $title,
                "author"      => $author ?? "Desconocido",
                "year"        => null,
                "pages"       => null,
                "cover_url"   => $coverFromGoodreads,
                "description" => null,
                "genres"      => "[]",
                "publisher"   => null,
                "language"    => null,
                "isbn"        => null,
            ];
        } else if ($coverFromGoodreads && !$meta["cover_url"]) {
            $meta["cover_url"] = $coverFromGoodreads;
        }

        try {
            saveBook($db, $meta);
            saveUserBook($db, $user_id, $meta["id"], $shelf, $rating > 0 ? $rating : null);
            $results["imported"]++;
            $shelfCount++;
        } catch (Exception $e) {
            $results["errors"][] = "Error con '{$title}': " . $e->getMessage();
            $results["skipped"]++;
        }

        usleep(200000);
    }

    $results["shelves"][$shelf] = $shelfCount;
}

echo json_encode($results);
