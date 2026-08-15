<?php
require_once __DIR__ . '/bootstrap.php';

$uid    = require_login();
$period = $_GET['period'] ?? 'current';

// Map period to a MySQL time window. Both bounds matter — 'lastWeek' in
// particular needs an upper bound, or it silently includes everything from
// last Monday through today (i.e. last week + this week combined).
$until = null;
switch ($period) {
    case 'current':   $since = date('Y-m-d 00:00:00'); break;
    case 'week':      $since = date('Y-m-d 00:00:00', strtotime('monday this week')); break;
    case 'lastWeek':
        $since = date('Y-m-d 00:00:00', strtotime('monday last week'));
        $until = date('Y-m-d 00:00:00', strtotime('monday this week'));
        break;
    case 'month':     $since = date('Y-m-01 00:00:00'); break;
    default:          $since = date('Y-m-d 00:00:00');
}

try {
    $sql = 'SELECT room, COALESCE(SUM(liters), 0) AS total
              FROM usage_readings
             WHERE user_id = ? AND recorded_at >= ?';
    $params = [$uid, $since];
    if ($until !== null) {
        $sql .= ' AND recorded_at < ?';
        $params[] = $until;
    }
    $sql .= ' GROUP BY room';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    $kitchen = 0.0;
    $washroom = 0.0;
    foreach ($stmt->fetchAll() as $row) {
        if ($row['room'] === 'kitchen')  $kitchen  = (float) $row['total'];
        if ($row['room'] === 'washroom') $washroom = (float) $row['total'];
    }

    json_out([
        'success'  => true,
        'period'   => $period,
        'kitchen'  => $kitchen,
        'washroom' => $washroom,
        'overall'  => $kitchen + $washroom,
    ]);
} catch (Throwable $e) {
    server_error($e, 'usage');
}
