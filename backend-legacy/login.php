<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$email    = strtolower(post('email'));
$password = post('password');

if ($email === '' || $password === '') {
    json_out(['success' => false, 'message' => 'Email and password are required']);
}

// Rate-limit by IP + email (10 tries / 5 minutes).
$bucket = 'login:' . client_ip() . ':' . $email;
if (!rate_limit($bucket, 10, 300)) {
    json_out(['success' => false, 'message' => 'Too many attempts. Try again in a few minutes.'], 429);
}

try {
    $stmt = db()->prepare('SELECT id, email, password_hash, name FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        // Constant-ish delay to reduce timing signal.
        usleep(200000);
        json_out(['success' => false, 'message' => 'Invalid email or password']);
    }

    // Rehash if the algorithm/cost has moved on.
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        $rehash = password_hash($password, PASSWORD_DEFAULT);
        $up = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $up->execute([$rehash, (int) $user['id']]);
    }

    session_regenerate_id(true);
    $_SESSION['user_id']    = (int) $user['id'];
    $_SESSION['user_email'] = $user['email'];

    json_out(['success' => true, 'message' => 'Login successful', 'user' => [
        'id'    => (int) $user['id'],
        'email' => $user['email'],
        'name'  => $user['name'] ?? null,
    ]]);
} catch (Throwable $e) {
    server_error($e, 'login');
}
