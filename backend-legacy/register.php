<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$email    = post('email');
$password = post('password');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['success' => false, 'message' => 'Invalid email address']);
}
if (strlen($password) < 8) {
    json_out(['success' => false, 'message' => 'Password must be at least 8 characters']);
}
if (strlen($email) > 100) {
    json_out(['success' => false, 'message' => 'Email is too long']);
}

try {
    $exists = db()->prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1');
    $exists->execute([$email]);
    if ($exists->fetch()) {
        json_out(['success' => false, 'message' => 'An account with this email already exists']);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $ins  = db()->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $ins->execute([$email, $hash]);

    json_out(['success' => true, 'message' => 'Account created']);
} catch (Throwable $e) {
    server_error($e, 'register');
}
