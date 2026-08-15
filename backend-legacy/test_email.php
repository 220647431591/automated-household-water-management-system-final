<?php
// ============================================================
// test_email.php
// Diagnostic email test for logged-in users
// ============================================================

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$uid = require_login();

if (!rate_limit('test_email:' . $uid, 5, 600)) {
    json_out(['success' => false, 'message' => 'Too many test emails, try again later'], 429);
}

try {

    $stmt = db()->prepare(
        'SELECT email, notification_email FROM users WHERE id = ?'
    );

    $stmt->execute([$uid]);

    $user = $stmt->fetch();

    if (!$user) {
        json_out([
            'success' => false,
            'message' => 'User not found'
        ], 404);
    }


    // Decide receiver email
    $to = $user['notification_email'] ?: $user['email'];


    error_log("[test_email] sending diagnostic email to: " . $to);


    $sentAt = htmlspecialchars(date('Y-m-d H:i:s'));


    $html = <<<HTML
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0">

<table width="100%" cellpadding="0" cellspacing="0" 
style="background:#0f172a;padding:24px 12px">

<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="max-width:600px;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">


<tr>
<td style="padding:22px 28px;
background:linear-gradient(90deg,#0d9488,#2563eb,#7c3aed);
color:white">


<div style="font-size:13px;letter-spacing:.15em;
text-transform:uppercase;opacity:.9">

Automated Household Water Management System

</div>


<div style="font-size:22px;font-weight:800;margin-top:4px">

✅ Test Email Verification

</div>


</td>
</tr>



<tr>
<td style="padding:24px 28px;font-size:15px;line-height:1.6">


<p>
This is a test email from your 
<strong>
Automated Household Water Management System
</strong>
backend.
</p>


<p>
If you're reading this, your SMTP configuration is working correctly and
water leakage alerts and password reset notifications will successfully reach this inbox.
</p>


<p style="color:#94a3b8;font-size:12px;margin-top:22px">

Sent at {$sentAt}.

</p>


</td>
</tr>


</table>

</td>
</tr>

</table>

</body>
</html>
HTML;



    $res = send_email(
        $to,
        'Test Email — Automated Household Water Management System',
        $html
    );


    $sent = $res['success'];



    $log = db()->prepare(
        'INSERT INTO notifications_log
        (user_id, event_id, recipient, status, message)
        VALUES (?, NULL, ?, ?, ?)'
    );


    $log->execute([
        $uid,
        $to,
        $sent ? 'sent' : 'failed',
        $res['message']
    ]);



    json_out([
        'success' => true,
        'sent' => $sent,
        'to' => $to,
        'mail' => $res['message']
    ]);



} catch (Throwable $e) {
    server_error($e, 'test_email');
}