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

function removeSavedFiles(array $paths): void
{
    foreach ($paths as $path) {
        if (is_string($path) && is_file($path)) {
            unlink($path);
        }
    }
}

/**
 * Guarda un archivo subido.
 *
 * Devuelve:
 * [
 *   "disk_path" => ruta real en Windows,
 *   "public_path" => ruta utilizada desde el navegador
 * ]
 */
function saveUploadedFile(
    string $fieldName,
    bool $required,
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
        if ($required) {
            throw new InvalidArgumentException(
                "Debes seleccionar el archivo {$fieldName}."
            );
        }

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

    $originalName = (string) $file["name"];

    $extension = strtolower(
        pathinfo($originalName, PATHINFO_EXTENSION)
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

    if (!is_dir($directory)) {
        if (!mkdir($directory, 0775, true)) {
            throw new RuntimeException(
                "No se pudo crear la carpeta para {$fieldName}."
            );
        }
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

/*
|--------------------------------------------------------------------------
| Datos obligatorios
|--------------------------------------------------------------------------
*/

$title = trim((string) ($_POST["title"] ?? ""));
$author = trim((string) ($_POST["author"] ?? ""));
$language = trim((string) ($_POST["language"] ?? ""));

if ($title === "") {
    sendJson(["error" => "El título es obligatorio"], 400);
}

if ($author === "") {
    sendJson(["error" => "El autor es obligatorio"], 400);
}

if ($language === "") {
    sendJson(["error" => "El idioma es obligatorio"], 400);
}

/*
|--------------------------------------------------------------------------
| Datos opcionales
|--------------------------------------------------------------------------
*/

$synopsis = trim((string) ($_POST["synopsis"] ?? ""));
$genre = trim((string) ($_POST["genre"] ?? ""));
$publisher = trim((string) ($_POST["publisher"] ?? ""));
$isbn = trim((string) ($_POST["isbn"] ?? ""));
$heroColor = librelulaNormalizeHeroColor($_POST["hero_color"] ?? null);
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

/*
|--------------------------------------------------------------------------
| Guardado de archivos
|--------------------------------------------------------------------------
*/

$bookId = "manual_" . bin2hex(random_bytes(8));
$projectDirectory = dirname(__DIR__);

$savedDiskPaths = [];

try {
    // Portada obligatoria: máximo 5 MB.
    $coverUpload = saveUploadedFile(
        "cover",
        true,
        $projectDirectory . "/images/covers",
        "images/covers",
        $bookId,
        5 * 1024 * 1024,
        ["jpg", "jpeg", "png", "webp"],
        [
            "image/jpeg",
            "image/png",
            "image/webp",
        ]
    );

    $savedDiskPaths[] = $coverUpload["disk_path"];

    // PDF opcional: máximo 50 MB.
    $pdfUpload = saveUploadedFile(
        "pdf_file",
        false,
        $projectDirectory . "/files/pdf",
        "files/pdf",
        $bookId,
        50 * 1024 * 1024,
        ["pdf"],
        [
            "application/pdf",
            "application/x-pdf",
        ]
    );

    if ($pdfUpload !== null) {
        $savedDiskPaths[] = $pdfUpload["disk_path"];
    }

    // EPUB opcional: máximo 50 MB.
    // Dependiendo de Windows, PHP puede identificarlo como EPUB o ZIP.
    $epubUpload = saveUploadedFile(
        "epub_file",
        false,
        $projectDirectory . "/files/epub",
        "files/epub",
        $bookId,
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
        $savedDiskPaths[] = $epubUpload["disk_path"];
    }

    /*
    |--------------------------------------------------------------------------
    | Inserción en SQLite
    |--------------------------------------------------------------------------
    */

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
        )
        VALUES (
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
            :saga_name,
            :saga_number,
            :saga_key,
            :hero_color,
            :created_by,
            :pdf_file,
            :epub_file
        )
    ");

    $stmt->execute([
        ":id" => $bookId,
        ":title" => $title,
        ":author" => $author,
        ":synopsis" => $synopsis !== "" ? $synopsis : null,
        ":cover" => $coverUpload["public_path"],
        ":genre" => $genre !== "" ? $genre : null,
        ":year" => $year,
        ":pages" => $pages,
        ":language" => $language,
        ":publisher" => $publisher !== "" ? $publisher : null,
        ":isbn" => $isbn !== "" ? $isbn : null,
        ":saga_name" => $sagaName,
        ":saga_number" => $sagaNumber,
        ":saga_key" => $sagaKey,
        ":hero_color" => $heroColor,
        ":created_by" => $adminUserId,
        ":pdf_file" => $pdfUpload["public_path"] ?? null,
        ":epub_file" => $epubUpload["public_path"] ?? null,
    ]);

    librelulaBookTaxonomyReplace($db, $bookId, "theme", $themes, 12);
    librelulaBookTaxonomyReplace($db, $bookId, "audience", $audiences, 4);
    librelulaBookTaxonomyReplace($db, $bookId, "aesthetic", $aesthetics, 8);
    $db->commit();

    $taxonomy = librelulaBookTaxonomyForBook($db, $bookId);

    sendJson([
        "ok" => true,
        "message" => "Libro creado correctamente",
        "book" => [
            "id" => $bookId,
            "title" => $title,
            "author" => $author,
            "synopsis" => $synopsis !== "" ? $synopsis : null,
            "cover" => $coverUpload["public_path"],
            "genre" => $genre !== "" ? $genre : null,
            "themes" => $taxonomy["themes"],
            "audiences" => $taxonomy["audiences"],
            "aesthetics" => $taxonomy["aesthetics"],
            "year" => $year,
            "pages" => $pages,
            "language" => $language,
            "publisher" => $publisher !== "" ? $publisher : null,
            "isbn" => $isbn !== "" ? $isbn : null,
            "saga_name" => $sagaName,
            "saga_number" => $sagaNumber,
            "saga_key" => $sagaKey,
            "hero_color" => $heroColor,
            "pdf_file" => $pdfUpload["public_path"] ?? null,
            "epub_file" => $epubUpload["public_path"] ?? null,
        ],
    ], 201);

} catch (InvalidArgumentException $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    removeSavedFiles($savedDiskPaths);

    sendJson([
        "error" => $error->getMessage()
    ], 400);

} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    removeSavedFiles($savedDiskPaths);

    sendJson([
        "error" => "No se pudo guardar el libro"
    ], 500);
}
