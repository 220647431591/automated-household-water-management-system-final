<?php
require_once __DIR__ . '/bootstrap.php';

if (empty($_SESSION['user_id'])) {
    json_out(['success' => false, 'user' => null], 200);
}

try {
    $stmt = db()->prepare('SELECT id, email, name, household_id, location FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        session_destroy();
        json_out(['success' => false, 'user' => null], 200);
    }
    json_out(['success' => true, 'user' => [
        'id'          => (int) $user['id'],
        'email'       => $user['email'],
        'name'        => $user['name'] ?? null,
        'householdId' => $user['household_id'] ?? '',
        'location'    => $user['location'] ?? '',
    ]]);
} catch (Throwable $e) {
    server_error($e, 'me');
}
