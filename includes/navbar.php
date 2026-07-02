<?php
require_once __DIR__ . '/auth.php';
librelulaStartSession();

$currentPage = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
$isLoggedIn = isset($_SESSION['user_id']);
$username = trim((string) ($_SESSION['username'] ?? 'Mi perfil'));
$avatar = trim((string) ($_SESSION['avatar'] ?? ''));

if ($avatar === '' || $avatar === 'default.jpg') {
    $avatar = 'images/avatar/avatar1.png';
}

function navActive(array $pages, string $currentPage): string
{
    return in_array($currentPage, $pages, true) ? ' is-active' : '';
}
?>
<header class="site-header">
  <nav class="site-nav" aria-label="Navegación principal">
    <a class="site-brand" href="index.php" aria-label="Ir al inicio de Librélula">
      <img src="images/librelula-font.png" alt="Librélula">
    </a>

    <button class="site-nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-panel">
      <span></span><span></span><span></span>
      <span class="sr-only">Abrir menú</span>
    </button>

    <div class="site-nav-panel" id="site-nav-panel">
      <div class="site-nav-links">
        <a class="<?= navActive(['index.php', 'index.html'], $currentPage) ?>" href="index.php">Inicio</a>
        <a href="catalogo/">Catálogo</a>
        <?php if ($isLoggedIn): ?>
          <a class="<?= navActive(['perfil.php'], $currentPage) ?>" href="perfil.php">Mi rincón</a>
          <a class="<?= navActive(['biblioteca.php'], $currentPage) ?>" href="biblioteca.php">Mi biblioteca</a>
          <a class="<?= navActive(['mis_resenas.php'], $currentPage) ?>" href="mis_resenas.php">Mis reseñas</a>
        <?php endif; ?>
      </div>

      <div class="site-nav-actions">
        <?php if ($isLoggedIn): ?>
          <div class="user-menu">
            <button class="user-btn" type="button" aria-expanded="false" aria-controls="user-dropdown">
              <img
                src="<?= htmlspecialchars($avatar, ENT_QUOTES, 'UTF-8') ?>"
                alt="Avatar de <?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?>"
                class="user-avatar"
                onerror="this.src='images/avatar/avatar1.png'"
              >
              <span><?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?></span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            <div class="dropdown-menu" id="user-dropdown">
              <a href="perfil.php">Mi rincón</a>
              <a href="biblioteca.php">Mi biblioteca</a>
              <a href="mis_resenas.php">Mis reseñas</a>
              <a href="catalogo/">Explorar catálogo</a>
              <div class="dropdown-divider"></div>
              <a href="logout.php">Cerrar sesión</a>
            </div>
          </div>
        <?php else: ?>
          <a href="login.php" class="btn-signin">Iniciar sesión</a>
        <?php endif; ?>
      </div>
    </div>
  </nav>
</header>

<script>
(() => {
  const navToggle = document.querySelector('.site-nav-toggle');
  const navPanel = document.getElementById('site-nav-panel');
  const userButton = document.querySelector('.user-btn');
  const userDropdown = document.getElementById('user-dropdown');

  navToggle?.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!open));
    navPanel?.classList.toggle('is-open', !open);
  });

  userButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = userButton.getAttribute('aria-expanded') === 'true';
    userButton.setAttribute('aria-expanded', String(!open));
    userDropdown?.classList.toggle('show', !open);
  });

  document.addEventListener('click', (event) => {
    if (userDropdown && !event.target.closest('.user-menu')) {
      userDropdown.classList.remove('show');
      userButton?.setAttribute('aria-expanded', 'false');
    }
  });
})();
</script>
