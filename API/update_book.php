<?php

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../includes/auth.php";
require_once __DIR__ . "/saga_helpers.php";
require_once __DIR__ . "/hero_color_helpers.php";
require_once __DIR__ . "/../includes/book_taxonomy.php";

function sendJson(array $data, int $status = 200): void
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

function postBoolean(string $fieldName): bool
{
    $value = strtolower(trim((string) ($_POST[$fieldName] ?? "")));

    return in_array($value, ["1", "true", "yes", "on"], true);
}

function localDiskPath(?string $publicPath): ?string
{
    if (!$publicPath) {
        return null;
    }

    $path = parse_url($publicPath, PHP_URL_PATH);
    $normalized = ltrim(is_string($path) ? $path : $publicPath, "/");

    if (str_starts_with($normalized, "librelula/")) {
        $normalized = substr($normalized, strlen("librelula/"));
    }

    $allowedDirectories = [
        "images/covers/" => dirname(__DIR__) . "/images/covers/",
        "files/pdf/" => dirname(__DIR__) . "/files/pdf/",
        "files/epub/" => dirname(__DIR__) . "/files/epub/",
    ];

    foreach ($allowedDirectories as $publicDirectory => $diskDirectory) {
        if (str_starts_with($normalized, $publicDirectory)) {
            return $diskDirectory . basename($normalized);
        }
    }

    return null;
}

function deleteLocalFile(?string $publicPath): void
{
    $diskPath = localDiskPath($publicPath);

    if ($diskPath && is_file($diskPath)) {
        unlink($diskPath);
    }
}

function removeSavedFiles(array $diskPaths): void
{
    foreach ($diskPaths as $diskPath) {
        if (is_string($diskPath) && is_file($diskPath)) {
            unlink($diskPath);
        }
    }
}

function safeBaseName(string $bookId): string
{
    $safeId = preg_replace('/[^A-Za-z0-9_-]/', '_', $bookId);

    if (!is_string($safeId) || $safeId === "") {
        $safeId = "book";
    }

    return $safeId . "_" . bin2hex(random_bytes(5));
}

function saveUploadedFile(
    string $fieldName,
    string $directory,
    string $publicDirectory,
    string $baseName,
    int $maximumSize,
    array $allowedExtensions,
    array $allowedMimeTypes
): ?array {
    if (
        !isset($_FILES[$fieldName]) ||
        $_FILES[$fieldName]["error"] === UPLOAD_ERR_NO_FILE
    ) {
        return null;
    }

    $file = $_FILES[$fieldName];

    if ($file["error"] !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException(
            "No se pudo subir el archivo {$fieldName}."
        );
    }

    if ($file["size"] <= 0) {
        throw new InvalidArgumentException(
            "El archivo {$fieldName} está vacío."
        );
    }

    if ($file["size"] > $maximumSize) {
        $maximumMb = round($maximumSize / 1024 / 1024);

        throw new InvalidArgumentException(
            "El archivo {$fieldName} no puede superar {$maximumMb} MB."
        );
    }

    $extension = strtolower(
        pathinfo((string) $file["name"], PATHINFO_EXTENSION)
    );

    if (!in_array($extension, $allowedExtensions, true)) {
        throw new InvalidArgumentException(
            "El formato del archivo {$fieldName} no está permitido."
        );
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file["tmp_name"]);

    if (!in_array($mimeType, $allowedMimeTypes, true)) {
        throw new InvalidArgumentException(
            "El contenido del archivo {$fieldName} no es válido."
        );
    }

    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException(
            "No se pudo crear la carpeta para {$fieldName}."
        );
    }

    $fileName = $baseName . "." . $extension;
    $diskPath = $directory . DIRECTORY_SEPARATOR . $fileName;
    $publicPath = $publicDirectory . "/" . $fileName;

    if (!move_uploaded_file($file["tmp_name"], $diskPath)) {
        throw new RuntimeException(
            "No se pudo guardar el archivo {$fieldName}."
        );
    }

    return [
        "disk_path" => $diskPath,
        "public_path" => $publicPath,
    ];
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $adminUserId = librelulaRequireAdmin($db);
    librelulaVerifyCsrf();
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    sendJson(["error" => "Método no permitido"], 405);
}

$bookId = trim((string) ($_POST["id"] ?? ""));
$title = trim((string) ($_POST["title"] ?? ""));
$author = trim((string) ($_POST["author"] ?? ""));
$language = trim((string) ($_POST["language"] ?? ""));

