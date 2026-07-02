<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';
librelulaStartSession();

$bookCount = 0;
$authorCount = 0;
$readerCount = 0;
$recentBooks = [];

try {
    $bookCount = (int) $db->query('SELECT COUNT(*) FROM books')->fetchColumn();
    $authorCount = (int) $db->query("SELECT COUNT(DISTINCT author) FROM books WHERE TRIM(COALESCE(author, '')) <> ''")->fetchColumn();
    $readerCount = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $recentBooks = $db->query('
        SELECT id, title, author, cover, genre, year
        FROM books
        ORDER BY datetime(created_at) DESC, rowid DESC
        LIMIT 4
    ')->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException) {
    // La portada sigue siendo utilizable aunque las estadísticas no estén disponibles.
}

function homeCover(string $cover): string
{
    $cover = trim($cover);

    if ($cover === '') {
        return '';
    }

    if (preg_match('~^https?://~i', $cover)) {
        return $cover;
    }

    $normalized = ltrim(
        str_replace('\\', '/', $cover),
        '/'
    );

    if (str_starts_with($normalized, 'librelula/')) {
        $normalized = substr(
            $normalized,
            strlen('librelula/')
        );
    }

    return $normalized;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Librélula: un catálogo de libros con fichas técnicas, PDF, EPUB y biblioteca personal.">
  <title>Librélula — Tu rincón de lectura</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Crimson+Pro:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="images/librelula.png">
  <link rel="stylesheet" href="css/nav.css">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>

<?php include __DIR__ . '/includes/navbar.php'; ?>

<main>
  <section class="home-hero">
    <div class="home-hero-copy">
      <span class="eyebrow">Tu biblioteca virtual</span>
      <h1>Historias para leer,<br><em>guardar y compartir.</em></h1>
      <p>
        Explora el catálogo de Librélula, consulta fichas técnicas y organiza
        tus próximas lecturas en un único rincón.
      </p>

      <form class="home-search" action="catalogo/" method="get">
        <label class="sr-only" for="home-search">Buscar libros</label>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-search" name="q" type="search" placeholder="Busca por título, autor o género">
        <button type="submit">Buscar</button>
      </form>

      <div class="home-actions">
        <a class="button button-primary" href="catalogo/">Explorar catálogo</a>
        <?php if (isset($_SESSION['user_id'])): ?>
          <a class="button button-secondary" href="perfil.php">Ir a mi rincón</a>
        <?php else: ?>
          <a class="button button-secondary" href="login.php">Crear mi biblioteca</a>
        <?php endif; ?>
      </div>

      <dl class="home-stats" aria-label="Estadísticas de Librélula">
        <div><dt><?= number_format($bookCount, 0, ',', '.') ?></dt><dd>libros</dd></div>
        <div><dt><?= number_format($authorCount, 0, ',', '.') ?></dt><dd>autores</dd></div>
        <div><dt><?= number_format($readerCount, 0, ',', '.') ?></dt><dd>lectores</dd></div>
      </dl>
    </div>

    <div class="home-hero-art" aria-hidden="true">
      <div class="hero-art-frame">
        <img src="images/fondo.png" alt="">
      </div>
      <div class="hero-note">
        <span>Lecturas con calma</span>
        <strong>Tu próxima historia está cerca.</strong>
      </div>
    </div>
  </section>

  <section class="home-section" aria-labelledby="latest-title">
    <div class="section-heading">
      <div>
        <span class="eyebrow">Recién añadidos</span>
        <h2 id="latest-title">Un vistazo al catálogo</h2>
      </div>
      <a class="text-link" href="catalogo/">Ver todos los libros →</a>
    </div>

    <?php if ($recentBooks): ?>
      <div class="home-books">
        <?php foreach ($recentBooks as $book): ?>
          <?php $cover = homeCover((string) ($book['cover'] ?? '')); ?>
          <a class="home-book" href="catalogo/?q=<?= rawurlencode((string) $book['title']) ?>">
            <div class="home-book-cover">
              <?php if ($cover !== ''): ?>
                <img src="<?= htmlspecialchars($cover, ENT_QUOTES, 'UTF-8') ?>" alt="Portada de <?= htmlspecialchars((string) $book['title'], ENT_QUOTES, 'UTF-8') ?>" loading="lazy">
              <?php else: ?>
                <span>📖</span>
              <?php endif; ?>
            </div>
            <div>
              <h3><?= htmlspecialchars((string) $book['title'], ENT_QUOTES, 'UTF-8') ?></h3>
              <p><?= htmlspecialchars((string) $book['author'], ENT_QUOTES, 'UTF-8') ?></p>
              <?php if (!empty($book['genre'])): ?>
                <small><?= htmlspecialchars((string) $book['genre'], ENT_QUOTES, 'UTF-8') ?></small>
              <?php endif; ?>
            </div>
          </a>
        <?php endforeach; ?>
      </div>
    <?php else: ?>
      <div class="empty-panel">
        <strong>El catálogo está preparado.</strong>
        <p>Añade el primer libro desde la zona de administración.</p>
      </div>
    <?php endif; ?>
  </section>

  <section class="home-benefits" aria-label="Qué puedes hacer en Librélula">
    <article>
      <span class="benefit-icon">01</span>
      <h2>Explora</h2>
      <p>Busca por título, autor o género y abre una ficha con todos los datos disponibles.</p>
    </article>
    <article>
      <span class="benefit-icon">02</span>
      <h2>Organiza</h2>
      <p>Marca libros como pendientes, en lectura o terminados desde tu biblioteca personal.</p>
    </article>
    <article>
      <span class="benefit-icon">03</span>
      <h2>Lee</h2>
      <p>Accede a los archivos PDF y EPUB disponibles directamente desde cada libro.</p>
    </article>
  </section>
</main>

<footer class="site-footer">
  <img src="images/librelula-font.png" alt="Librélula">
  <p>Un rincón para historias que merecen quedarse.</p>
  <a href="catalogo/">Abrir catálogo</a>
</footer>

</body>
</html>
