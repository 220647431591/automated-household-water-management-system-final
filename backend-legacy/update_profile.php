<?php
require_once __DIR__ . '/bootstrap.php';

$uid = require_login();
require_csrf_header();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$name        = post('name');
$householdId = post('householdId');
$location    = post('location');
$email       = post('email');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['success' => false, 'message' => 'Invalid email address']);
}

try {
    $dupe = db()->prepare('SELECT 1 FROM users WHERE email = ? AND id != ? LIMIT 1');
    $dupe->execute([$email, $uid]);
    if ($dupe->fetch()) {
        json_out(['success' => false, 'message' => 'That email is already in use by another account']);
    }

    $stmt = db()->prepare(
        'UPDATE users SET name = ?, household_id = ?, location = ?, email = ? WHERE id = ?'
    );
    $stmt->execute([$name, $householdId, $location, $email, $uid]);

    json_out(['success' => true, 'message' => 'Profile updated']);
} catch (Throwable $e) {
    server_error($e, 'update_profile');
}