if ($bookId === "") {
    sendJson(["error" => "Falta el identificador del libro"], 400);
}

if ($title === "") {
    sendJson(["error" => "El título es obligatorio"], 400);
}

if ($author === "") {
    sendJson(["error" => "El autor es obligatorio"], 400);
}

if ($language === "") {
    sendJson(["error" => "El idioma es obligatorio"], 400);
}

$synopsis = trim((string) ($_POST["synopsis"] ?? ""));
$genre = trim((string) ($_POST["genre"] ?? ""));
$publisher = trim((string) ($_POST["publisher"] ?? ""));
$isbn = trim((string) ($_POST["isbn"] ?? ""));
$submittedHeroColor = librelulaNormalizeHeroColor($_POST["hero_color"] ?? null);
$themes = $_POST["themes"] ?? [];
$audiences = $_POST["audiences"] ?? [];
$aesthetics = $_POST["aesthetics"] ?? [];

try {
    $sagaData = readSagaPostData();
} catch (InvalidArgumentException $error) {
    sendJson([
        "error" => $error->getMessage(),
    ], 400);
}

$sagaName = $sagaData["saga_name"];
$sagaNumber = $sagaData["saga_number"];
$sagaKey = $sagaData["saga_key"];

$yearText = trim((string) ($_POST["year"] ?? ""));
$pagesText = trim((string) ($_POST["pages"] ?? ""));

$year = null;
$pages = null;

if ($yearText !== "") {
    if (!ctype_digit($yearText)) {
        sendJson(["error" => "El año debe ser un número entero"], 400);
    }

    $year = (int) $yearText;
    $maximumYear = (int) date("Y") + 1;

    if ($year < 1 || $year > $maximumYear) {
        sendJson(["error" => "El año introducido no es válido"], 400);
    }
}

if ($pagesText !== "") {
    if (!ctype_digit($pagesText)) {
        sendJson([
            "error" => "El número de páginas debe ser un número entero"
        ], 400);
    }

    $pages = (int) $pagesText;

    if ($pages < 1) {
        sendJson([
            "error" => "El número de páginas debe ser mayor que cero"
        ], 400);
    }
}

$removeCover = postBoolean("remove_cover");
$removePdf = postBoolean("remove_pdf");
$removeEpub = postBoolean("remove_epub");

$projectDirectory = dirname(__DIR__);
$newDiskPaths = [];

