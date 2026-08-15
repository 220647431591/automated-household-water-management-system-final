<?php
// export.php returns a downloadable file, not JSON.
// It intentionally does NOT include bootstrap.php's Content-Type: application/json.

require_once __DIR__ . '/config.php';

session_start();
if (empty($_SESSION['user_id'])) {
    header('Content-Type: text/plain');
    http_response_code(401);
    echo 'Not authenticated';
    exit;
}
$uid = (int) $_SESSION['user_id'];

$format = strtoupper($_GET['format'] ?? 'CSV');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );

    $stmt = $pdo->prepare(
        'SELECT recorded_at, room, liters FROM usage_readings WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 5000'
    );
    $stmt->execute([$uid]);
    $rows = $stmt->fetchAll();

    if ($format === 'PDF') {
        // Minimal single-page PDF (no external libraries needed).
        $body = "Water Usage Report\n\n";
        foreach ($rows as $r) {
            $body .= sprintf("%s  %-9s  %6.2f L\n", $r['recorded_at'], $r['room'], (float) $r['liters']);
        }
        $body = str_replace(['(', ')'], ['\\(', '\\)'], $body);

        $stream = "BT /F1 10 Tf 40 780 Td 12 TL (" . str_replace("\n", ") Tj T* (", $body) . ") Tj ET";
        $objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            "<< /Length " . strlen($stream) . " >>\nstream\n$stream\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ];
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objs as $i => $o) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n$o\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $off) $pdf .= sprintf("%010d 00000 n \n", $off);
        $pdf .= "trailer << /Size " . (count($objs) + 1) . " /Root 1 0 R >>\nstartxref\n$xref\n%%EOF";

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="water-usage.pdf"');
        echo $pdf;
        exit;
    }

    // Default: CSV
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="water-usage.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Timestamp', 'Room', 'Liters']);
    foreach ($rows as $r) {
        fputcsv($out, [$r['recorded_at'], $r['room'], $r['liters']]);
    }
    fclose($out);
    exit;
} catch (Throwable $e) {
    error_log('[export] ' . $e->getMessage());
    header('Content-Type: text/plain');
    http_response_code(500);
    echo 'Export failed. Please try again, or contact support if this continues.';
    exit;
}
