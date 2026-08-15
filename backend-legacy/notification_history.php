<?php
// ============================================================
// notification_history.php — read-only log of every email the
// system has attempted to send for this user (sent/failed/skipped),
// straight from notifications_log. No mock data.
// ============================================================

require_once __DIR__ . '/bootstrap.php';

$uid = require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$limit = max(1, min(100, (int) ($_GET['limit'] ?? 25)));

try {
    $stmt = db()->prepare(
        'SELECT n.id, n.event_id, n.recipient, n.status, n.message, n.created_at,
                l.severity, l.volume
           FROM notifications_log n
      LEFT JOIN leakage_events l ON l.id = n.event_id
          WHERE n.user_id = ?
       ORDER BY n.created_at DESC
          LIMIT ' . $limit
    );
    $stmt->execute([$uid]);

    $history = array_map(function ($r) {
        return [
            'id'        => (int) $r['id'],
            'eventId'   => $r['event_id'] !== null ? (int) $r['event_id'] : null,
            'recipient' => $r['recipient'],
            'status'    => $r['status'],
            'message'   => $r['message'],
            'time'      => $r['created_at'],
            'severity'  => $r['severity'],
            'volume'    => $r['volume'] !== null ? (float) $r['volume'] : null,
        ];
    }, $stmt->fetchAll());

    json_out(['success' => true, 'history' => $history]);
} catch (Throwable $e) {
    server_error($e, 'notification_history');
}
