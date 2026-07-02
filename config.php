<?php

declare(strict_types=1);

try {
    $databasePath = __DIR__ . '/database/librelula.db';

    $db = new PDO('sqlite:' . $databasePath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec('PRAGMA busy_timeout = 5000');
} catch (PDOException $error) {
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, 'Error de conexión: ' . $error->getMessage() . PHP_EOL);
        exit(1);
    }

    http_response_code(500);
    exit('No se pudo conectar con la base de datos.');
}
