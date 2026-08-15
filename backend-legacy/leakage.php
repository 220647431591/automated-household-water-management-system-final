<?php
require_once __DIR__ . '/bootstrap.php';

$uid    = require_login();
$period = $_GET['period'] ?? 'latest';

// Calendar-based windows so "This Week"/"This Month" mean the current
// calendar week/month (Monday-based), consistent with usage.php — not a
// rolling 7/30-day lookback. "latest" (the default filter, labelled
// "Latest Leakage" in the UI) returns only the single most recent event
// ever recorded, not a time window. "today" returns every event recorded
// since midnight today.
switch ($period) {
    case 'today':  $since = date('Y-m-d 00:00:00'); $limit = 1000; break;
    case 'week':   $since = date('Y-m-d 00:00:00', strtotime('monday this week')); $limit = 1000; break;
    case 'month':  $since = date('Y-m-01 00:00:00'); $limit = 1000; break;
    case 'latest':
    default:       $since = null; $limit = 1;
}

try {
    $sql = 'SELECT id, volume, valve_status, detected_at
              FROM leakage_events
             WHERE user_id = ?' . ($since !== null ? ' AND detected_at >= ?' : '') . '
          ORDER BY detected_at DESC
             LIMIT ' . (int) $limit;

    $params = $since !== null ? [$uid, $since] : [$uid];

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    $events = array_map(function ($r) {
        return [
            'id'          => (int) $r['id'],
            'volume'      => (float) $r['volume'],
            'time'        => $r['detected_at'],
            'valveStatus' => $r['valve_status'],
        ];
    }, $stmt->fetchAll());

    json_out(['success' => true, 'period' => $period, 'events' => $events]);
} catch (Throwable $e) {
    server_error($e, 'leakage');
}
