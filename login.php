<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/auth.php';
librelulaStartSession();

if (isset($_SESSION['user_id'])) {
    header("Location: perfil.php");
    exit;
}


$message     = "";
$activePanel = "login";

// Protege los formularios de acceso y registro frente a peticiones externas.
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $providedCsrf = (string) ($_POST["_csrf"] ?? "");

    if (!hash_equals(librelulaCsrfToken(), $providedCsrf)) {
        $message = "La sesión ha caducado. Recarga la página e inténtalo de nuevo.";
        $activePanel = ($_POST["action"] ?? "login") === "register" ? "signup" : "login";
    }
}

// ── REGISTRO ──────────────────────────────────────────────────────────────────
if ($_SERVER["REQUEST_METHOD"] === "POST" && $message === "" && isset($_POST["action"]) && $_POST["action"] === "register") {
    $activePanel = "signup";
    $username    = trim($_POST["username"] ?? "");
    $email       = trim($_POST["email"] ?? "");
    $password    = trim($_POST["password"] ?? "");
    $password2   = trim($_POST["password2"] ?? "");

    if (empty($username) || empty($email) || empty($password)) {
        $message = "Completa todos los campos.";
    } elseif ($password !== $password2) {
        $message = "Las contraseñas no coinciden.";
    } else {
        $checkEmail = $db->prepare("SELECT id FROM users WHERE email = :email");
        $checkEmail->execute([":email" => $email]);

        $checkUser = $db->prepare("SELECT id FROM users WHERE username = :username");
        $checkUser->execute([":username" => $username]);

        if ($checkEmail->fetch()) {
            $message = "Ese correo ya está registrado.";
        } elseif ($checkUser->fetch()) {
            $message = "Ese nombre de usuario ya está en uso.";
        } else {
            $avatarNumber   = rand(1, 6);
            $avatar         = "images/avatar/avatar" . $avatarNumber . ".png";
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

            $query = $db->prepare("
                INSERT INTO users (username, email, password, avatar)
                VALUES (:username, :email, :password, :avatar)
            ");
            $query->execute([
                ":username" => $username,
                ":email"    => $email,
                ":password" => $hashedPassword,
                ":avatar"   => $avatar,
            ]);

            $newUser = $db->prepare("SELECT id, username, avatar, bio FROM users WHERE email = :email");
            $newUser->execute([":email" => $email]);
            $user = $newUser->fetch(PDO::FETCH_ASSOC);

            $_SESSION['user_id']  = $user['id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['avatar']   = $user['avatar'] ?: 'images/default-avatar.png';
            $_SESSION['bio']      = $user['bio'];

            session_regenerate_id(true);
            librelulaCsrfToken();

            header("Location: perfil.php");
            exit;
        }
    }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
if ($_SERVER["REQUEST_METHOD"] === "POST" && $message === "" && isset($_POST["action"]) && $_POST["action"] === "login") {
    $activePanel = "login";
    $email       = trim($_POST["email"] ?? "");
    $password    = trim($_POST["password"] ?? "");

    if (empty($email) || empty($password)) {
        $message = "Completa todos los campos.";
    } else {
        $query = $db->prepare("
            SELECT id, username, password, avatar, bio
            FROM users
            WHERE email = :email
            LIMIT 1
        ");
        $query->execute([":email" => $email]);
        $user = $query->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password'])) {
            $_SESSION['user_id']  = $user['id'];
            $_SESSION['username'] = $user['username'];
            $_SESSION['avatar']   = $user['avatar'] ?: 'images/default-avatar.png';
            $_SESSION['bio']      = $user['bio'];

            session_regenerate_id(true);
            librelulaCsrfToken();

            header("Location: perfil.php");
            exit;
        } else {
            $message = "Correo o contraseña incorrectos.";
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceder — Librélula</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Crimson+Pro:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/login.css">
  <style>
    .lg-panel { display: none; }
    .lg-panel.active { display: block; }
    .lg-error {
      background: #fdf0ec;
      border: 0.5px solid #f0c4b0;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #7a3a1e;
      margin-bottom: 1rem;
    }
    .lg-switch {
      text-align: center;
      font-size: 13px;
      color: #8b7355;
      margin-top: 1rem;
    }
    .lg-switch a {
      color: #3a2e1e;
      font-weight: 700;
      cursor: pointer;
      text-decoration: underline;
    }
  </style>
</head>
<body>
<div class="lg-wrap">

  <!-- IZQUIERDA -->
  <div class="lg-left">
    <img src="images/fondo.png" alt="Librería acogedora" class="lg-image">
    <div class="lg-overlay"></div>
    <div class="lg-brand">
      <div class="lg-brand-title">Librélula</div>
      <div class="lg-brand-sub">Lectura · Historias · Imaginación</div>
    </div>
  </div>

  <!-- DERECHA -->
  <div class="lg-right">

    <div class="lg-tabs">
      <button class="lg-tab <?= $activePanel === 'login'  ? 'active' : '' ?>" onclick="showPanel('login', this)">Iniciar sesión</button>
      <button class="lg-tab <?= $activePanel === 'signup' ? 'active' : '' ?>" onclick="showPanel('signup', this)">Registrarse</button>
    </div>

    <?php if (!empty($message)): ?>
      <div class="lg-error"><?= htmlspecialchars($message) ?></div>
    <?php endif; ?>

    <!-- Panel Login -->
    <div id="panel-login" class="lg-panel <?= $activePanel === 'login' ? 'active' : '' ?>">
      <div class="lg-title">Bienvenida de <em>vuelta</em></div>
      <div class="lg-sub">Tu rincón literario te espera</div>

      <form method="POST" action="login.php">
        <input type="hidden" name="action" value="login">
        <input type="hidden" name="_csrf" value="<?= htmlspecialchars(librelulaCsrfToken(), ENT_QUOTES, 'UTF-8') ?>">
        <div class="lg-fields">
          <div class="lg-field">
            <label for="login-email">Correo electrónico</label>
            <input type="email" id="login-email" name="email" placeholder="tu@correo.com" required>
          </div>
          <div class="lg-field">
            <label for="login-pass">Contraseña</label>
            <input type="password" id="login-pass" name="password" placeholder="••••••••" required>
          </div>
        </div>
        <div class="lg-check">
          <input type="checkbox" id="remember">
          <label for="remember">Recordarme · <a href="#">¿Olvidaste tu contraseña?</a></label>
        </div>
        <button type="submit" class="lg-btn">Entrar a mi rincón</button>
      </form>

      <div class="lg-switch">
        ¿No tienes cuenta?
        <a href="#" onclick="showPanel('signup', document.querySelectorAll('.lg-tab')[1]); return false;">Regístrate</a>
      </div>
    </div>

    <!-- Panel Signup -->
    <div id="panel-signup" class="lg-panel <?= $activePanel === 'signup' ? 'active' : '' ?>">
      <div class="lg-title">Únete a <em>Librélula</em></div>
      <div class="lg-sub">Empieza tu aventura literaria hoy</div>

      <form method="POST" action="login.php">
        <input type="hidden" name="action" value="register">
        <input type="hidden" name="_csrf" value="<?= htmlspecialchars(librelulaCsrfToken(), ENT_QUOTES, 'UTF-8') ?>">
        <div class="lg-fields">
          <div class="lg-field">
            <label for="signup-username">Nombre de usuario</label>
            <input type="text" id="signup-username" name="username" placeholder="lectora_feliz" required>
          </div>
          <div class="lg-field">
            <label for="signup-email">Correo electrónico</label>
            <input type="email" id="signup-email" name="email" placeholder="tu@correo.com" required>
          </div>
          <div class="lg-row">
            <div class="lg-field">
              <label for="signup-pass">Contraseña</label>
              <input type="password" id="signup-pass" name="password" placeholder="••••••••" required>
            </div>
            <div class="lg-field">
              <label for="signup-pass2">Confirmar</label>
              <input type="password" id="signup-pass2" name="password2" placeholder="••••••••" required>
            </div>
          </div>
        </div>
        <div class="lg-check">
          <input type="checkbox" id="terms" required>
          <label for="terms">Acepto los <a href="#">términos</a> y la <a href="#">privacidad</a></label>
        </div>
        <button type="submit" class="lg-btn">Crear mi cuenta</button>
      </form>

      <div class="lg-switch">
        ¿Ya tienes cuenta?
        <a href="#" onclick="showPanel('login', document.querySelectorAll('.lg-tab')[0]); return false;">Inicia sesión</a>
      </div>
    </div>

  </div>
</div>

<script>
  function showPanel(id, tab) {
    document.querySelectorAll('.lg-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.lg-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('panel-' + id).classList.add('active');
    if (tab) tab.classList.add('active');
  }
</script>
</body>
</html>
