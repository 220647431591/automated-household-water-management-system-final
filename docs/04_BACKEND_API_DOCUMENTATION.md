# 4. Backend API Documentation

Base URL (example): `https://your-domain.com/Backend`
All endpoints are plain PHP files (no router) — the "URL" column below is
the exact filename to POST/GET.

**Conventions that apply to every endpoint below:**
- Request bodies are `application/x-www-form-urlencoded` (not JSON) for all
  POST endpoints — the frontend's `postForm()` helper sends form-encoded
  data, and every endpoint reads `$_POST[...]` via the `post()` helper.
- All responses are `application/json`.
- Every authenticated endpoint requires the PHP session cookie
  (`credentials: "include"` on the frontend fetch); unauthenticated
  requests get `{"success": false, "message": "Not authenticated"}` with
  HTTP 401.
- On an uncaught exception, every endpoint returns HTTP 500 with
  `{"success": false, "message": "Something went wrong on our end. Please try again."}`
  — the real cause is written to the PHP error log, prefixed
  `[endpoint_name]`, never sent to the client (see `bootstrap.php`'s
  `server_error()` helper).
- CORS: only origins listed in `ALLOWED_ORIGINS` (env var) are allowed,
  with `Access-Control-Allow-Credentials: true`.

---

## 4.1 Authentication & Account Endpoints

### `login.php`
| | |
|---|---|
| **Purpose** | Sign in with email + password |
| **Method** | POST |
| **URL** | `/Backend/login.php` |
| **Auth** | None |
| **Rate limit** | 10 attempts / 5 min, keyed by IP + email |

Request:
```
email=user@example.com
password=Password1
```
Success (200):
```json
{ "success": true, "message": "Login successful",
  "user": { "id": 1, "email": "user@example.com", "name": "Demo User" } }
```
Errors:
```json
{ "success": false, "message": "Email and password are required" }   // 200
{ "success": false, "message": "Invalid email or password" }          // 200
{ "success": false, "message": "Too many attempts. Try again in a few minutes." } // 429
```
Notes: on success, `session_regenerate_id(true)` runs (session-fixation
protection); the password hash is transparently rehashed if
`password_needs_rehash()` returns true.

### `register.php`
| | |
|---|---|
| **Purpose** | Create a new account |
| **Method** | POST |
| **URL** | `/Backend/register.php` |
| **Auth** | None |

Request:
```
email=user@example.com
password=Password1
```
Validation: valid email format, email ≤ 100 chars, password ≥ 8 chars.
Success (200): `{ "success": true, "message": "Account created" }`
Errors:
```json
{ "success": false, "message": "Invalid email address" }
{ "success": false, "message": "Password must be at least 8 characters" }
{ "success": false, "message": "Email is too long" }
{ "success": false, "message": "An account with this email already exists" }
```

### `me.php`
| | |
|---|---|
| **Purpose** | Return the currently logged-in user (session check) |
| **Method** | GET |
| **URL** | `/Backend/me.php` |
| **Auth** | Session (does not error if absent — returns `user: null`) |

Success (200, logged in):
```json
{ "success": true, "user": { "id": 1, "email": "user@example.com",
  "name": "Demo User", "householdId": "HH-001", "location": "Dar es Salaam" } }
```
Not logged in (200): `{ "success": false, "user": null }`

### `logout.php`
| | |
|---|---|
| **Purpose** | End the session |
| **Method** | POST |
| **URL** | `/Backend/logout.php` |
| **Auth** | None required (safe to call while already logged out) |

Response: `{ "success": true, "message": "Logged out" }`

### `update_profile.php`
| | |
|---|---|
| **Purpose** | Update name, household ID, location, email |
| **Method** | POST |
| **URL** | `/Backend/update_profile.php` |
| **Auth** | Session required |

Request: `name=...&householdId=...&location=...&email=...`
Success: `{ "success": true, "message": "Profile updated" }`
Errors:
```json
{ "success": false, "message": "Invalid email address" }
{ "success": false, "message": "That email is already in use by another account" }
```

### `change_password.php`
| | |
|---|---|
| **Purpose** | Change password (requires current password) |
| **Method** | POST |
| **URL** | `/Backend/change_password.php` |
| **Auth** | Session required |

