# 11. Testing Guide

This project has **no automated test suite** (no PHPUnit, no
Vitest/Jest/Playwright configured). All testing here is manual, using the
UI, `curl`/Postman, and direct SQL inspection. Expected results are stated
for each so you know what "pass" looks like.

## 11.1 Registration
**Steps**: Go to `/register`, enter a new email + a password meeting the
policy (8+ chars, upper, lower, digit), confirm password, submit.
**Expected**: Success toast, redirect to `/` after ~1.2s. A new row exists
in `users` with a bcrypt `password_hash` (never the plaintext password).
**Also test**: submitting an existing email → "An account with this email
already exists"; a password under 8 chars → rejected client-side by the
zod schema before any request is sent.

## 11.2 Login
**Steps**: Go to `/`, enter valid credentials, submit.
**Expected**: Success toast, redirect to `/dashboard` after ~0.7s. The
session cookie is set; `me.php` now returns `{"success":true,"user":{...}}`.
**Also test**: wrong password 11 times within 5 minutes from the same
browser → the 11th attempt returns HTTP 429 "Too many attempts" (rate
limit is keyed by IP + email, see `login.php`).

## 11.3 Forgot Password
**Steps**: Go to `/forgot-password`, submit a registered email.
**Expected**: Toast says a link was sent (identical wording whether or not
the email exists — this is intentional, see
`06_EMAIL_NOTIFICATION_GUIDE.md` §6.5). In `APP_ENV=dev`, the browser
network tab also shows a `dev_reset_link` field in the response for quick
manual testing without checking email.

## 11.4 Password Reset
**Steps**: Open the link from the email (or the `dev_reset_link`), enter a
new password meeting the policy, submit.
**Expected**: Success toast, redirect to `/` after 1.2s. Old password no
longer works; new password does. Re-using the same reset link a second
time returns "This reset link has expired" / "Invalid or expired reset
token" (single-use enforced).

## 11.5 Dashboard
**Steps**: Log in, land on `/dashboard`.
**Expected**: "Daily average" and "Peak usage" KPIs show real numbers
derived from `usage_trend.php`'s last-7-day data (not `0 L` unless there's
genuinely no usage data yet). Numbers update within ~2 seconds of new
`usage_readings` rows appearing, with no manual refresh.

## 11.6 Reports
**Steps**: Go to `/reports`.
**Expected**: Today/Week/Month usage, this-month leakage totals/events/
percentage, current leak status, valve status, valve response rate, an
efficiency rating (Excellent/Good/Moderate/Poor), and a list of
recommendations — all computed server-side from real `usage_readings`/
`leakage_events` rows for the logged-in user. Auto-refreshes every 2s.

## 11.7 Notification System
**Steps**: Trigger a leak event (via `curl` — see §11.10), then check
Settings → Notifications.
**Expected**: A new row appears in Notification History within ~2 seconds
with the correct severity/volume and a `sent` or `failed` status. No user
action beyond the initial device POST is required for the row to appear.

## 11.8 Email
**Steps**: Settings → Notifications → "Send Test Email".
**Expected**: Toast confirms the send target; the email arrives (check
spam on first try); a `notifications_log` row is created with
`event_id = NULL`. Rate-limited to 5 sends per 10 minutes per user — the
6th attempt within that window returns "Too many test emails, try again
later."

## 11.9 API Endpoints (general)
For every endpoint in `04_BACKEND_API_DOCUMENTATION.md`, confirm:
- Correct HTTP method is enforced (wrong method → 405).
- Unauthenticated access to a login-required endpoint → 401
  `{"success":false,"message":"Not authenticated"}`.
- A deliberately malformed request (missing required field) → 400 or a
  `success:false` validation message, never a raw PHP error or stack
  trace, and never a 200 with silently wrong data.
- A forced server error (e.g. temporarily break the DB connection) →
  generic `"Something went wrong on our end. Please try again."`, HTTP
  500, with the real cause only in the PHP error log — never in the
  response body (unless `APP_ENV=dev`, where a `debug` field is added).

## 11.10 ESP32 Integration (without physical hardware)
Use `curl` to simulate the device — see `07_INSTALLATION_GUIDE.md` §7.4
for the exact commands. Confirm:
- Wrong/missing `X-Device-Token` → 401.
- Valid token + valid payload → 200, data appears in the DB and
  propagates to Dashboard/Usage/Reports/Leakage within ~2 seconds.
- Repeated `event_key` → `duplicate:true`, no second email.

## 11.11 Database
**Steps**: After exercising §11.1–§11.10, connect directly
(`mysql -u root -p water_management` or phpMyAdmin) and spot-check:
```sql
SELECT id, email, notify_leakage FROM users;
SELECT * FROM usage_readings ORDER BY id DESC LIMIT 5;
SELECT * FROM leakage_events ORDER BY id DESC LIMIT 5;
SELECT * FROM notifications_log ORDER BY id DESC LIMIT 5;
```
**Expected**: every row you generated through the UI/API is present with
the values you'd expect — confirms there's no hidden cache or mock layer
between the API and what's actually stored.

## 11.12 CSV Export
**Steps**: Settings → Export → "CSV".
**Expected**: A `water-usage.csv` file downloads with header row
`Timestamp,Room,Liters` and one row per `usage_readings` entry for the
logged-in user (most recent first, capped at 5000 rows). Cross-check a few
rows against the direct SQL query from §11.11 — they must match exactly
(the export endpoint is a direct `SELECT`, not a derived/cached value).

## 11.13 PDF Export
**Steps**: Settings → Export → "PDF".
**Expected**: A `water-usage.pdf` downloads and opens in any PDF viewer,
listing the same rows as the CSV export (timestamp, room, liters). This is
a hand-built minimal single-page PDF (no external PDF library) — very
long histories will not paginate, they'll just run past the visible page;
that's a known limitation of the current implementation, not a bug to
"fix" without also deciding whether to bring in a real PDF library (a
larger change, out of scope for a bug-fix pass).
