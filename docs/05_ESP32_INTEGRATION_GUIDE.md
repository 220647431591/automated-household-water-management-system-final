# 5. ESP32 Integration Guide

This is the firmware-developer-facing guide. It is self-contained — you
should not need to read any PHP source to integrate hardware. (A copy of
this guide, with the same content, also lives at the project root as
`ESP32_INTEGRATION_GUIDE.md`; keep both in sync if either changes.)

## 5.1 What the backend expects from hardware
The backend accepts exactly these fields — nothing else. Do not send
temperature, humidity, pressure, pH, turbidity, GPS, or any other sensor
type; they are out of scope for this project and the schema has no columns
for them.

| Field | Endpoint | Meaning |
|---|---|---|
| Kitchen water usage (liters) | `ingest_usage.php` | Accumulated liters since last report |
| Washroom water usage (liters) | `ingest_usage.php` | Accumulated liters since last report |
| Leak detected + volume | `ingest_leakage.php` | Estimated leaked liters |
| Leak severity | `ingest_leakage.php` | `Low` / `Medium` / `High` / `Critical` |
| Valve status | `ingest_leakage.php` | `Activated` (closed) / `Deactivated` (open) |
| Device ID / event key | `ingest_leakage.php` | Used only for de-duplication (`event_key`), not stored as a separate device registry |
| Timestamp | both | Optional; server time is used if omitted |

The backend does **not** currently expose a general "device status"
heartbeat endpoint — only usage and leak events. If a future firmware
needs a heartbeat/online-status signal, that would be a new endpoint
(see `09_MAINTENANCE_GUIDE.md` for how to add one) — do not assume it
exists today.

## 5.2 Authentication
A single shared secret, `DEVICE_INGEST_TOKEN` (set in `Backend/.env`), is
sent on every request as:
```
X-Device-Token: <DEVICE_INGEST_TOKEN>
```
The backend compares it with `hash_equals()` (timing-safe). If the header
is missing or wrong, the endpoint falls back to checking for a logged-in
session — which a bare ESP32 will never have — so an unauthenticated
device request is rejected with HTTP 401.

**Never** hardcode the token in a public repo or ship it in a way that's
extractable from a purchased/resold device without also rotating it. Treat
it like a password.

## 5.3 Reporting routine usage
```
POST /Backend/ingest_usage.php
Headers:
  X-Device-Token: <token>
  Content-Type: application/x-www-form-urlencoded
Body:
  kitchen=12.5
  washroom=8.0
  user_id=1
  recorded_at=2026-07-07 14:30:00   (optional)
```
Send either or both of `kitchen`/`washroom` — batch a period's accumulated
liters rather than posting on every pulse tick.

Success:
```json
{ "success": true, "inserted": { "kitchen": 118, "washroom": 119 },
  "recorded_at": "2026-07-07 14:30:00", "total": 20.5 }
```

## 5.4 Reporting a leak event
```
POST /Backend/ingest_leakage.php
Headers:
  X-Device-Token: <token>
Body:
  user_id=1
  volume=42.5
  flow_rate=8.5
  severity=High
  valve_status=Deactivated
  event_key=leak-2026-07-07-0431
```
**Idempotency**: always send a stable `event_key` for the physical event
you're reporting (e.g. derived from your own internal event timestamp/ID).
If you omit it, the backend derives one from
`severity + rounded(volume,1) + current minute` — good enough to collapse
accidental retries within the same minute, but a device-supplied key is
more reliable if your event can span more than a minute before you're
sure it's a genuine send. The database also enforces
`UNIQUE(user_id, event_key)` as a hard backstop — a duplicate insert is
never possible even if your key logic and the backend's derived-key logic
both fail to catch it.

Success (new event):
```json
{ "success": true, "event_id": 118, "sent": true, "mail": "sent" }
```
Success (duplicate — same `event_key` seen before):
```json
{ "success": true, "duplicate": true, "sent": false }
```
`sent` reflects whether the alert email actually went out — check it if
you want to confirm the user was notified, though this is informational
only; the event itself is always stored regardless of email outcome.

## 5.5 Expected HTTP status codes
| Code | Meaning |
|---|---|
| 200 | Request processed (check `success` in the body either way) |
| 400 | Missing/invalid required field (e.g. no `user_id`, no usage value) |
| 401 | Bad or missing `X-Device-Token` and no session |
| 405 | Wrong HTTP method (both endpoints are POST-only) |
| 500 | Unexpected server error — the real cause is logged server-side only |

## 5.6 Error handling & retry strategy
- Always check the HTTP status **and** the `success` field — a 200 with
  `success: false` is a validation rejection, not a transient failure;
  retrying the exact same payload will fail again.
- For genuine transient failures (network timeout, 5xx, no response):
  retry with exponential backoff (e.g. 2s, 4s, 8s, capped at ~60s), and
  cap total retry duration so the device doesn't loop forever on a
  misconfigured token.
- Buffer readings locally (e.g. in flash or RAM) if Wi-Fi drops, and flush
  them once connectivity returns. Because `ingest_usage.php` accepts an
  explicit `recorded_at`, you can safely upload a backlog of readings with
  their original timestamps once the connection is restored — the
  Dashboard/Reports will reflect the correct historical timeline.
- Do not spin-retry on a 401 — that indicates a configuration problem
  (wrong/rotated token), not a transient issue.

## 5.7 Recommended upload frequency
| Data | Suggested frequency |
|---|---|
| Routine usage | Every 2 seconds (near real-time; batch small accumulated amounts rather than posting on every single pulse) |
| Leak event | Immediately on detection, once, with a stable `event_key` |

The web dashboard/reports/usage-trend/leakage/notification-history pages
poll their endpoints every 2 seconds, so anything uploaded shows up
within ~2 seconds without any user action.

## 5.8 Security recommendations
- Serve the backend over HTTPS in production; do not send the device
  token over plain HTTP.
- Rotate `DEVICE_INGEST_TOKEN` if a device is lost/decommissioned, and
  update `Backend/.env` accordingly (all devices sharing that token will
  need the new value).
- Don't reuse the device token as a user's password or vice versa — they
  are two independent authentication mechanisms.

## 5.9 Testing before writing firmware
Use `curl` or Postman to validate your payload shape before flashing any
device code:
```bash
curl -X POST https://your-domain.com/Backend/ingest_usage.php \
     -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
     -d "user_id=1&kitchen=5.2&washroom=3.1"

curl -X POST https://your-domain.com/Backend/ingest_leakage.php \
     -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
     -d "user_id=1&volume=42&severity=High&valve_status=Deactivated&event_key=demo-001"
```
A successful leak-event call should also trigger a real email (assuming
SMTP is configured and the target user has `notify_leakage=1`) — check
Settings → Notifications → Notification History in the web app afterward.
