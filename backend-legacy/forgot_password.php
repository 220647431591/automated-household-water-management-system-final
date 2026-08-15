<?php
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

// Basic rate limit to prevent enumeration / spamming.
if (!rate_limit('forgot:' . client_ip(), 5, 600)) {
    json_out(['success' => false, 'message' => 'Too many requests, try again later'], 429);
}

$email = strtolower(post('email'));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(['success' => false, 'message' => 'Invalid email address']);
}

// The public reset URL — the frontend serves this page. Prefer the Origin
// header (works for normal browser requests); fall back to FRONTEND_URL for
// callers that don't send Origin (Postman, server-to-server, some mobile
// HTTP clients), so the emailed link is never a bare relative path.
$frontendBase = $_SERVER['HTTP_ORIGIN'] ?? (getenv('FRONTEND_URL') ?: '');
$resetUrlBase = rtrim($frontendBase, '/') . '/reset-password';

try {
    $stmt = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    $devLink = null;

    // Always report success so an attacker can't enumerate valid emails.
    if ($user) {
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 3600); // 1 hour

        $upd = db()->prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?');
        $upd->execute([$token, $expires, $user['id']]);

        $devLink = $resetUrlBase . '?token=' . urlencode($token);

        // Actually send the reset email (previously this was a TODO — the
        // link was only written to the error log, so users never received it).
        $mailResult = send_email($email, 'Reset your password', render_reset_email($devLink));
        if (function_exists('error_log')) {
            error_log("[forgot_password] Reset email to {$email}: " . $mailResult['message']);
        }
    }

    $payload = ['success' => true, 'message' => 'If that email exists, a reset link has been sent'];

    // Expose the dev link only when APP_ENV === 'dev', so real deployments never leak it.
    if (defined('APP_ENV') && APP_ENV === 'dev' && $devLink) {
        $payload['dev_reset_link'] = $devLink;
    }

    json_out($payload);
} catch (Throwable $e) {
    server_error($e, 'forgot_password');
}
