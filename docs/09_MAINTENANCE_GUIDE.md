# 9. Maintenance Guide

## 9.1 Adding a New API Endpoint

Follow the existing pattern (every endpoint but `export.php` looks like
this):
```php
<?php
require_once __DIR__ . '/bootstrap.php';

$uid = require_login(); // or the X-Device-Token pattern from ingest_*.php

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['success' => false, 'message' => 'Method not allowed'], 405);
}

$value = post('some_field'); // or $_GET['x'] ?? default for GET endpoints

try {
    // ... prepared statement, always parameterized ...
    json_out(['success' => true, /* ...fields... */]);
} catch (Throwable $e) {
    server_error($e, 'your_endpoint_name'); // never echo $e->getMessage() directly
}
```
Then:
1. Add it to `04_BACKEND_API_DOCUMENTATION.md`.
2. If the frontend needs it, call it via `getJson()`/`postForm()` from
   `src/lib/api.ts` — don't hand-roll a new `fetch()` call.
3. If it's hardware-facing, update `05_ESP32_INTEGRATION_GUIDE.md` /
   `ESP32_INTEGRATION_GUIDE.md` (keep both copies in sync — see §9.7).

## 9.2 Adding a New Dashboard Card / KPI

The Dashboard (`src/routes/dashboard.tsx`) currently derives its two KPIs
(Daily Average, Peak Usage) from `usage_trend.php`'s `{labels, data}`
response. To add a new card backed by different data:
1. Decide which existing endpoint already has the number, or add a new
   field to an existing endpoint's response (cheaper than a new endpoint
   if the data's already being queried there, e.g. `reports.php`).
2. Fetch it in `dashboard.tsx` the same way `usage_trend.php` is fetched
   (a `useEffect` + `getJson` + `setInterval(load, 2000)` for live data).
3. Add a `<Kpi ... />` (the existing reusable card component in the same
   file) rather than building new markup — this keeps the visual design
   consistent, which matters since the UI is considered final/approved
   for this project.
4. **Do not hardcode the value.** Every number on this page must trace
   back to a `getJson`/`postForm` call — this was explicitly verified
   project-wide (see `TECHNICAL_DOCUMENTATION.md` §11) and is a hard
   requirement, not a style preference.

## 9.3 Adding a New Report

`reports.php` computes everything server-side and returns one JSON object
consumed by `reports.tsx`. To add a new metric:
1. Add the SQL/calculation to `reports.php`, following the existing
   pattern of named constants for any threshold (`BASELINE_MONTHLY_LITERS`,
   etc.) so magic numbers stay documented and in one place.
2. Add the new field to the JSON response.
3. Render it in `reports.tsx` inside the existing card grid.
4. Update `03_DATABASE_DOCUMENTATION.md` if the new metric reads from a
   table/column not already documented, and update
   `04_BACKEND_API_DOCUMENTATION.md`'s `reports.php` response example.

There is currently no custom-date-range reporting (only Today/Week/Month,
computed server-side) — see `TECHNICAL_DOCUMENTATION.md` §11 for why this
is a known scope boundary, not an oversight. Adding one would mean a new
query parameter on `reports.php` (e.g. `?from=&to=`) plus a date-picker UI
component — a larger, deliberate feature addition, not a quick patch.

## 9.4 Updating the Database Schema

1. Add the change to `Backend/schema.sql` (so a fresh install gets it).
2. Add a corresponding file in `Backend/migrations/` for existing
   deployments, following the naming/format of
   `2026_07_07_add_notification_columns.sql` (plain `ALTER TABLE`, a
   comment explaining when you'd need to run it).
3. If the column is one the backend can't function without (unlike the
   two optional notification columns), do **not** rely on
   `ensure_column()` self-healing alone — that mechanism only adds a
   column with a safe default; it can't backfill meaningful data or add
   constraints like `NOT NULL` without a default.
4. Update `03_DATABASE_DOCUMENTATION.md`'s table description and the
   entity-relationship summary if the change adds a relationship.

## 9.5 Troubleshooting Common Issues

See `12_TROUBLESHOOTING_GUIDE.md` for the full list. The short version:
check the PHP error log first — every unexpected failure (`server_error()`
in `bootstrap.php`, or a caught SMTP error in `mailer.php`) logs a
`[context_name]`-prefixed line there, even though the client only ever
sees a generic message.

## 9.6 Monitoring Logs

Two log surfaces exist, both server-side only (there is no admin UI for
either):
1. **PHP error log** (location depends on your `php.ini`
   `error_log` setting, or your host's default, e.g. Apache's
   `error.log`): every `server_error()` call, every `forgot_password.php`
   email attempt, and every uncaught exception in `export.php`.
2. **`notifications_log` table**: the application-level audit trail for
   leak-alert and test emails (not password resets — see
   `06_EMAIL_NOTIFICATION_GUIDE.md` §6.4/§6.5), queryable directly or via
   `notification_history.php` for a given user.

There is no log rotation or retention policy defined in this codebase —
that's an infrastructure/hosting decision (standard `logrotate` for the
PHP error log; no automatic pruning of `notifications_log`, so it will
grow indefinitely — add a periodic cleanup job if that matters for your
deployment).

## 9.7 Maintaining the SMTP System

- `mailer.php` is the only file that should ever call PHPMailer directly.
  If you add a second driver, keep `send_email()`'s
  `['success' => bool, 'message' => string]` return contract identical so
  every caller (`ingest_leakage.php`, `test_email.php`,
  `forgot_password.php`) keeps working unchanged.
- If you rotate the Gmail account or App Password, update `SMTP_USER`/
  `SMTP_PASS` in `Backend/.env` and use Settings → "Send Test Email" to
  confirm before relying on it for real leak alerts.
- **Two copies of the ESP32 guide exist** (`ESP32_INTEGRATION_GUIDE.md` at
  the project root, and `docs/05_ESP32_INTEGRATION_GUIDE.md`) — this was a
  deliberate choice from earlier project work (root-level for quick
  discovery, `docs/` for the complete numbered set), and both were kept
  in sync as of this document set. If you change ingestion/auth/response
  behavior, update **both** or consolidate them into one canonical file
  with the other as a pointer.

## 9.8 General Update Workflow

1. Make the change (backend and/or frontend).
2. Run `npm run lint` and `tsc --noEmit` (via `npx tsc --noEmit`) — both
   must be clean before shipping; this project maintains a 0-error
   baseline on both.
3. Manually exercise the affected workflow end-to-end (this project has no
   automated test suite — see `11_TESTING_GUIDE.md` for the manual
   procedures to follow).
4. Update whichever of the 14 documents in `docs/` describe the thing you
   changed — treat stale documentation as a bug, the same as stale code.
