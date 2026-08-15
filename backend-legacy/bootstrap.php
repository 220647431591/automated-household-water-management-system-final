<?php
// ============================================================
// bootstrap.php — included at the top of every endpoint.
// Handles CORS, JSON responses, sessions, and the DB connection.
// ============================================================

require_once __DIR__ . '/config.php';

// ---------- CORS ----------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');

// ---------- Session (cross-origin safe) ----------
// SameSite=None + Secure is required for cross-site cookies in modern browsers.
// If you are hitting a plain http://localhost backend from a Lovable preview,
// browsers will still block the cookie unless the backend is served over HTTPS.
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $secure,
    'httponly' => true,
    'samesite' => $secure ? 'None' : 'Lax',
]);
session_start();

// ---------- Database ----------
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

// ---------- Self-healing schema check ----------
/**
 * Ensures a column exists on a table, adding it if missing.
 * Safe to call on every request: it does a cheap INFORMATION_SCHEMA lookup
 * and only runs ALTER TABLE the first time the column is actually absent.
 * This keeps older/live databases in sync with backend/schema.sql without
 * requiring a manual migration step.
 */
function ensure_column(PDO $pdo, string $table, string $column, string $definitionSql): void {
    static $checked = [];
    $key = $table . '.' . $column;
    if (isset($checked[$key])) return;
    $checked[$key] = true;

    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([$table, $column]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN $definitionSql");
    }
}

// ---------- Helpers ----------
function json_out(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

/**
 * Handle an unexpected exception safely: log the real error server-side,
 * but never echo raw exception text (DB details, file paths, credentials
 * in a connection error, etc.) back to the API caller. In APP_ENV=dev the
 * real message is also included in the response to speed up local debugging.
 */
function server_error(Throwable $e, string $context = ''): void {
    error_log('[' . ($context !== '' ? $context : 'server_error') . '] ' . $e->getMessage());
    $payload = ['success' => false, 'message' => 'Something went wrong on our end. Please try again.'];
    if (defined('APP_ENV') && APP_ENV === 'dev') {
        $payload['debug'] = $e->getMessage();
    }
    json_out($payload, 500);
}

/**
 * Lightweight CSRF defense for browser-session-authenticated,
 * state-changing endpoints. Production session cookies must be
 * SameSite=None (the frontend and backend are on different origins), so
 * the cookie alone doesn't stop a forged cross-site <form> POST. A bare
 * HTML form cannot set a custom header, but our own frontend's fetch()
 * calls always send X-Requested-With (see src/lib/api.ts) — and only an
 * origin already on the ALLOWED_ORIGINS CORS allowlist can do that from
 * a browser. Call this after require_login() on any endpoint that
 * changes account state.
 */
function require_csrf_header(): void {
    $requested = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (strcasecmp($requested, 'XMLHttpRequest') !== 0) {
        json_out(['success' => false, 'message' => 'Invalid request'], 403);
    }
}

function require_login(): int {
    if (empty($_SESSION['user_id'])) {
        json_out(['success' => false, 'message' => 'Not authenticated'], 401);
    }
    return (int) $_SESSION['user_id'];
}

function post(string $key, string $default = ''): string {
    return isset($_POST[$key]) ? trim((string) $_POST[$key]) : $default;
}

function client_ip(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Very small file-based rate limiter.
 * Returns true if allowed, false if the caller has exceeded $max hits within $windowSec.
 */
function rate_limit(string $bucket, int $max = 8, int $windowSec = 300): bool {
    $dir = sys_get_temp_dir() . '/whms_rl';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $file = $dir . '/' . sha1($bucket) . '.json';
    $now  = time();
    $hits = [];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $hits = $raw ? (json_decode($raw, true) ?: []) : [];
    }
    $hits = array_values(array_filter($hits, fn($t) => ($now - (int)$t) < $windowSec));
    if (count($hits) >= $max) return false;
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return true;
}
