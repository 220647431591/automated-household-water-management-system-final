<?php
require_once __DIR__ . '/bootstrap.php';

$uid = require_login();
require_csrf_header();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

try {
    $stmt = db()->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$uid]);

    $_SESSION = [];
    session_destroy();

    json_out(['success' => true, 'message' => 'Account deleted']);
} catch (Throwable $e) {
    server_error($e, 'delete_account');
}
