<?php
// ============================================================
// ingest_leakage.php (simplified for school project)
// ESP32/Arduino reports a leak event.
// Token authentication removed for easier demo.
// ============================================================

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

// For demo: just take user_id from POST, default to 1 if missing
$uid = (int) post('user_id');
if ($uid <= 0) {
    $uid = 1; // fallback to demo user
}

$volume      = (float) post('volume', '0');
$flowRate    = (float) post('flow_rate', (string) $volume);
$severity    = post('severity', 'Medium');
$valveStatus = post('valve_status', 'Deactivated');
$eventKey    = post('event_key', ''); // optional idempotency key from device

try {
    $pdo = db();
    ensure_column($pdo, 'users', 'notification_email', "notification_email VARCHAR(120) DEFAULT '' AFTER location");
    ensure_column($pdo, 'users', 'notify_leakage', "notify_leakage TINYINT(1) NOT NULL DEFAULT 1 AFTER notification_email");

    // De-duplication logic
    $eventKey = $eventKey !== ''
        ? $eventKey
        : ('auto-' . date('YmdHi') . '-' . $severity . '-' . round($volume, 1));

    $duplicate = false;
    $q = $pdo->prepare('SELECT id FROM leakage_events WHERE user_id = ? AND event_key = ? LIMIT 1');
    $q->execute([$uid, $eventKey]);
    $duplicate = (bool) $q->fetch();

    if (!$duplicate) {
        $ins = $pdo->prepare(
            'INSERT INTO leakage_events (user_id, volume, flow_rate, severity, valve_status, event_key)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([$uid, $volume, $flowRate, $severity, $valveStatus, $eventKey ?: null]);
        $eventId = (int) $pdo->lastInsertId();
    } else {
        json_out(['success' => true, 'duplicate' => true, 'sent' => false]);
    }

    // Load user notification prefs
    $u = $pdo->prepare('SELECT email, notification_email, notify_leakage, location FROM users WHERE id = ?');
    $u->execute([$uid]);
    $user = $u->fetch() ?: [];

    $sent = false; $mailMsg = 'skipped';
    if (!empty($user['notify_leakage'])) {
        $to = $user['notification_email'] ?: $user['email'];
        if ($to) {
            $usageStmt = $pdo->prepare(
                'SELECT COALESCE(SUM(liters), 0) FROM usage_readings WHERE user_id = ? AND recorded_at >= ?'
            );
            $usageStmt->execute([$uid, date('Y-m-d 00:00:00')]);
            $currentUsage = (float) $usageStmt->fetchColumn();

            $html = render_leak_email([
                'detected_at'    => date('Y-m-d H:i:s'),
                'current_usage'  => $currentUsage,
                'volume'         => $volume,
                'severity'       => $severity,
                'valve_status'   => $valveStatus,
                'location'       => $user['location'] ?? '',
            ]);
            $res = send_email($to, '🚨 Water Leakage Detected', $html);
            $sent    = $res['success'];
            $mailMsg = $res['message'];

            // Log every notification attempt
            $log = $pdo->prepare(
                'INSERT INTO notifications_log (user_id, event_id, recipient, status, message)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $log->execute([$uid, $eventId, $to, $sent ? 'sent' : 'failed', $mailMsg]);
        }
    }

    json_out(['success' => true, 'event_id' => $eventId, 'sent' => $sent, 'mail' => $mailMsg]);
} catch (Throwable $e) {
    server_error($e, 'ingest_leakage');
}