Request: `oldPassword=...&newPassword=...`
Success: `{ "success": true, "message": "Password updated" }`
Errors:
```json
{ "success": false, "message": "New password must be at least 8 characters" }
{ "success": false, "message": "Current password is incorrect" }
```

### `delete_account.php`
| | |
|---|---|
| **Purpose** | Permanently delete the current account and all its data |
| **Method** | POST |
| **URL** | `/Backend/delete_account.php` |
| **Auth** | Session required |

Request: none (empty body)
Success: `{ "success": true, "message": "Account deleted" }`
Effect: `DELETE FROM users WHERE id = ?` — cascades to
`usage_readings`, `leakage_events`, `notifications_log` via FK.

### `forgot_password.php`
| | |
|---|---|
| **Purpose** | Issue a password-reset token and email it |
| **Method** | POST |
| **URL** | `/Backend/forgot_password.php` |
| **Auth** | None |
| **Rate limit** | 5 requests / 10 min, keyed by IP |

Request: `email=user@example.com`
Success (always `success: true`, regardless of whether the email exists —
this prevents account enumeration):
```json
{ "success": true, "message": "If that email exists, a reset link has been sent" }
```
In `APP_ENV=dev` only, an extra `dev_reset_link` field is included so the
link can be tested without checking an inbox. Never present in
`APP_ENV=prod`.
Errors: `{ "success": false, "message": "Invalid email address" }`,
429 on rate limit.

### `reset_password.php`
| | |
|---|---|
| **Purpose** | Consume a reset token and set a new password |
| **Method** | POST |
| **URL** | `/Backend/reset_password.php` |
| **Auth** | None (the token itself is the credential) |
| **Rate limit** | 10 requests / 10 min, keyed by IP |

