<?php
// ============================================================
// mailer.php — pluggable email sender.
//
// Default driver: Gmail SMTP via PHPMailer (recommended, FREE).
// Alternate drivers can be plugged in later (Resend, Brevo, SES)
// by adding a new case in send_email() and setting MAIL_DRIVER.
//
// PHPMailer install (one-time):
//   cd backend && composer require phpmailer/phpmailer
// If composer/vendor/ is missing, we fall back to PHP mail().
// ============================================================

/**
 * Send an HTML email.
 * Returns ['success' => bool, 'message' => string].
 */
function send_email(string $to, string $subject, string $html, string $textAlt = ''): array {
    $driver = getenv('MAIL_DRIVER') ?: 'smtp';

    switch ($driver) {
        case 'smtp':
        default:
            return _send_smtp($to, $subject, $html, $textAlt);
    }
}

function _send_smtp(string $to, string $subject, string $html, string $textAlt): array {
    $host   = getenv('SMTP_HOST') ?: 'smtp.gmail.com';
    $port   = (int) (getenv('SMTP_PORT') ?: 587);
    $user   = getenv('SMTP_USER') ?: '';
    $pass   = getenv('SMTP_PASS') ?: '';
    $from   = getenv('MAIL_FROM') ?: $user;
    $name   = getenv('MAIL_FROM_NAME') ?: 'Water Management System';

    if (!$user || !$pass) {
        return ['success' => false, 'message' => 'SMTP not configured (SMTP_USER / SMTP_PASS missing)'];
    }

    $autoload = __DIR__ . '/vendor/autoload.php';
    if (is_file($autoload)) {
        require_once $autoload;
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host       = $host;
            $mail->SMTPAuth   = true;
            $mail->Username   = $user;
            $mail->Password   = $pass;
            $mail->SMTPSecure = $port === 465 ? 'ssl' : 'tls';
            $mail->Port       = $port;
            $mail->CharSet    = 'UTF-8';
            $mail->setFrom($from, $name);
            $mail->addAddress($to);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body    = $html;
            $mail->AltBody = $textAlt ?: strip_tags($html);
            $mail->send();
            return ['success' => true, 'message' => 'sent'];
        } catch (Throwable $e) {
            return ['success' => false, 'message' => 'SMTP error: ' . $e->getMessage()];
        }
    }

    // Fallback: PHP mail() — works only if the host is configured to relay.
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$name} <{$from}>\r\n";
    $ok = @mail($to, $subject, $html, $headers);
    return ['success' => $ok, 'message' => $ok ? 'sent (mail())' : 'mail() failed — install PHPMailer'];
}

/**
 * Render the branded password-reset HTML.
 */
function render_reset_email(string $resetUrl): string {
    $url = htmlspecialchars($resetUrl);
    return <<<HTML
<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 28px;background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);color:#fff">
          <div style="font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.9">Water Management System</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">🔑 Reset Your Password</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">
          <p>We received a request to reset the password on your account. Click the button below to choose a new one.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="$url" style="display:inline-block;padding:12px 28px;border-radius:8px;background:linear-gradient(90deg,#0d9488,#2563eb);color:#fff;text-decoration:none;font-weight:700">Reset Password</a>
          </p>
          <p style="color:#94a3b8;font-size:13px">Or copy and paste this link into your browser:</p>
          <p style="word-break:break-all;font-size:13px"><a href="$url" style="color:#38bdf8">$url</a></p>
          <p style="color:#94a3b8;font-size:12px;margin-top:22px">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
HTML;
}

/**
 * Render the branded leakage-alert HTML.
 */
function render_leak_email(array $ev): string {
    $when     = htmlspecialchars($ev['detected_at'] ?? date('Y-m-d H:i:s'));
    $usage    = htmlspecialchars((string)($ev['current_usage'] ?? '—'));
    $volume   = htmlspecialchars((string)($ev['volume'] ?? '—'));
    $severity = htmlspecialchars((string)($ev['severity'] ?? 'Medium'));
    $rawValve = (string)($ev['valve_status'] ?? 'Deactivated');
    $status   = htmlspecialchars($rawValve === 'Activated' ? 'Closed' : 'Open');
    $location = trim((string)($ev['location'] ?? ''));
    $color = match (strtolower($severity)) {
        'critical' => '#ef4444',
        'high'     => '#f97316',
        'medium'   => '#f59e0b',
        default    => '#0ea5e9',
    };

    $locationRow = $location !== ''
        ? '<tr><td style="padding:8px 0;color:#94a3b8">Location</td><td style="padding:8px 0;text-align:right"><b>' . htmlspecialchars($location) . '</b></td></tr>'
        : '';

    return <<<HTML
<!doctype html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        <tr><td style="padding:22px 28px;background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);color:#fff">
          <div style="font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.9">Water Management System</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">🚨 Water Leakage Alert</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">
          <p>
            A water leakage has been detected on your system. Please inspect the affected
            area as soon as possible to prevent further water loss or property damage.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#94a3b8">Detected at</td><td style="padding:8px 0;text-align:right"><b>$when</b></td></tr>
            $locationRow
            <tr><td style="padding:8px 0;color:#94a3b8">Leakage volume</td><td style="padding:8px 0;text-align:right"><b>$volume L</b></td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Total usage today</td><td style="padding:8px 0;text-align:right"><b>$usage L</b></td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Severity</td>
                <td style="padding:8px 0;text-align:right">
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:$color;color:#fff;font-weight:700;font-size:12px">$severity</span>
                </td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Valve status</td><td style="padding:8px 0;text-align:right"><b>$status</b></td></tr>
          </table>
          <div style="background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:14px;margin-top:8px">
            <b style="color:#fca5a5">Recommended action</b><br>
            Inspect the affected area promptly. If the leak persists, close the main water
            valve to prevent further water loss and potential property damage.
          </div>
          <p style="color:#94a3b8;font-size:12px;margin-top:22px">
            You received this alert because leakage notifications are enabled on your account.
            You can change this in <b>Settings → Notifications</b>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
HTML;
}
