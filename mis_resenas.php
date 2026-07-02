<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';
librelulaStartSession();

if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$userId = (int) $_SESSION['user_id'];
$csrfToken = librelulaCsrfToken();

function reviewsEscape(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function reviewsAsset(?string $path): string
{
    $path = trim((string) $path);

    if ($path === '') {
        return '';
    }

    if (preg_match('~^(?:https?:)?//|^data:~i', $path)) {
        return $path;
    }

    $normalized = ltrim(str_replace('\\', '/', $path), '/');
    $normalized = preg_replace('~^(?:\./|\.\./)*(?:librelula/)+~i', '', $normalized) ?? $normalized;

    return $normalized;
}

function reviewsDate(?string $value): string
{
    $value = trim((string) $value);

    if ($value === '') {
        return 'Sin fecha';
    }

    try {
        $date = new DateTimeImmutable($value);
        return $date->format('d/m/Y');
    } catch (Throwable) {
        return 'Sin fecha';
    }
}

function reviewsTextLength(string $value): int
{
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function reviewsStars(?int $score): string
{
    if ($score === null || $score < 1 || $score > 5) {
        return '<span class="reviews-unrated">Sin puntuar</span>';
    }

    $filled = str_repeat('★', $score);
    $empty = str_repeat('☆', 5 - $score);

    return sprintf(
        '<span class="reviews-stars" aria-label="%1$d de 5 estrellas"><strong>%2$s</strong><span>%3$s</span></span>',
        $score,
        $filled,
        $empty
    );
}

$stmt = $db->prepare(<<<'SQL'
    SELECT
        b.id,
        b.title,
        b.author,
        b.cover,
        b.genre,
        ub.status,
        ub.score,
        ub.notes,
        ub.started_at,
        ub.finished_at
    FROM user_books ub
    INNER JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = :user_id
      AND (
          ub.status = 'completed'
          OR ub.score BETWEEN 1 AND 5
          OR TRIM(COALESCE(ub.notes, '')) <> ''
      )
    ORDER BY
        COALESCE(ub.finished_at, ub.started_at, '0000-00-00') DESC,
        ub.rowid DESC
SQL);
$stmt->execute([':user_id' => $userId]);
$reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);

$statsStmt = $db->prepare(<<<'SQL'
    SELECT
        SUM(CASE WHEN score BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS total_ratings,
        SUM(CASE WHEN TRIM(COALESCE(notes, '')) <> '' THEN 1 ELSE 0 END) AS total_reviews,
        ROUND(AVG(CASE WHEN score BETWEEN 1 AND 5 THEN score END), 1) AS avg_rating
    FROM user_books
    WHERE user_id = :user_id
SQL);
$statsStmt->execute([':user_id' => $userId]);
$stats = $statsStmt->fetch(PDO::FETCH_ASSOC) ?: [];

$totalRatings = (int) ($stats['total_ratings'] ?? 0);
$totalReviews = (int) ($stats['total_reviews'] ?? 0);
$averageRating = $stats['avg_rating'] === null ? null : (float) $stats['avg_rating'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mis reseñas — Librélula</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Crimson+Pro:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="icon" type="image/png" href="images/librelula.png">
  <link rel="stylesheet" href="css/nav.css">
  <link rel="stylesheet" href="css/resenas.css">
</head>
<body>

<?php include __DIR__ . '/includes/navbar.php'; ?>

<main class="reviews-page">
  <header class="reviews-hero">
    <div>
      <span class="reviews-kicker">Diario de lecturas</span>
      <h1>Mis reseñas</h1>
      <p>Escribe, consulta y modifica tus valoraciones. Los libros terminados pendientes de reseña también aparecen aquí.</p>
    </div>
    <a class="reviews-primary-button" href="catalogo/">Explorar catálogo</a>
  </header>

  <section class="reviews-summary" aria-label="Resumen de reseñas">
    <article>
      <strong><?= $totalReviews ?></strong>
      <span><?= $totalReviews === 1 ? 'reseña escrita' : 'reseñas escritas' ?></span>
    </article>
    <article>
      <strong><?= $totalRatings ?></strong>
      <span><?= $totalRatings === 1 ? 'libro puntuado' : 'libros puntuados' ?></span>
    </article>
    <article>
      <strong><?= $averageRating === null ? '—' : number_format($averageRating, 1, ',', '') ?></strong>
      <span>media personal</span>
    </article>
  </section>

  <?php if ($reviews !== []): ?>
    <section class="reviews-list" aria-label="Tus reseñas">
      <?php foreach ($reviews as $review): ?>
        <?php
          $cover = reviewsAsset($review['cover'] ?? null);
          $score = $review['score'] === null ? null : (int) $review['score'];
          $reviewText = trim((string) ($review['notes'] ?? ''));
          $reviewDate = $review['finished_at'] ?: $review['started_at'];
          $hasWrittenReview = $reviewText !== '';
          $editLabel = $hasWrittenReview
              ? 'Editar reseña'
              : ($score !== null ? 'Añadir reseña' : 'Escribir reseña');
        ?>
        <article class="review-card" data-review-card>
          <a
            class="review-cover"
            href="catalogo/?book=<?= rawurlencode((string) $review['id']) ?>"
            aria-label="Abrir la ficha de <?= reviewsEscape($review['title']) ?>"
          >
            <?php if ($cover !== ''): ?>
              <img
                src="<?= reviewsEscape($cover) ?>"
                alt="Portada de <?= reviewsEscape($review['title']) ?>"
                loading="lazy"
                onerror="this.remove()"
              >
            <?php else: ?>
              <span aria-hidden="true">📖</span>
            <?php endif; ?>
          </a>

          <div class="review-card-copy">
            <div class="review-card-topline">
              <span>Tu valoración</span>
              <time datetime="<?= reviewsEscape((string) $reviewDate) ?>"><?= reviewsEscape(reviewsDate($reviewDate)) ?></time>
            </div>

            <h2>
              <a href="catalogo/?book=<?= rawurlencode((string) $review['id']) ?>">
                <?= reviewsEscape($review['title']) ?>
              </a>
            </h2>
            <p class="review-author"><?= reviewsEscape($review['author']) ?></p>

            <div class="review-current-content">
              <?= reviewsStars($score) ?>

              <?php if ($hasWrittenReview): ?>
                <blockquote><?= nl2br(reviewsEscape($reviewText)) ?></blockquote>
              <?php else: ?>
                <p class="review-empty-copy">Todavía no has escrito una reseña para este libro.</p>
              <?php endif; ?>

              <div class="review-card-links">
                <button type="button" class="review-edit-button" data-review-edit>
                  <?= reviewsEscape($editLabel) ?>
                </button>
                <a class="review-detail-link" href="catalogo/?book=<?= rawurlencode((string) $review['id']) ?>">
                  Ver ficha y comunidad →
                </a>
              </div>
            </div>

            <form
              class="review-inline-form"
              data-review-form
              data-book-id="<?= reviewsEscape((string) $review['id']) ?>"
              hidden
            >
              <fieldset>
                <legend>Tu puntuación</legend>
                <div class="review-inline-stars" data-star-picker>
                  <?php for ($star = 1; $star <= 5; $star++): ?>
                    <button
                      type="button"
                      data-score="<?= $star ?>"
                      class="<?= $score !== null && $star <= $score ? 'is-selected' : '' ?>"
                      aria-label="<?= $star ?> de 5 estrellas"
                    >★</button>
                  <?php endfor; ?>
                  <span data-score-label><?= $score === null ? 'Sin puntuar' : $score . ' de 5' ?></span>
                </div>
                <input type="hidden" name="score" value="<?= $score === null ? '' : $score ?>">
                <button type="button" class="review-remove-score" data-clear-score <?= $score === null ? 'hidden' : '' ?>>
                  Quitar puntuación
                </button>
              </fieldset>

              <label>
                <span>Tu reseña</span>
                <textarea
                  name="review"
                  rows="7"
                  maxlength="5000"
                  placeholder="¿Qué te ha parecido este libro?"
                ><?= reviewsEscape($reviewText) ?></textarea>
                <small><span data-review-count><?= reviewsTextLength($reviewText) ?></span> / 5.000</small>
              </label>

              <p class="review-inline-feedback" data-review-feedback hidden></p>

              <div class="review-inline-actions">
                <button type="button" class="review-inline-cancel" data-review-cancel>Cancelar</button>
                <button type="submit" class="review-inline-save">Guardar cambios</button>
              </div>
            </form>
          </div>
        </article>
      <?php endforeach; ?>
    </section>
  <?php else: ?>
    <section class="reviews-empty">
      <span aria-hidden="true">✍️</span>
      <h2>Todavía no tienes libros para reseñar</h2>
      <p>Cuando termines, puntúes o reseñes un libro, aparecerá aquí automáticamente.</p>
      <a class="reviews-primary-button" href="catalogo/">Buscar un libro</a>
    </section>
  <?php endif; ?>
</main>

<script>
(() => {
  const csrfToken = <?= json_encode($csrfToken, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;

  function setFeedback(element, message, type = 'error') {
    element.textContent = message;
    element.className = `review-inline-feedback is-${type}`;
    element.hidden = false;
  }

  document.querySelectorAll('[data-review-card]').forEach((card) => {
    const editButton = card.querySelector('[data-review-edit]');
    const form = card.querySelector('[data-review-form]');
    const cancelButton = form.querySelector('[data-review-cancel]');
    const scoreInput = form.querySelector('input[name="score"]');
    const scoreButtons = [...form.querySelectorAll('[data-score]')];
    const scoreLabel = form.querySelector('[data-score-label]');
    const clearScore = form.querySelector('[data-clear-score]');
    const textarea = form.querySelector('textarea[name="review"]');
    const counter = form.querySelector('[data-review-count]');
    const feedback = form.querySelector('[data-review-feedback]');
    const saveButton = form.querySelector('.review-inline-save');
    const initialScore = scoreInput.value;
    const initialReview = textarea.value;

    function paintScore(value) {
      const numeric = value === '' ? null : Number(value);
      scoreInput.value = numeric === null ? '' : String(numeric);
      scoreButtons.forEach((button) => {
        button.classList.toggle(
          'is-selected',
          numeric !== null && Number(button.dataset.score) <= numeric,
        );
      });
      scoreLabel.textContent = numeric === null ? 'Sin puntuar' : `${numeric} de 5`;
      clearScore.hidden = numeric === null;
    }

    function closeEditor() {
      paintScore(initialScore);
      textarea.value = initialReview;
      counter.textContent = String(initialReview.length);
      feedback.hidden = true;
      form.hidden = true;
      editButton.focus();
    }

    editButton.addEventListener('click', () => {
      form.hidden = false;
      feedback.hidden = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      textarea.focus();
    });

    cancelButton.addEventListener('click', closeEditor);

    scoreButtons.forEach((button) => {
      button.addEventListener('click', () => paintScore(button.dataset.score || ''));
    });

    clearScore.addEventListener('click', () => paintScore(''));

    textarea.addEventListener('input', () => {
      counter.textContent = textarea.value.length.toLocaleString('es-ES');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const review = textarea.value.trim();
      const score = scoreInput.value === '' ? null : Number(scoreInput.value);

      if (score === null && review === '') {
        setFeedback(feedback, 'Añade una puntuación o escribe una reseña antes de guardar.');
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = 'Guardando…';
      feedback.hidden = true;

      try {
        const response = await fetch('API/book_reviews.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({
            book_id: form.dataset.bookId,
            score,
            review,
          }),
        });
        const text = await response.text();
        let data = {};

        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error('El servidor no devolvió una respuesta válida.');
        }

        if (!response.ok || data.error) {
          throw new Error(data.error || 'No se pudo guardar la reseña.');
        }

        setFeedback(feedback, data.message || 'Reseña guardada.', 'success');
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        setFeedback(
          feedback,
          error instanceof Error ? error.message : 'No se pudo guardar la reseña.',
        );
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Guardar cambios';
      }
    });
  });
})();
</script>

</body>
</html>
