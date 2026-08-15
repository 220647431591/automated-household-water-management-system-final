<?php
require_once __DIR__ . '/bootstrap.php';

$uid    = require_login();
$period = $_GET['period'] ?? 'week';

// 'week' = last 7 days (daily buckets), 'month' = last 30 days (daily buckets).
// Previously this endpoint ignored ?period= entirely and always returned a
// fixed 7-day window, so the Dashboard's week/month toggle had no effect.
$days = $period === 'month' ? 30 : 7;

try {
    $stmt = db()->prepare(
        'SELECT DATE(recorded_at) AS day, COALESCE(SUM(liters), 0) AS liters
           FROM usage_readings
          WHERE user_id = ? AND recorded_at >= ?
       GROUP BY DATE(recorded_at)
       ORDER BY day ASC'
    );
    $stmt->execute([$uid, date('Y-m-d 00:00:00', strtotime('-' . ($days - 1) . ' days'))]);

    // Build labeled buckets so the chart always has a full, gap-free range.
    $totals = [];
    foreach ($stmt->fetchAll() as $r) {
        $totals[$r['day']] = (float) $r['liters'];
    }

    $labelFormat = $days > 7 ? 'M/d' : 'D';
    $labels = [];
    $data   = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $labels[] = date($labelFormat, strtotime($d));
        $data[]   = $totals[$d] ?? 0;
    }

    json_out(['success' => true, 'period' => $period, 'labels' => $labels, 'data' => $data]);
} catch (Throwable $e) {
    server_error($e, 'usage_trend');
}
