<?php

declare(strict_types=1);

if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit;
}

require_once __DIR__ . "/../config.php";

$columns = $db->query("PRAGMA table_info(books)")->fetchAll();
$found = 0;

foreach ($columns as $column) {
    $name = $column["name"] ?? "";

    if (str_starts_with($name, "saga_")) {
        echo $name . " | " . $column["type"] . PHP_EOL;
        $found++;
    }
}

if ($found === 0) {
    echo "No se encontraron columnas de saga." . PHP_EOL;
}