try {
    $stmt = $db->prepare("
        SELECT
            id,
            cover,
            pdf_file,
            epub_file,
            hero_color,
            created_at
        FROM books
        WHERE id = :id
        LIMIT 1
    ");

    $stmt->execute([
        ":id" => $bookId,
    ]);

    $existingBook = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existingBook) {
        sendJson(["error" => "El libro no existe"], 404);
    }

    $coverUpload = saveUploadedFile(
        "cover",
        $projectDirectory . "/images/covers",
        "images/covers",
        safeBaseName($bookId),
        5 * 1024 * 1024,
        ["jpg", "jpeg", "png", "webp"],
        [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]
    );

    if ($coverUpload !== null) {
        $newDiskPaths[] = $coverUpload["disk_path"];
    }

    $pdfUpload = saveUploadedFile(
        "pdf_file",
        $projectDirectory . "/files/pdf",
        "files/pdf",
        safeBaseName($bookId),
        50 * 1024 * 1024,
        ["pdf"],
        [
            "application/pdf",
            "application/x-pdf",
        ]
    );

    if ($pdfUpload !== null) {
        $newDiskPaths[] = $pdfUpload["disk_path"];
    }

    $epubUpload = saveUploadedFile(
        "epub_file",
        $projectDirectory . "/files/epub",
        "files/epub",
        safeBaseName($bookId),
        50 * 1024 * 1024,
        ["epub"],
        [
            "application/epub+zip",
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream",
        ]
    );

    if ($epubUpload !== null) {
        $newDiskPaths[] = $epubUpload["disk_path"];
    }

    $coverPath = $existingBook["cover"];
    $pdfPath = $existingBook["pdf_file"];
    $epubPath = $existingBook["epub_file"];

    if ($removeCover) {
        $coverPath = null;
    }

    if ($removePdf) {
        $pdfPath = null;
    }

    if ($removeEpub) {
        $epubPath = null;
    }

    if ($coverUpload !== null) {
        $coverPath = $coverUpload["public_path"];
    }

    if ($pdfUpload !== null) {
        $pdfPath = $pdfUpload["public_path"];
    }

    if ($epubUpload !== null) {
        $epubPath = $epubUpload["public_path"];
    }

    $heroColor = librelulaNormalizeHeroColor(
        $existingBook["hero_color"] ?? null
    );

    if ($removeCover) {
        $heroColor = LIBRELULA_FALLBACK_HERO_COLOR;
    } elseif ($coverUpload !== null || array_key_exists("hero_color", $_POST)) {
        $heroColor = $submittedHeroColor;
    }

    $db->beginTransaction();

    $stmt = $db->prepare("
        UPDATE books
        SET
            title = :title,
            author = :author,
            synopsis = :synopsis,
            cover = :cover,
            genre = :genre,
            year = :year,
            pages = :pages,
            publisher = :publisher,
            language = :language,
            isbn = :isbn,
            saga_name = :saga_name,
            saga_number = :saga_number,
            saga_key = :saga_key,
            hero_color = :hero_color,
            pdf_file = :pdf_file,
            epub_file = :epub_file
        WHERE id = :id
    ");

    $stmt->execute([
        ":id" => $bookId,
        ":title" => $title,
        ":author" => $author,
        ":synopsis" => $synopsis !== "" ? $synopsis : null,
        ":cover" => $coverPath,
        ":genre" => $genre !== "" && $genre !== "[]" ? $genre : null,
        ":year" => $year,
        ":pages" => $pages,
        ":publisher" => $publisher !== "" ? $publisher : null,
        ":language" => $language,
        ":isbn" => $isbn !== "" ? $isbn : null,
        ":saga_name" => $sagaName,
        ":saga_number" => $sagaNumber,
        ":saga_key" => $sagaKey,
        ":hero_color" => $heroColor,
        ":pdf_file" => $pdfPath,
        ":epub_file" => $epubPath,
    ]);

    librelulaBookTaxonomyReplace($db, $bookId, "theme", $themes, 12);
    librelulaBookTaxonomyReplace($db, $bookId, "audience", $audiences, 4);
    librelulaBookTaxonomyReplace($db, $bookId, "aesthetic", $aesthetics, 8);
    $db->commit();
    $taxonomy = librelulaBookTaxonomyForBook($db, $bookId);

    if (
        ($removeCover || $coverUpload !== null) &&
        $existingBook["cover"] !== $coverPath
    ) {
        deleteLocalFile($existingBook["cover"]);
    }

    if (
        ($removePdf || $pdfUpload !== null) &&
        $existingBook["pdf_file"] !== $pdfPath
    ) {
        deleteLocalFile($existingBook["pdf_file"]);
    }

    if (
        ($removeEpub || $epubUpload !== null) &&
        $existingBook["epub_file"] !== $epubPath
    ) {
        deleteLocalFile($existingBook["epub_file"]);
    }

    sendJson([
        "ok" => true,
        "message" => "Libro actualizado correctamente",
        "book" => [
            "id" => $bookId,
            "title" => $title,
            "author" => $author,
            "synopsis" => $synopsis !== "" ? $synopsis : null,
            "cover" => $coverPath,
            "genre" => $genre !== "" && $genre !== "[]" ? $genre : null,
            "themes" => $taxonomy["themes"],
            "audiences" => $taxonomy["audiences"],
            "aesthetics" => $taxonomy["aesthetics"],
            "year" => $year,
            "pages" => $pages,
            "publisher" => $publisher !== "" ? $publisher : null,
            "language" => $language,
            "isbn" => $isbn !== "" ? $isbn : null,
            "saga_name" => $sagaName,
            "saga_number" => $sagaNumber,
            "saga_key" => $sagaKey,
            "hero_color" => $heroColor,
            "pdf_file" => $pdfPath,
            "epub_file" => $epubPath,
            "created_at" => $existingBook["created_at"] ?? null,
        ],
    ]);

} catch (InvalidArgumentException $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    removeSavedFiles($newDiskPaths);

    sendJson([
        "error" => $error->getMessage(),
    ], 400);

} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    removeSavedFiles($newDiskPaths);

    sendJson([
        "error" => "No se pudo actualizar el libro",
    ], 500);
}
