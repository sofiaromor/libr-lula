<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config.php';

$tables = $db->query(<<<'SQL'
    SELECT type, name, sql
    FROM sqlite_master
    WHERE type IN ('table', 'view', 'index')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
SQL)->fetchAll(PDO::FETCH_ASSOC);

$countTables = [
    'books',
    'users',
    'user_books',
    'reviews',
    'review_vibes',
    'review_atmosphere',
    'book_postits',
    'book_taxonomy',
    'profile_favorite_books',
    'profile_favorite_authors',
];

$counts = [];
foreach ($countTables as $table) {
    try {
        $quoted = str_replace('"', '""', $table);
        $counts[$table] = (int) $db->query('SELECT COUNT(*) FROM "' . $quoted . '"')->fetchColumn();
    } catch (Throwable) {
        // La tabla puede no existir en instalaciones anteriores.
    }
}

$now = date('Y-m-d H:i:s');

echo "# Contexto técnico de Librélula\n\n";
echo "Generado: {$now}\n\n";
echo "## Cómo iniciar el proyecto\n\n";
echo "```powershell\n";
echo "cd \"C:\\Users\\sofia\\Desktop\\Librélula\"\n";
echo "& \"C:\\xampp\\php\\php.exe\" -S 127.0.0.1:8001 -t \"C:\\Users\\sofia\\Desktop\\Librélula\"\n";
echo "```\n\n";
echo "Abrir: `http://127.0.0.1:8001/catalogo/`\n\n";
echo "## Funciones importantes instaladas\n\n";
echo "- Catálogo React con búsqueda local y Open Library.\n";
echo "- Estados: Pendiente, Leyendo, Pausado, Leído, Abandonado y Releyendo.\n";
echo "- Valoraciones, reseñas, sensaciones y atmósfera.\n";
echo "- Post-its privados por libro.\n";
echo "- Perfil con favoritos y selector minimalista de lectura actual.\n";
echo "- Géneros literarios separados de temas, público, sensaciones, atmósfera y estética.\n";
echo "- Filtro rápido de géneros y selector múltiple avanzado.\n";
echo "- Creación y edición manual de fichas con PDF, EPUB y portada.\n\n";
echo "## Clasificación de las fichas\n\n";
echo "- `books.genre`: géneros literarios, guardados como JSON de texto.\n";
echo "- `book_taxonomy(kind=theme)`: temas y representación.\n";
echo "- `book_taxonomy(kind=audience)`: público o etapa lectora.\n";
echo "- `book_taxonomy(kind=aesthetic)`: estética visual o cultural.\n";
echo "- `review_vibes`: sensaciones subjetivas aportadas por lectores.\n";
echo "- `review_atmosphere`: escalas de ritmo, tensión, oscuridad, calidez, emoción e inmersión.\n\n";
echo "## Conteos de la base de datos\n\n";
foreach ($counts as $table => $count) {
    echo "- `{$table}`: {$count}\n";
}

echo "\n## Esquema SQLite\n\n";
foreach ($tables as $item) {
    $type = (string) ($item['type'] ?? 'objeto');
    $name = (string) ($item['name'] ?? 'sin_nombre');
    $sql = trim((string) ($item['sql'] ?? ''));
    echo "### {$type}: {$name}\n\n";
    if ($sql !== '') {
        echo "```sql\n{$sql};\n```\n\n";
    } else {
        echo "Sin SQL almacenado.\n\n";
    }
}
