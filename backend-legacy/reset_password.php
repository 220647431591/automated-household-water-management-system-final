<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

if (!rate_limit('reset:' . client_ip(), 10, 600)) {
    json_out(['success' => false, 'message' => 'Too many requests, try again later'], 429);
}

$token       = post('token');
$newPassword = post('password');

if ($token === '' || strlen($token) < 32) {
    json_out(['success' => false, 'message' => 'Invalid or missing reset token']);
}

// Password strength — must match frontend zod schema.
if (
    strlen($newPassword) < 8 ||
    !preg_match('/[A-Z]/', $newPassword) ||
    !preg_match('/[a-z]/', $newPassword) ||
    !preg_match('/\d/', $newPassword)
) {
    json_out([
        'success' => false,
        'message' => 'Password must be 8+ chars with upper, lower, and a number',
    ]);
}

try {
    $stmt = db()->prepare(
        'SELECT id, reset_expires FROM users WHERE reset_token = ? LIMIT 1'
    );
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        json_out(['success' => false, 'message' => 'Invalid or expired reset token']);
    }
    if (empty($user['reset_expires']) || strtotime($user['reset_expires']) < time()) {
        json_out(['success' => false, 'message' => 'This reset link has expired']);
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);

    // Invalidate the token immediately after use.
    $upd = db()->prepare(
        'UPDATE users
            SET password_hash = ?, reset_token = NULL, reset_expires = NULL
          WHERE id = ?'
    );
    $upd->execute([$hash, $user['id']]);

    json_out(['success' => true, 'message' => 'Password updated. You can now sign in.']);
} catch (Throwable $e) {
    server_error($e, 'reset_password');
}