Request: `token=<64-hex-char token>&password=NewPassword1`
Validation: password ≥ 8 chars, at least one uppercase, one lowercase, one
digit (must match the frontend's zod schema).
Success: `{ "success": true, "message": "Password updated. You can now sign in." }`
Errors:
```json
{ "success": false, "message": "Invalid or missing reset token" }
{ "success": false, "message": "Password must be 8+ chars with upper, lower, and a number" }
{ "success": false, "message": "Invalid or expired reset token" }
{ "success": false, "message": "This reset link has expired" }
```
Effect: token is single-use — cleared (`reset_token = NULL`) immediately
after a successful reset.

---

## 4.2 Hardware Ingestion Endpoints (ESP32)

See `05_ESP32_INTEGRATION_GUIDE.md` for the full firmware-facing guide.
Both endpoints share the same auth pattern:

| | |
|---|---|
| **Auth** | Header `X-Device-Token: <DEVICE_INGEST_TOKEN>` **or** a logged-in session |

### `ingest_usage.php`
| | |
|---|---|
| **Purpose** | Report routine (non-leak) kitchen/washroom usage |
| **Method** | POST |
| **URL** | `/Backend/ingest_usage.php` |

Request (device-token path — `user_id` required; session path — omit
`user_id`, it's inferred from the session):
```
kitchen=12.5
washroom=8.0
recorded_at=2026-07-07 14:30:00   // optional; server time used if omitted
user_id=1                         // required only with X-Device-Token auth
```
At least one of `kitchen`/`washroom` must be present; both may be sent in
one call. Values must be ≥ 0.
Success (200):
```json
{ "success": true, "inserted": { "kitchen": 118, "washroom": 119 },
  "recorded_at": "2026-07-07 14:30:00", "total": 20.5 }
```
Errors:
```json
{ "success": false, "message": "user_id required" }                                     // 400
{ "success": false, "message": "Provide at least one of: kitchen, washroom (liters)" }   // 400
{ "success": false, "message": "Usage values must be >= 0" }                             // 400
{ "success": false, "message": "Not authenticated" }                                     // 401
```

### `ingest_leakage.php`
| | |
|---|---|
| **Purpose** | Record a leak event and trigger an email alert |
| **Method** | POST |
| **URL** | `/Backend/ingest_leakage.php` |

Request:
```
user_id=1                        // required only with X-Device-Token auth
volume=42.5
flow_rate=8.5                    // optional, defaults to volume
severity=High                    // Low | Medium | High | Critical (default Medium)
valve_status=Deactivated         // Activated | Deactivated (default Deactivated)
event_key=leak-2026-07-07-0431   // optional idempotency key
```
Success (event stored, email attempted):
```json
{ "success": true, "event_id": 118, "sent": true, "mail": "sent" }
```
Success (duplicate `event_key` — no new row, no new email):
```json
{ "success": true, "duplicate": true, "sent": false }
```
Errors:
```json
{ "success": false, "message": "user_id required" }   // 400
{ "success": false, "message": "Not authenticated" }  // 401
```

---

## 4.3 Read-Only, Frontend-Facing Endpoints

All require Session auth. All GET.

### `usage.php`
`GET /Backend/usage.php?period=current|week|lastWeek|month` (default `current`)
```json
{ "success": true, "period": "current", "kitchen": 12.5, "washroom": 8.0, "overall": 20.5 }
```

### `usage_trend.php`
`GET /Backend/usage_trend.php?period=week|month` (default `week`; `week`
= last 7 days, `month` = last 30 days, both as daily buckets)
```json
{ "success": true, "period": "week",
  "labels": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  "data": [12.5, 18.0, 9.5, 22.0, 15.5, 30.0, 20.5] }
```
`labels`/`data` are parallel arrays, gap-filled with `0` for days with no
readings — this is the same response the Dashboard's KPI cards consume.

### `leakage.php`
`GET /Backend/leakage.php?period=latest|week|month` (default `latest`;
`latest` returns at most 1 row, `week` up to 100, `month` up to 500 —
**ordered newest-first**, i.e. `events[0]` is always the most recent)
```json
{ "success": true, "period": "latest",
  "events": [ { "id": 118, "volume": 42.5, "time": "2026-07-07 14:31:00",
                "valveStatus": "Deactivated" } ] }
```

### `reports.php`
`GET /Backend/reports.php` — no query params; every figure is computed
live from `usage_readings`/`leakage_events` for the logged-in user.
```json
{ "success": true, "lastUpdated": "2026-07-07 14:31:00",
  "usage": { "today": 20.5, "week": 96.5, "month": 410.0, "baseline": 1600 },
  "leakage": { "totalVolume": 42.5, "events": 1, "percentage": 10.4, "currentStatus": "High" },
  "valve": { "currentStatus": "Open", "successfulClosures": 0, "responseSuccessRate": 0 },
  "efficiency": "Moderate",
  "recommendations": [ "Leakage is 10.4% of this month's usage — exceeds the safe threshold. Inspect plumbing immediately.",
                         "Valve response success rate is 0% — schedule valve maintenance.",
                         "Water usage is within the expected range.",
                         "Continue monitoring the system regularly." ] }
```
`percentage` and `responseSuccessRate` are `null` (not `0`) when there is
no usage/no leak events yet this month — the frontend renders that as `—`.

### `notification_history.php`
`GET /Backend/notification_history.php?limit=25` (default 25, max 100)
```json
{ "success": true, "history": [
    { "id": 42, "eventId": 118, "recipient": "user@example.com",
      "status": "sent", "message": "sent", "time": "2026-07-07 14:31:02",
      "severity": "High", "volume": 42.5 } ] }
```
`severity`/`volume` are `null` for non-leak entries (e.g. test emails).

### `notification_settings.php`
`GET /Backend/notification_settings.php`
```json
{ "success": true, "notification_email": "alerts@example.com", "notify_leakage": 1 }
```
`POST /Backend/notification_settings.php` — `notification_email=...&notify_leakage=1|0`
```json
{ "success": true, "message": "Notification preferences saved" }
```

### `test_email.php`
`POST /Backend/test_email.php` (no body needed) — rate-limited 5/10min per user.
```json
{ "success": true, "sent": true, "to": "user@example.com", "mail": "sent" }
```
`sent: false` with a diagnostic message in `mail` if SMTP failed; the
attempt is still logged to `notifications_log`.

### `export.php`
`GET /Backend/export.php?format=CSV|PDF` (default CSV) — **not JSON**.
Returns a file download (`Content-Disposition: attachment`) built directly
from a `SELECT ... FROM usage_readings WHERE user_id = ? ORDER BY
recorded_at DESC LIMIT 5000`. On error, returns HTTP 500 with a plain-text
body (`Content-Type: text/plain`) rather than JSON, since a partially
downloaded file can't be a JSON envelope.
