<?php

declare(strict_types=1);

if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit;
}

require_once __DIR__ . "/../config.php";

function columnExists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->query("PRAGMA table_info(" . $table . ")");

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $field) {
        if (($field["name"] ?? "") === $column) {
            return true;
        }
    }

    return false;
}

try {
    $db->beginTransaction();

    if (!columnExists($db, "books", "saga_name")) {
        $db->exec("
            ALTER TABLE books
            ADD COLUMN saga_name TEXT
        ");

        echo "Añadida columna saga_name.\n";
    } else {
        echo "La columna saga_name ya existía.\n";
    }

    if (!columnExists($db, "books", "saga_number")) {
        $db->exec("
            ALTER TABLE books
            ADD COLUMN saga_number REAL
        ");

        echo "Añadida columna saga_number.\n";
    } else {
        echo "La columna saga_number ya existía.\n";
    }

    if (!columnExists($db, "books", "saga_key")) {
        $db->exec("
            ALTER TABLE books
            ADD COLUMN saga_key TEXT
        ");

        echo "Añadida columna saga_key.\n";
    } else {
        echo "La columna saga_key ya existía.\n";
    }

    $db->exec("
        CREATE INDEX IF NOT EXISTS idx_books_saga
        ON books (saga_key, saga_number)
    ");

    $db->commit();

    echo "Migración de sagas completada correctamente.\n";
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    fwrite(STDERR, "Error: " . $error->getMessage() . "\n");
    exit(1);
}