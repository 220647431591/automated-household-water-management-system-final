# 6. Email Notification Guide

## 6.1 Overview

All outbound email goes through one function, `send_email()` in
`Backend/mailer.php`. Every caller passes it a `to`, `subject`, and `html`
body; it returns `['success' => bool, 'message' => string]`, which the
caller then writes to `notifications_log` (leak alerts, test emails) or
just logs to the PHP error log (password reset — see §6.4).

There is exactly one driver today: Gmail SMTP via PHPMailer. `mailer.php`
is written so a second driver (Resend, Brevo, SES, etc.) could be added
later by adding a `case` in `send_email()`'s `switch ($driver)` and setting
`MAIL_DRIVER` — but only `smtp` exists right now. Do not describe or rely
on any other driver being available.

## 6.2 SMTP Configuration

Set in `Backend/.env` (see `.env.example` for the full list):

| Variable | Purpose |
|---|---|
| `MAIL_DRIVER` | Must be `smtp` (the only implemented driver) |
| `SMTP_HOST` | Default `smtp.gmail.com` if unset |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (implicit TLS) — `_send_smtp()` picks `SMTPSecure = 'ssl'` automatically when the port is `465`, `'tls'` otherwise |
| `SMTP_USER` | Full Gmail address |
| `SMTP_PASS` | A Gmail **App Password** (16 characters, generated at https://myaccount.google.com/apppasswords) — never your real account password, and only available once 2‑Step Verification is enabled |
| `MAIL_FROM` | From-address shown to recipients; defaults to `SMTP_USER` if unset |
| `MAIL_FROM_NAME` | From-name shown to recipients; defaults to `"Water Management System"` |

If `SMTP_USER` or `SMTP_PASS` is empty, `send_email()` returns
`{success: false, message: "SMTP not configured (SMTP_USER / SMTP_PASS missing)"}`
immediately — no partial send is attempted.

**Fallback path**: if `Backend/vendor/autoload.php` doesn't exist (i.e.
`composer install` was never run), `_send_smtp()` falls back to PHP's
built-in `mail()` function. This only works if the host server itself is
configured to relay mail (most shared hosts and all local dev machines are
not), so in practice PHPMailer must be installed for email to work at all.
Run `composer install` inside `Backend/` to get it (PHPMailer is already
vendored in this repo's `Backend/vendor/`, so this is only relevant if
you're setting up on a fresh clone without `vendor/`).

## 6.3 What Actually Triggers an Email

Only three code paths call `send_email()`:

| Trigger | File | Recipient | Logged to `notifications_log`? |
|---|---|---|---|
| Leak event received from ESP32 (or a session-authenticated manual call) | `ingest_leakage.php` | `notification_email` if set, else `email` | Yes — always, sent or failed |
| User clicks "Send Test Email" in Settings → Notifications | `test_email.php` | Same recipient logic as above | Yes — always, sent or failed |
| User submits Forgot Password | `forgot_password.php` | The email address they typed in | **No** — see §6.4 |

There is no scheduled/cron email and no digest email. Every send is
triggered synchronously, inline in the HTTP request that caused it.

## 6.4 Leakage Notification Workflow (full trace)

```
ESP32 (or curl/Postman)
   │  POST ingest_leakage.php  (X-Device-Token or session)
   ▼
ingest_leakage.php
   │  1. Validate device token or require_login()
   │  2. Compute/accept event_key, check for a duplicate
   │       └─ duplicate → respond {success:true, duplicate:true, sent:false}, STOP (no email)
   │  3. INSERT INTO leakage_events                      ──▶  Database
   │  4. SELECT users.notification_email, notify_leakage
   │  5. If notify_leakage = 0 → skip email, respond {sent:false, mail:"skipped"}
   │  6. If notify_leakage = 1 →
   │       a. Compute today's usage total (for the email body)
   │       b. render_leak_email() → HTML
   │       c. send_email() → PHPMailer → Gmail SMTP           ──▶  User's inbox
   │       d. INSERT INTO notifications_log (status: sent/failed) ──▶ Database
   ▼
Response: {success:true, event_id, sent:true|false, mail:"sent"|"<smtp error>"}
```

The event is **always** stored in step 3, regardless of whether the email
in step 6c succeeds — a leak is never silently dropped just because SMTP
is down. The email attempt itself, and its outcome, is logged in step 6d
either way.

**On the frontend**: Settings → Notifications polls `notification_history.php`
every 2 seconds, so a leak-triggered row appears there automatically,
without the user pressing anything.

## 6.5 Password Reset Workflow

```
User submits email on /forgot-password
   ▼
forgot_password.php
   │  1. Rate-limited: 5 requests / 10 min per IP
   │  2. SELECT users WHERE email = ?
   │  3. If found: generate a 64-hex-char token, store it + a 1-hour
   │     expiry in users.reset_token / reset_expires
   │  4. Build the reset URL: {Origin header or FRONTEND_URL}/reset-password?token=...
   │  5. send_email() with the branded reset template (render_reset_email())
   │  6. error_log() the outcome (NOT written to notifications_log)
   │  7. Always respond {success:true, message:"If that email exists..."}
   ▼                        (same response whether or not the email existed —
   │                         prevents an attacker from enumerating accounts)
User clicks the link in their email
   ▼
/reset-password?token=...  (React page)
   ▼
reset_password.php
   │  1. Rate-limited: 10 requests / 10 min per IP
   │  2. Validate token format + password strength
   │  3. SELECT users WHERE reset_token = ?
   │  4. Reject if not found or reset_expires < now
   │  5. UPDATE password_hash, clear reset_token/reset_expires (single-use)
   ▼
Redirect to login; user signs in with the new password
```

**Why this one isn't in `notifications_log`**: the table's schema and the
Notification History UI were built specifically around leak-alert-style
events (they carry `event_id`, `severity`, `volume`). Password reset
emails don't fit that shape, so they're logged to the PHP error log only.
If you want them in the same audit trail as leak alerts, that's a schema
change — see `09_MAINTENANCE_GUIDE.md`.

## 6.5.1 Dev-mode convenience

When `APP_ENV=dev`, `forgot_password.php`'s response also includes a
`dev_reset_link` field with the raw reset URL, so you can test the reset
flow locally without a working SMTP setup. This field is **never** present
when `APP_ENV=prod` — confirm your production `.env` has `APP_ENV=prod`
before going live, or reset links will leak into API responses.

## 6.6 Test Email Workflow

Settings → Notifications → "Send Test Email" → `test_email.php`:
1. Rate-limited: 5 requests / 10 min per user.
2. Recipient: `notification_email` if set, else the account `email`.
3. Sends a fixed diagnostic HTML template confirming SMTP works.
4. Logs the attempt to `notifications_log` with `event_id = NULL` (so it
   shows up in Notification History as a generic "Leak alert" row with no
   severity/volume — this is expected, not a bug: the UI has no separate
   "test" label, it just renders whatever `severity`/`volume` it gets,
   which are `NULL` for a test send).

## 6.7 Notification Logging Reference

Every row in `notifications_log` has `status` of `sent`, `failed`, or
`skipped`:
- **`sent`**: `send_email()` returned `success: true` (PHPMailer confirmed
  the SMTP transaction completed).
- **`failed`**: `send_email()` returned `success: false` — `message`
  contains the raw PHPMailer/SMTP exception text (e.g. auth failure,
  connection timeout). This message is only ever shown to the
  authenticated user viewing their own Notification History or Settings
  test-email result — it is never leaked to an unauthenticated caller.
- **`skipped`**: defined in the schema's ENUM but not currently written by
  any code path — `notify_leakage = 0` short-circuits *before* reaching
  the log insert in `ingest_leakage.php`, so a disabled-notifications user
  gets no `notifications_log` row at all for that event, not a `skipped`
  one. This is worth knowing if you're debugging "why don't I see a
  skipped entry" — there isn't one.

## 6.8 Failure Handling

`send_email()` never throws to its caller — SMTP/PHPMailer errors are
caught internally (`try { ... $mail->send(); } catch (Throwable $e) { return ['success' => false, ...] }`)
and returned as a normal `['success' => false, 'message' => '...']`
result. This means a down SMTP server never turns into an HTTP 500 for
the person submitting a leak event or a password reset — the request
still completes, the data is still stored, and only the email portion is
marked failed. See `12_TROUBLESHOOTING_GUIDE.md` for diagnosing specific
SMTP failure messages.

## 6.9 Complete Notification Flow (diagram)

```
   ESP32
     │  POST ingest_leakage.php (X-Device-Token)
     ▼
  Backend (ingest_leakage.php)
     │  INSERT
     ▼
  Database (leakage_events)
     │  read notify_leakage + notification_email
     ▼
  Database (users)
     │  render + send
     ▼
  Mailer (PHPMailer / Gmail SMTP)
     │  INSERT (status: sent/failed)
     ▼
  Database (notifications_log)
     │  polled every 2s
     ▼
  Notification History UI (Settings → Notifications)

  ...and in parallel, on success:

  Mailer ──▶ User's Phone (Gmail/Mail app push notification, exactly like
             any other incoming email — there is no separate push channel)
```
