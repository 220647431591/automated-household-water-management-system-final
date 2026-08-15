<?php
// ============================================================
// reports.php — fully database-driven System Summary Report.
// Every value here is computed from usage_readings / leakage_events
// for the logged-in user. No mock/placeholder data. All thresholds
// used for status/efficiency labels are documented inline as the
// only "configured" (non-data) numbers in this file.
// ============================================================

require_once __DIR__ . '/bootstrap.php';

$uid = require_login();

// ---- Configurable system thresholds (not report data — used only to
//      label real numbers as Excellent/Good/etc.) ----
const BASELINE_MONTHLY_LITERS   = 1600;  // "normal" household monthly usage
const LEAK_ACTIVE_WINDOW_HOURS  = 24;    // how recent a leak must be to count as "current"
const LEAK_PCT_SAFE_MAX         = 5.0;   // <= this % of monthly usage = safe
const LEAK_PCT_WARN_MAX         = 15.0;  // <= this % = within tolerance, above = urgent
const FREQUENT_EVENTS_THRESHOLD = 3;     // events/month considered "frequent"
const VALVE_RATE_GOOD_MIN       = 90.0;
const VALVE_RATE_OK_MIN         = 75.0;
const VALVE_RATE_POOR_MIN       = 50.0;

try {
    $pdo = db();

    // ---------------- Usage: today / week / month ----------------
    $usageStmt = $pdo->prepare(
        'SELECT
            COALESCE(SUM(CASE WHEN recorded_at >= ? THEN liters ELSE 0 END), 0) AS today,
            COALESCE(SUM(CASE WHEN recorded_at >= ? THEN liters ELSE 0 END), 0) AS week,
            COALESCE(SUM(CASE WHEN recorded_at >= ? THEN liters ELSE 0 END), 0) AS month
         FROM usage_readings
        WHERE user_id = ?'
    );
    $usageStmt->execute([
        date('Y-m-d 00:00:00'),
        date('Y-m-d 00:00:00', strtotime('monday this week')),
        date('Y-m-01 00:00:00'),
        $uid,
    ]);
    $usageRow = $usageStmt->fetch();

    $todayUsage = (float) $usageRow['today'];
    $weekUsage  = (float) $usageRow['week'];
    $monthUsage = (float) $usageRow['month'];

    // ---------------- Leakage: this month's totals ----------------
    $leakStmt = $pdo->prepare(
        'SELECT
            COALESCE(SUM(volume), 0)                                   AS total_volume,
            COUNT(*)                                                   AS events,
            SUM(CASE WHEN valve_status = "Activated" THEN 1 ELSE 0 END) AS closures
         FROM leakage_events
        WHERE user_id = ? AND detected_at >= ?'
    );
    $leakStmt->execute([$uid, date('Y-m-01 00:00:00')]);
    $leakRow = $leakStmt->fetch();

    $leakTotalVolume = (float) $leakRow['total_volume'];
    $leakEvents      = (int) $leakRow['events'];
    $valveClosures   = (int) $leakRow['closures'];

    // Leakage % of this month's water usage. Undefined (null) if there's
    // no usage recorded yet this month, rather than a fake divide-by-zero 0.
    $leakagePercent = $monthUsage > 0 ? round(($leakTotalVolume / $monthUsage) * 100, 1) : null;

    // Valve response success rate. Null (not 0 or 100) when there have been
    // no leak events at all this month — there's nothing to rate yet.
    $valveSuccessRate = $leakEvents > 0 ? round(($valveClosures / $leakEvents) * 100) : null;

    // ---------------- Current leak status (latest event only) ----------------
    $latestLeakStmt = $pdo->prepare(
        'SELECT severity, valve_status, detected_at
           FROM leakage_events
          WHERE user_id = ?
       ORDER BY detected_at DESC
          LIMIT 1'
    );
    $latestLeakStmt->execute([$uid]);
    $latestLeak = $latestLeakStmt->fetch();

    $currentLeakStatus = 'No Leak';
    $currentValveStatus = 'Open';
    if ($latestLeak) {
        // Valve status reflects the last known state until changed again.
        $currentValveStatus = $latestLeak['valve_status'] === 'Activated' ? 'Closed' : 'Open';

        // Leak status only counts as "current" if it was detected recently;
        // older, unrepeated events are treated as resolved.
        $ageHours = (time() - strtotime($latestLeak['detected_at'])) / 3600;
        if ($ageHours <= LEAK_ACTIVE_WINDOW_HOURS) {
            $currentLeakStatus = $latestLeak['severity'];
        }
    }

    // ---------------- Last updated (newest record of any kind) ----------------
    $lastUpdatedStmt = $pdo->prepare(
        'SELECT GREATEST(
            COALESCE((SELECT MAX(recorded_at) FROM usage_readings WHERE user_id = ?), "1970-01-01"),
            COALESCE((SELECT MAX(detected_at) FROM leakage_events WHERE user_id = ?), "1970-01-01")
         ) AS last_updated'
    );
    $lastUpdatedStmt->execute([$uid, $uid]);
    $lastUpdatedRow = $lastUpdatedStmt->fetch();
    $lastUpdated = $lastUpdatedRow && $lastUpdatedRow['last_updated'] !== '1970-01-01'
        ? $lastUpdatedRow['last_updated']
        : null;

    // ---------------- Overall system efficiency (backend-computed score) ----------------
    // Combines leakage %, valve response rate, and usage vs. baseline.
    $leakScore = 0;
    if ($leakagePercent === null || $leakagePercent <= LEAK_PCT_SAFE_MAX) {
        $leakScore = 3;
    } elseif ($leakagePercent <= LEAK_PCT_WARN_MAX) {
        $leakScore = 2;
    } elseif ($leakagePercent <= 30.0) {
        $leakScore = 1;
    }

    $valveScore = 3; // no events yet = nothing has failed
    if ($valveSuccessRate !== null) {
        if ($valveSuccessRate >= VALVE_RATE_GOOD_MIN) $valveScore = 3;
        elseif ($valveSuccessRate >= VALVE_RATE_OK_MIN) $valveScore = 2;
        elseif ($valveSuccessRate >= VALVE_RATE_POOR_MIN) $valveScore = 1;
        else $valveScore = 0;
    }

    $usageScore = 0;
    if ($monthUsage <= BASELINE_MONTHLY_LITERS) $usageScore = 2;
    elseif ($monthUsage <= BASELINE_MONTHLY_LITERS * 1.15) $usageScore = 1;

    $totalScore = $leakScore + $valveScore + $usageScore; // max 8

    if ($totalScore >= 7) $efficiency = 'Excellent';
    elseif ($totalScore >= 5) $efficiency = 'Good';
    elseif ($totalScore >= 3) $efficiency = 'Moderate';
    else $efficiency = 'Poor';

    // ---------------- Recommendations (generated from the numbers above) ----------------
    $recommendations = [];

    if ($leakagePercent !== null && $leakagePercent > LEAK_PCT_WARN_MAX) {
        $recommendations[] = "Leakage is {$leakagePercent}% of this month's usage — exceeds the safe threshold. Inspect plumbing immediately.";
    } elseif ($leakEvents >= FREQUENT_EVENTS_THRESHOLD) {
        $recommendations[] = "Frequent leakage events detected ({$leakEvents} this month). Schedule maintenance.";
    } else {
        $recommendations[] = 'Water usage is within the expected range for leakage.';
    }

    if ($valveSuccessRate !== null) {
        if ($valveSuccessRate < VALVE_RATE_OK_MIN) {
            $recommendations[] = "Valve response success rate is {$valveSuccessRate}% — schedule valve maintenance.";
        } else {
            $recommendations[] = 'Valve response is operating correctly.';
        }
    }

    if ($monthUsage > BASELINE_MONTHLY_LITERS) {
        $recommendations[] = "Water consumption ({$monthUsage} L) is higher than the typical baseline of " . BASELINE_MONTHLY_LITERS . ' L. Consider reducing unnecessary usage.';
    } else {
        $recommendations[] = 'Water usage is within the expected range.';
    }

    $recommendations[] = 'Continue monitoring the system regularly.';

    json_out([
        'success'     => true,
        'lastUpdated' => $lastUpdated,
        'usage' => [
            'today'    => $todayUsage,
            'week'     => $weekUsage,
            'month'    => $monthUsage,
            'baseline' => BASELINE_MONTHLY_LITERS,
        ],
        'leakage' => [
            'totalVolume'     => $leakTotalVolume,
            'events'          => $leakEvents,
            'percentage'      => $leakagePercent,
            'currentStatus'   => $currentLeakStatus,
        ],
        'valve' => [
            'currentStatus'      => $currentValveStatus,
            'successfulClosures' => $valveClosures,
            'responseSuccessRate'=> $valveSuccessRate,
        ],
        'efficiency'      => $efficiency,
        'recommendations' => $recommendations,
    ]);
} catch (Throwable $e) {
    server_error($e, 'reports');
}