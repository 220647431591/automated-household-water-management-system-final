<?php
require_once __DIR__ . '/bootstrap.php';

$uid = require_login();

// Self-heal: some live databases were provisioned before these columns
// existed in schema.sql. Add them if missing instead of erroring.
ensure_column(db(), 'users', 'notification_email', "notification_email VARCHAR(120) DEFAULT '' AFTER location");
ensure_column(db(), 'users', 'notify_leakage', "notify_leakage TINYINT(1) NOT NULL DEFAULT 1 AFTER notification_email");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = db()->prepare('SELECT notification_email, notify_leakage FROM users WHERE id = ?');
        $stmt->execute([$uid]);
        $row = $stmt->fetch() ?: [];
        json_out([
            'success' => true,
            'notification_email' => $row['notification_email'] ?? '',
            'notify_leakage'     => (int) ($row['notify_leakage'] ?? 1),
        ]);
    } catch (Throwable $e) {
        server_error($e, 'notification_settings');
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}
require_csrf_header();

$email  = post('notification_email');
$notify = post('notify_leakage', '1') === '1' ? 1 : 0;

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['success' => false, 'message' => 'Invalid notification email']);
}

try {
    $stmt = db()->prepare('UPDATE users SET notification_email = ?, notify_leakage = ? WHERE id = ?');
    $stmt->execute([$email, $notify, $uid]);
    json_out(['success' => true, 'message' => 'Notification preferences saved']);
} catch (Throwable $e) {
    server_error($e, 'notification_settings');
}
