<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';
librelulaStartSession();

if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$userId = (int) $_SESSION['user_id'];
$allowedFilters = ['all', 'reading', 'rereading', 'paused', 'completed', 'planned', 'dropped'];
$filter = (string) ($_GET['estado'] ?? 'all');
if (!in_array($filter, $allowedFilters, true)) {
    $filter = 'all';
}

$sql = "\n    SELECT b.id, b.title, b.author, b.cover, b.genre, b.year,\n           ub.status, ub.score, ub.progress, ub.notes, ub.started_at, ub.finished_at\n    FROM user_books ub\n    INNER JOIN books b ON b.id = ub.book_id\n    WHERE ub.user_id = :user_id\n";
$params = [':user_id' => $userId];

if ($filter !== 'all') {
    $sql .= ' AND ub.status = :status';
    $params[':status'] = $filter;
}

$sql .= ' ORDER BY ub.rowid DESC';
$stmt = $db->prepare($sql);
$stmt->execute($params);
$books = $stmt->fetchAll(PDO::FETCH_ASSOC);

$countStmt = $db->prepare("\n    SELECT status, COUNT(*) AS amount\n    FROM user_books\n    WHERE user_id = :user_id\n    GROUP BY status\n");
$countStmt->execute([':user_id' => $userId]);
$counts = ['all' => 0, 'reading' => 0, 'rereading' => 0, 'paused' => 0, 'completed' => 0, 'planned' => 0, 'dropped' => 0];
foreach ($countStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $counts[(string) $row['status']] = (int) $row['amount'];
    $counts['all'] += (int) $row['amount'];
}

function libraryStatus(string $status): array
{
    return match ($status) {
        'completed' => ['Leído', 'is-completed'],
        'reading' => ['Leyendo', 'is-reading'],
        'rereading' => ['Releyendo', 'is-rereading'],
        'paused' => ['Pausado', 'is-paused'],
        'planned' => ['Pendiente', 'is-planned'],
        'dropped' => ['Abandonado', 'is-dropped'],
        default => ['Sin estado', ''],
    };
}

function libraryCover(?string $cover): string
{
    $cover = trim((string) $cover);
    return $cover === '' ? '' : ltrim($cover, '/');
}

$filterLabels = [
    'all' => 'Todos',
    'reading' => 'Leyendo',
    'rereading' => 'Releyendo',
    'paused' => 'Pausados',
    'completed' => 'Leídos',
    'planned' => 'Pendientes',
    'dropped' => 'Abandonados',
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mi biblioteca — Librélula</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Crimson+Pro:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="images/librelula.png">
  <link rel="stylesheet" href="css/nav.css">
  <link rel="stylesheet" href="css/perfil.css">
</head>
<body>

<?php include __DIR__ . '/includes/navbar.php'; ?>

<main class="library-page">
  <header class="library-header">
    <div>
      <span class="profile-kicker">Colección personal</span>
      <h1>Mi biblioteca</h1>
      <p>Organiza tus lecturas y vuelve rápidamente a la ficha de cada libro.</p>
    </div>
    <a class="profile-button primary" href="catalogo/">Añadir desde el catálogo</a>
  </header>

  <nav class="library-filters" aria-label="Filtrar biblioteca">
    <?php foreach ($filterLabels as $key => $label): ?>
      <a class="<?= $filter === $key ? 'is-active' : '' ?>" href="biblioteca.php?estado=<?= rawurlencode($key) ?>">
        <?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?>
        <span><?= (int) ($counts[$key] ?? 0) ?></span>
      </a>
    <?php endforeach; ?>
  </nav>

  <?php if ($books): ?>
    <section class="library-grid">
      <?php foreach ($books as $book): ?>
        <?php [$statusLabel, $statusClass] = libraryStatus((string) $book['status']); ?>
        <?php $cover = libraryCover($book['cover'] ?? ''); ?>
        <article class="library-card">
          <a class="library-cover" href="catalogo/?book=<?= rawurlencode((string) $book['id']) ?>">
            <?php if ($cover !== ''): ?>
              <img src="<?= htmlspecialchars($cover, ENT_QUOTES, 'UTF-8') ?>" alt="Portada de <?= htmlspecialchars((string) $book['title'], ENT_QUOTES, 'UTF-8') ?>" loading="lazy">
            <?php else: ?>
              <span>📖</span>
            <?php endif; ?>
          </a>
          <div class="library-card-body">
            <span class="status-pill <?= htmlspecialchars($statusClass, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($statusLabel, ENT_QUOTES, 'UTF-8') ?></span>
            <h2><?= htmlspecialchars((string) $book['title'], ENT_QUOTES, 'UTF-8') ?></h2>
            <p class="library-author"><?= htmlspecialchars((string) $book['author'], ENT_QUOTES, 'UTF-8') ?></p>

            <?php if (in_array((string) $book['status'], ['reading', 'rereading', 'paused'], true)): ?>
              <div class="progress-label"><span>Progreso</span><strong><?= (int) ($book['progress'] ?? 0) ?>%</strong></div>
              <div class="progress-track"><span style="width: <?= max(0, min(100, (int) ($book['progress'] ?? 0))) ?>%"></span></div>
            <?php endif; ?>

            <?php if (!empty($book['score'])): ?>
              <p class="library-score" aria-label="Puntuación: <?= (int) $book['score'] ?> de 5"><?= str_repeat('★', (int) $book['score']) ?><span><?= str_repeat('☆', 5 - (int) $book['score']) ?></span></p>
            <?php endif; ?>

            <?php if (!empty($book['notes'])): ?>
              <p class="library-notes"><?= htmlspecialchars(mb_strimwidth((string) $book['notes'], 0, 130, '…'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php endif; ?>

            <a class="panel-link" href="catalogo/?book=<?= rawurlencode((string) $book['id']) ?>">Abrir ficha técnica →</a>
          </div>
        </article>
      <?php endforeach; ?>
    </section>
  <?php else: ?>
    <section class="profile-empty library-empty">
      <span>📚</span>
      <h2>No hay libros en esta sección</h2>
      <p><?= $filter === 'all' ? 'Explora el catálogo y añade tu primera lectura.' : 'Prueba con otro filtro o cambia el estado de un libro desde su ficha.' ?></p>
      <a class="profile-button primary" href="catalogo/">Explorar catálogo</a>
    </section>
  <?php endif; ?>
</main>

</body>
</html>
