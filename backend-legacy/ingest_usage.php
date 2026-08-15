<?php
// ============================================================
// ingest_usage.php (simplified for school project)
// ESP32 reports routine kitchen/washroom water usage.
// Token authentication removed for easier demo.
// ============================================================

require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

// For demo: just take user_id from POST, default to 1 if missing
$uid = (int) post('user_id');
if ($uid <= 0) {
    $uid = 1; // fallback to demo user
}

// Accept either or both rooms in one call
$kitchenRaw  = post('kitchen', '');
$washroomRaw = post('washroom', '');

$hasKitchen  = $kitchenRaw !== '';
$hasWashroom = $washroomRaw !== '';

if (!$hasKitchen && !$hasWashroom) {
    json_out(['success' => false, 'message' => 'Provide at least one of: kitchen, washroom (liters)'], 400);
}

$kitchen  = $hasKitchen ? (float) $kitchenRaw : null;
$washroom = $hasWashroom ? (float) $washroomRaw : null;

if (($hasKitchen && $kitchen < 0) || ($hasWashroom && $washroom < 0)) {
    json_out(['success' => false, 'message' => 'Usage values must be >= 0'], 400);
}

// Optional: device can send its own timestamp; otherwise use server time
$recordedAt = post('recorded_at', '') ?: date('Y-m-d H:i:s');

try {
    $pdo = db();
    $ins = $pdo->prepare(
        'INSERT INTO usage_readings (user_id, room, liters, recorded_at) VALUES (?, ?, ?, ?)'
    );

    $insertedIds = [];
    if ($hasKitchen) {
        $ins->execute([$uid, 'kitchen', $kitchen, $recordedAt]);
        $insertedIds['kitchen'] = (int) $pdo->lastInsertId();
    }
    if ($hasWashroom) {
        $ins->execute([$uid, 'washroom', $washroom, $recordedAt]);
        $insertedIds['washroom'] = (int) $pdo->lastInsertId();
    }

    json_out([
        'success'      => true,
        'inserted'     => $insertedIds,
        'recorded_at'  => $recordedAt,
        'total'        => ($kitchen ?? 0) + ($washroom ?? 0),
    ]);
} catch (Throwable $e) {
    server_error($e, 'ingest_usage');
}
