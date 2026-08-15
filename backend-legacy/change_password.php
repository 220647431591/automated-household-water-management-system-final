<?php
require_once __DIR__ . '/bootstrap.php';

$uid = require_login();
require_csrf_header();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$oldPassword = post('oldPassword');
$newPassword = post('newPassword');

if (strlen($newPassword) < 8) {
    json_out(['success' => false, 'message' => 'New password must be at least 8 characters']);
}

try {
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($oldPassword, $row['password_hash'])) {
        json_out(['success' => false, 'message' => 'Current password is incorrect']);
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);
    $upd  = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $upd->execute([$hash, $uid]);

    json_out(['success' => true, 'message' => 'Password updated']);
} catch (Throwable $e) {
    server_error($e, 'change_password');
}
