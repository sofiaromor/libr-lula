<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    librelulaJsonError('Método no permitido.', 405);
}

librelulaStartSession();

$userId = librelulaCurrentUserId();
$user = null;

if ($userId !== null) {
    $stmt = $db->prepare('
        SELECT id, username, email, avatar, bio, is_admin
        FROM users
        WHERE id = :id
        LIMIT 1
    ');
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch() ?: null;

    if ($user === null) {
        $_SESSION = [];
        session_regenerate_id(true);
        $userId = null;
    }
}

echo json_encode([
    'authenticated' => $userId !== null,
    'is_admin' => $user !== null && (int) $user['is_admin'] === 1,
    'user' => $user === null ? null : [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'avatar' => $user['avatar'],
        'bio' => $user['bio'],
    ],
    'csrf_token' => $userId !== null ? librelulaCsrfToken() : null,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
