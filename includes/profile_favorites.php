<?php

declare(strict_types=1);

/**
 * Crea, de forma no destructiva, las tablas usadas por los favoritos del perfil.
 */
function librelulaInitializeProfileFavorites(PDO $db, ?int $userId = null): void
{
    unset($userId);

    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS profile_favorite_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            book_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, book_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )
    SQL);

    $db->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS profile_favorite_authors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            author_name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, author_name),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    SQL);

    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_profile_favorite_books_user_order '
        . 'ON profile_favorite_books(user_id, sort_order, created_at)'
    );

    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_profile_favorite_authors_user_order '
        . 'ON profile_favorite_authors(user_id, sort_order, created_at)'
    );
}
