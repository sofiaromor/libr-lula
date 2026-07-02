<?php

declare(strict_types=1);

/**
 * Amplía user_books para admitir rereading y paused sin perder datos.
 *
 * Importante: todos los PDOStatement se cierran antes del DDL. En SQLite,
 * una consulta todavía abierta sobre sqlite_master o PRAGMA puede bloquear
 * DROP TABLE / ALTER TABLE incluso desde la misma conexión.
 */
function librelulaEnsureUserBookStatusSchema(PDO $db): void
{
    $db->exec('PRAGMA busy_timeout = 15000');

    $fetchAll = static function (PDO $db, string $sql): array {
        $statement = $db->query($sql);
        if (!$statement instanceof PDOStatement) {
            return [];
        }

        try {
            return $statement->fetchAll(PDO::FETCH_ASSOC);
        } finally {
            $statement->closeCursor();
            unset($statement);
        }
    };

    $fetchValue = static function (PDO $db, string $sql): mixed {
        $statement = $db->query($sql);
        if (!$statement instanceof PDOStatement) {
            return false;
        }

        try {
            return $statement->fetchColumn();
        } finally {
            $statement->closeCursor();
            unset($statement);
        }
    };

    $quoteIdentifier = static function (string $name): string {
        return '"' . str_replace('"', '""', $name) . '"';
    };

    $tableSql = (string) ($fetchValue(
        $db,
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_books' LIMIT 1"
    ) ?: '');

    if ($tableSql === '') {
        $db->exec(<<<'SQL'
            CREATE TABLE user_books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'planned' CHECK (
                    status IN ('reading', 'rereading', 'paused', 'completed', 'planned', 'dropped')
                ),
                progress INTEGER NOT NULL DEFAULT 0,
                score INTEGER,
                started_at DATE,
                finished_at DATE,
                notes TEXT,
                read_count INTEGER NOT NULL DEFAULT 0,
                paused_at DATE,
                dropped_at DATE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            )
        SQL);
        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_user_book ON user_books(user_id, book_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_status ON user_books(user_id, status)');
        return;
    }

    $columns = $fetchAll($db, 'PRAGMA table_info(user_books)');
    $columnNames = [];
    foreach ($columns as $column) {
        $name = trim((string) ($column['name'] ?? ''));
        if ($name !== '') {
            $columnNames[$name] = true;
        }
    }

    $normalizedSql = strtolower($tableSql);
    $alreadySupportsRereading = str_contains($normalizedSql, "'rereading'")
        || str_contains($normalizedSql, '"rereading"');
    $alreadySupportsPaused = str_contains($normalizedSql, "'paused'")
        || str_contains($normalizedSql, '"paused"');

    if ($alreadySupportsRereading && $alreadySupportsPaused) {
        $compatibilityColumns = [
            'read_count' => 'INTEGER NOT NULL DEFAULT 0',
            'paused_at' => 'DATE',
            'dropped_at' => 'DATE',
        ];

        foreach ($compatibilityColumns as $name => $definition) {
            if (!isset($columnNames[$name])) {
                $db->exec('ALTER TABLE user_books ADD COLUMN ' . $quoteIdentifier($name) . ' ' . $definition);
            }
        }

        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_user_book ON user_books(user_id, book_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_status ON user_books(user_id, status)');
        return;
    }

    $dependentViews = [];
    foreach ($fetchAll($db, "SELECT name, sql FROM sqlite_master WHERE type = 'view' AND sql IS NOT NULL") as $view) {
        $sql = (string) ($view['sql'] ?? '');
        if ($sql !== '' && preg_match('/\\buser_books\\b/i', $sql) === 1) {
            $dependentViews[] = $view;
        }
    }

    $indexRows = $fetchAll(
        $db,
        "SELECT name, sql FROM sqlite_master "
        . "WHERE type = 'index' AND tbl_name = 'user_books' AND sql IS NOT NULL"
    );

    $triggerRows = $fetchAll(
        $db,
        "SELECT name, sql FROM sqlite_master "
        . "WHERE type = 'trigger' AND tbl_name = 'user_books' AND sql IS NOT NULL"
    );

    // Ya no debe quedar ningún cursor abierto antes de modificar el esquema.
    gc_collect_cycles();

    $temporaryTable = 'user_books_status_upgrade';

    $createSql = preg_replace(
        '/^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"user_books"|`user_books`|\\[user_books\\]|user_books)/i',
        'CREATE TABLE ' . $temporaryTable,
        trim($tableSql),
        1
    );

    if (!is_string($createSql) || $createSql === trim($tableSql)) {
        throw new RuntimeException('No se pudo preparar la definición temporal de user_books.');
    }

    $createSql = preg_replace_callback(
        '/((?:"|`|\\[)?status(?:"|`|\\])?\\s+IN\\s*\\()([^)]*)(\\))/i',
        static function (array $matches): string {
            $values = (string) ($matches[2] ?? '');
            foreach (['rereading', 'paused'] as $requiredStatus) {
                if (stripos($values, $requiredStatus) === false) {
                    $values = rtrim($values) . ", '" . $requiredStatus . "'";
                }
            }
            return $matches[1] . $values . $matches[3];
        },
        $createSql,
        1,
        $replacementCount
    );

    if (!is_string($createSql) || $replacementCount < 1) {
        throw new RuntimeException('No se encontró la restricción de estados de user_books.');
    }

    $createSql = rtrim($createSql, "; \t\n\r\0\x0B");

    $foreignKeysEnabled = (int) $fetchValue($db, 'PRAGMA foreign_keys') === 1;
    if ($foreignKeysEnabled) {
        $db->exec('PRAGMA foreign_keys = OFF');
    }

    $transactionStarted = false;

    try {
        // IMMEDIATE obtiene el bloqueo de escritura antes de empezar el cambio.
        $db->exec('BEGIN IMMEDIATE');
        $transactionStarted = true;

        foreach ($dependentViews as $view) {
            $name = trim((string) ($view['name'] ?? ''));
            if ($name !== '') {
                $db->exec('DROP VIEW IF EXISTS ' . $quoteIdentifier($name));
            }
        }

        $db->exec('DROP TABLE IF EXISTS ' . $quoteIdentifier($temporaryTable));
        $db->exec($createSql);

        $extraColumns = [
            'read_count' => 'INTEGER NOT NULL DEFAULT 0',
            'paused_at' => 'DATE',
            'dropped_at' => 'DATE',
        ];

        foreach ($extraColumns as $name => $definition) {
            if (!isset($columnNames[$name])) {
                $db->exec(
                    'ALTER TABLE ' . $quoteIdentifier($temporaryTable)
                    . ' ADD COLUMN ' . $quoteIdentifier($name) . ' ' . $definition
                );
            }
        }

        $copyColumns = [];
        foreach ($columns as $column) {
            $name = trim((string) ($column['name'] ?? ''));
            if ($name !== '') {
                $copyColumns[] = $quoteIdentifier($name);
            }
        }

        if ($copyColumns !== []) {
            $columnList = implode(', ', $copyColumns);
            $db->exec(
                'INSERT INTO ' . $quoteIdentifier($temporaryTable) . ' (' . $columnList . ') '
                . 'SELECT ' . $columnList . ' FROM user_books'
            );
        }

        $db->exec('DROP TABLE user_books');
        $db->exec(
            'ALTER TABLE ' . $quoteIdentifier($temporaryTable) . ' RENAME TO user_books'
        );

        foreach ($indexRows as $index) {
            $sql = trim((string) ($index['sql'] ?? ''));
            if ($sql !== '') {
                $db->exec($sql);
            }
        }

        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_user_book ON user_books(user_id, book_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_user_books_status ON user_books(user_id, status)');

        foreach ($triggerRows as $trigger) {
            $sql = trim((string) ($trigger['sql'] ?? ''));
            if ($sql !== '') {
                $db->exec($sql);
            }
        }

        foreach ($dependentViews as $view) {
            $sql = trim((string) ($view['sql'] ?? ''));
            if ($sql !== '') {
                $db->exec($sql);
            }
        }

        $db->exec('COMMIT');
        $transactionStarted = false;
    } catch (Throwable $error) {
        if ($transactionStarted) {
            try {
                $db->exec('ROLLBACK');
            } catch (Throwable) {
                // Conservamos el error original.
            }
        }
        throw $error;
    } finally {
        if ($foreignKeysEnabled) {
            $db->exec('PRAGMA foreign_keys = ON');
        }
    }
}
