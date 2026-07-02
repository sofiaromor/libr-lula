<?php

declare(strict_types=1);

function librelulaIsHttps(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }

    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function librelulaStartSession(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => librelulaIsHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}

function librelulaCurrentUserId(): ?int
{
    librelulaStartSession();

    if (!isset($_SESSION['user_id']) || !is_numeric($_SESSION['user_id'])) {
        return null;
    }

    $userId = (int) $_SESSION['user_id'];

    return $userId > 0 ? $userId : null;
}

function librelulaCsrfToken(): string
{
    librelulaStartSession();

    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function librelulaJsonError(string $message, int $status): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    echo json_encode(
        ['error' => $message],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

function librelulaIsAdmin(PDO $db): bool
{
    $userId = librelulaCurrentUserId();

    if ($userId === null) {
        return false;
    }

    try {
        $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);

        return (int) $stmt->fetchColumn() === 1;
    } catch (PDOException) {
        return false;
    }
}

function librelulaRequireLogin(PDO $db): int
{
    unset($db);

    $userId = librelulaCurrentUserId();

    if ($userId === null) {
        librelulaJsonError('Debes iniciar sesión para realizar esta acción.', 401);
    }

    return $userId;
}

function librelulaRequireAdmin(PDO $db): int
{
    $userId = librelulaRequireLogin($db);

    if (!librelulaIsAdmin($db)) {
        librelulaJsonError('No tienes permiso para editar el catálogo.', 403);
    }

    return $userId;
}

function librelulaVerifyCsrf(): void
{
    librelulaStartSession();

    $provided = trim((string) (
        $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $_POST['_csrf']
        ?? ''
    ));

    $expected = (string) ($_SESSION['csrf_token'] ?? '');

    if ($provided === '' || $expected === '' || !hash_equals($expected, $provided)) {
        librelulaJsonError('La sesión ha caducado o la petición no es válida. Recarga la página.', 419);
    }
}
