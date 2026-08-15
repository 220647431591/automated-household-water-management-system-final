# 12. Troubleshooting Guide

## Database connection errors
**Symptom**: any endpoint returns
`{"success":false,"message":"Database connection failed: ..."}` at HTTP
500 (this specific message is intentionally still shown verbatim to the
client, unlike other exceptions — it's thrown before `server_error()`
would run, directly in `bootstrap.php`'s `db()` function, because a DB
outage is operationally important to see immediately).
**Fix**: Verify `Backend/.env`'s `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASS`,
confirm MySQL is running, and confirm the app's DB user has access to the
named database.

## SMTP authentication failures
**Symptom**: Settings → "Send Test Email" returns
`sent:false` with a `mail` field like `"SMTP error: SMTP connect() failed"`
or an authentication error.
**Fix**:
- If using Gmail: confirm 2-Step Verification is enabled and `SMTP_PASS`
  is a 16-character **App Password** (https://myaccount.google.com/apppasswords),
  not the account's normal login password — Gmail rejects normal
  passwords for SMTP entirely.
- Confirm `SMTP_PORT` matches `SMTP_HOST`'s expectations (587 for
  STARTTLS, 465 for implicit TLS — `mailer.php` picks the right
  `SMTPSecure` mode automatically based on the port).
- Confirm outbound port 587/465 isn't blocked by your host/firewall (some
  shared hosts block outbound SMTP entirely).

## Email not received
1. Check spam/junk first.
2. Check `notifications_log` (or Settings → Notification History) for the
   attempt's `status`/`message` — if it says `sent`, the backend
   successfully handed it to Gmail's SMTP server; delivery delay/filtering
   past that point is outside this application's control.
3. If `status` is `failed`, see "SMTP authentication failures" above.
4. If there's no log row at all for an expected leak alert, check
   `notify_leakage` for that user (Settings → Notifications) — it's
   `1` by default, but if it's `0` the event is stored with **no**
   `notifications_log` row at all (not a `skipped` row — see
   `06_EMAIL_NOTIFICATION_GUIDE.md` §6.7).

## ESP32 authentication failure
**Symptom**: `ingest_usage.php`/`ingest_leakage.php` returns 401
`{"success":false,"message":"Not authenticated"}`.
**Fix**: Confirm the `X-Device-Token` header exactly matches
`DEVICE_INGEST_TOKEN` in `Backend/.env` (whitespace/newline differences
matter — `hash_equals()` is exact). If you rotated the token, every device
using the old value will start failing immediately.

## Invalid API requests
**Symptom**: a `success:false` response with a specific validation
message (e.g. "Provide at least one of: kitchen, washroom (liters)").
**Fix**: This is the backend working correctly — re-check your request
body against `04_BACKEND_API_DOCUMENTATION.md`'s exact field names for
that endpoint. Common mistakes: sending JSON instead of
`application/x-www-form-urlencoded`; wrong field name casing
(`event_key` not `eventKey`, `valve_status` not `valveStatus` — the wire
format uses snake_case even though the frontend TypeScript types use
camelCase for the parsed response).

## Missing data (Dashboard/Usage/Reports show zero or empty)
1. Confirm data actually exists: query `usage_readings`/`leakage_events`
   directly for that `user_id`.
2. Confirm you're checking the right period — `usage.php`'s `current`
   period is literally "since midnight today"; a reading from yesterday
   won't show under "Today (Current)".
3. If the Dashboard specifically shows `0 L` for everything despite real
   data existing, this was a known historical bug (frontend/backend
   response-shape mismatch on `usage_trend.php`) that has been fixed and
   re-verified — see `TECHNICAL_DOCUMENTATION.md` §10–11. If it recurs,
   compare `dashboard.tsx`'s expected response shape against
   `usage_trend.php`'s actual `{success, period, labels, data}` output
   field-by-field.

## Dashboard not updating after new hardware data
1. Confirm the ingest call actually succeeded (`success:true` in its
   response, not just a 200 with `success:false`).
2. Live pages poll every 2 seconds — wait at least that long before
   assuming something's broken.
3. Confirm you're logged in as the same `user_id` the device is reporting
   for — data is always scoped per-user; there's no "all households" view.

## Notification failures
See "Email not received" above — the same `notifications_log` /
`notify_leakage` checks apply.

## CORS issues
**Symptom**: browser console shows a CORS error, and the network tab
shows the request never got a response (or got blocked before headers
were read).
**Fix**: The frontend's exact origin (scheme + host + port) must be listed
in `Backend/.env`'s `ALLOWED_ORIGINS`. `bootstrap.php` only sends
`Access-Control-Allow-Origin` when the incoming `Origin` header exactly
matches an entry in that list — there is no wildcard support and none
should be added (wildcard + `Access-Control-Allow-Credentials: true` is
invalid per the CORS spec and browsers will reject it outright).

## Deployment issues
- **Login works locally but not in production**: almost always the HTTPS/
  `SameSite=None; Secure` cookie requirement (§8.4 of the Deployment
  Guide) — confirm the production backend is actually served over HTTPS,
  not just the frontend.
- **`.env` values not taking effect**: real server/process environment
  variables always win over `Backend/.env` (see the comment at the top of
  `.env.example`) — if you're editing `.env` and seeing no change, check
  whether your host has already set that variable another way (Apache
  `SetEnv`, Docker, systemd, cPanel).
- **`/Backend/.env` returns 403 when tested directly**: this is correct,
  expected behavior (`.htaccess` blocks it) — not a bug to fix.
