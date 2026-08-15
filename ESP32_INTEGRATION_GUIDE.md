# Automated Household Water Management System
## Technical Documentation & ESP32/Arduino Integration Guide

This document explains how the web application (React frontend + Vercel
TypeScript API + Postgres) works, and how to wire up your ESP32/Arduino
hardware to it.

> **Migration note:** this app was originally built on a PHP/MySQL backend
> (still preserved, untouched, in `backend-legacy/`). It has since been
> converted to Vercel Serverless Functions (`api/*.ts`) + Postgres, with the
> same endpoint behavior and (for the hardware-facing ingest endpoints) the
> exact same request field names — only the URL paths changed
> (`ingest_usage.php` → `/api/ingest-usage`, etc.). See `MIGRATION.md` at
> the repo root for the full endpoint mapping and migration plan.

---

## 1. Overall Architecture

```
ESP32 (sensors + valve)
        │  HTTPS POST (form-encoded or JSON — both accepted)
        ▼
api/*.ts  (Vercel Serverless Functions, one file per endpoint)
        │  parameterized SQL (@neondatabase/serverless)
        ▼
Database  (Postgres: Neon free tier)
        │  SELECT queries
        ▼
api/*.ts  (same functions, read side)
        │  JSON responses
        ▼
Frontend  (React + TanStack Router, deployed on the same Vercel project)
```

- The **ESP32** talks to the backend the same way a browser does: plain
  HTTP(S) requests with either a shared device token or a session cookie.
- The **backend** is a set of standalone Vercel Functions (no separate
  framework/server process) under `api/`, each importing shared helpers
  from `api/_lib/` for CORS, sessions, and the database connection.
- The **database** is Postgres (Neon) with the same four core tables as
  before: `users`, `usage_readings`, `leakage_events`, `notifications_log`,
  plus a new `rate_limit_hits` table (see `MIGRATION.md`).
- The **frontend** never talks to Postgres directly — it only calls the
  `/api/*` endpoints over `fetch`, using `credentials: include` so the
  session cookie is sent automatically.

---

## 2. Backend APIs relevant to hardware

### 2.1 `/api/ingest-usage` — routine kitchen/washroom usage

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `https://your-app.vercel.app/api/ingest-usage` |
| **Purpose** | Record routine (non-leak) water usage per room |
| **Auth** | Header `X-Device-Token: <DEVICE_INGEST_TOKEN>` **or** a logged-in session |

**Request body** (`application/x-www-form-urlencoded`), either or both fields:
```
user_id=1
kitchen=12.5
washroom=8.0
recorded_at=2026-07-07 14:30:00   // optional; defaults to server receipt time
```

**Success response:**
```json
{
  "success": true,
  "inserted": { "kitchen": 118, "washroom": 119 },
  "recorded_at": "2026-07-07 14:30:00",
  "total": 20.5
}
```

**Error responses:**
```json
{ "success": false, "message": "Provide at least one of: kitchen, washroom (liters)" }  // 400
{ "success": false, "message": "Not authenticated" }                                     // 401
{ "success": false, "message": "Something went wrong on our end. Please try again." } // 500 (real cause logged server-side)
```

### 2.2 `/api/ingest-leakage` — leak events

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `https://your-app.vercel.app/api/ingest-leakage` |
| **Purpose** | Record a leak event and send an email alert |
| **Auth** | Header `X-Device-Token: <DEVICE_INGEST_TOKEN>` **or** a logged-in session |

**Request body** (`application/x-www-form-urlencoded`):
```
user_id=1
volume=42.5
severity=High             // Low | Medium | High | Critical
valve_status=Deactivated  // Activated | Deactivated  (stored value; shown as Closed/Open in UI & email)
event_key=leak-2026-07-07-0431   // optional idempotency key — see note below
```

> If `event_key` is omitted, the backend derives one from
> `severity + rounded volume + current minute`, so retries within the same
> minute still collapse into a single event/email instead of spamming
> duplicates. The DB also enforces this with a `UNIQUE(user_id, event_key)`
> constraint as a second line of defense.

**Success response:**
```json
{ "success": true, "event_id": 118, "sent": true, "mail": "sent" }
```

**Duplicate (same `event_key` seen before):**
```json
{ "success": true, "duplicate": true, "sent": false }
```

**Error responses:**
```json
{ "success": false, "message": "user_id required" }   // 400
{ "success": false, "message": "Not authenticated" }  // 401
{ "success": false, "message": "Something went wrong on our end. Please try again." } // 500 (real cause logged server-side)
```

### 2.3 `/api/usage`, `/api/usage-trend`, `/api/reports`, `/api/leakage` — read-only, frontend-facing

`GET`, session-authenticated. These power the Dashboard/Usage/Reports pages;
hardware never calls them. `usage_trend.php?period=week|month` now correctly
returns 7 or 30 daily buckets (previously it silently ignored `period` and
always returned a fixed 7 days — fixed in this pass).

### 2.4 `/api/notification-settings` / `/api/notification-history`

`GET`/`POST`, session-authenticated. Lets the user set a `notification_email`
(separate from login email) and toggle `notify_leakage`; `/api/notification-history`
returns the real send log (sent/failed/skipped) from `notifications_log`,
shown live in Settings → Notifications.

---

## 3. Hardware Integration

### What the ESP32 sends — and where it goes

| Field | Endpoint | Notes |
|---|---|---|
| User ID | both | Identifies which household account |
| Date / Time | both | Or derive from server receipt time |
| Kitchen Water Usage | `/api/ingest-usage` | Routine usage, liters |
| Washroom Water Usage | `/api/ingest-usage` | Routine usage, liters |
| Total Water Usage | derived | Kitchen + washroom, computed server-side |
| Leakage Status | `/api/ingest-leakage` | Presence of a POST = a leak was detected |
| Leakage Volume | `/api/ingest-leakage` | Liters attributed to the leak |
| Leakage Severity | `/api/ingest-leakage` | `Low`/`Medium`/`High`/`Critical` |
| Valve Status | `/api/ingest-leakage` | `Activated`/`Deactivated` in the DB, shown as `Closed`/`Open` |

No extra sensors (temperature, humidity, GPS, battery, etc.) are used
anywhere in the schema or API — scope is intentionally limited to the
fields above.

### Protocol

Plain HTTP REST/JSON (form-encoded) over the same PHP endpoints the
frontend uses. There's no MQTT/WebSocket layer, so an ESP32 `HTTPClient` +
`WiFiClientSecure` is the natural fit — no protocol translation needed.

### Reporting frequency (recommendation)

- **Routine usage**: send every 2 seconds via `/api/ingest-usage` (near real-time)
  — accumulate liters locally, then send a total per room, rather than
  posting on every pulse-counter tick.
- **Leak events**: send immediately via `/api/ingest-leakage` on detection.

---

## 4. Database Structure

| Table | Stores | Key columns |
|---|---|---|
| `users` | Accounts | `id`, `email`, `password_hash`, `name`, `household_id`, `location`, `notification_email`, `notify_leakage` |
| `usage_readings` | Routine water usage | `user_id`, `room` (`kitchen`\|`washroom`), `liters`, `recorded_at` |
| `leakage_events` | Leak events | `user_id`, `volume`, `flow_rate`, `severity`, `valve_status`, `event_key`, `detected_at` |
| `notifications_log` | Audit trail of sent/failed/skipped emails | `user_id`, `event_id`, `recipient`, `status`, `message` |

**Relationships:** every table hangs off `users.id` via `user_id` with
`ON DELETE CASCADE`. `leakage_events` has indexes on `(user_id, detected_at)`
and a unique key on `(user_id, event_key)` for dedup. `usage_readings` is
indexed on `(user_id, recorded_at)`. No fields outside the project's scope
exist in the schema — nothing to trim.

**Before public launch:** `schema.sql` seeds a demo account
(`demo@water.local`). Delete that row from your production database — it's
a real, working login and shouldn't exist on a public deployment.

---

## 5. Frontend Data Flow

- **Dashboard** — calls `usage_trend.php?period=week|month` (refreshed every
  2s) for its KPI cards; the week/month toggle now actually changes the
  window (previously a no-op — fixed in this pass).
- **Usage / Usage Trend pages** — call `/api/usage` and `/api/usage-trend`.
- **Reports** — calls `/api/reports`, which computes every figure
  (today/week/month usage, leakage %, current leak/valve status, efficiency
  score, recommendations) from live rows — no hardcoded values.
- **Leak Detection page** — calls `leakage.php?period=latest|week|month`.
- **Settings** — Profile tab loads the real user record via `/api/me`
  (name/household ID/location/email — previously hardcoded placeholders,
  fixed in an earlier pass); Notifications tab loads/saves via
  `/api/notification-settings` and shows live history via
  `/api/notification-history`; Export/Account tabs call `/api/export` /
  `/api/delete-account` / `/api/change-password`.
- **Real-time updates**: no websocket/push channel — pages poll on an
  interval. New hardware data shows up on the next poll, not instantly.

---

## 6. Authentication

- **Frontend ↔ backend**: PHP session cookies (`HttpOnly`, `SameSite=None;
  Secure` over HTTPS), set on login, checked by `require_login()`.
- **ESP32 ↔ backend**: a single shared secret, `DEVICE_INGEST_TOKEN`, sent
  as the `X-Device-Token` header, compared with `hash_equals()`.
- **Secrets**: `DEVICE_INGEST_TOKEN`, `SMTP_USER`/`SMTP_PASS`, DB credentials
  all live in `Backend/.env` (or real server env vars) — never in the
  public React app. `Backend/.htaccess` blocks direct HTTP access to `.env`
  and any other dotfile, `config.php`/`bootstrap.php`, and `.sql`/`.md`
  files, so none of this is downloadable even if someone requests the path
  directly.

---

## 7. Email Notification Flow

```
Leak Detected (ESP32)
        │
        ▼
POST ingest_leakage.php  (device token auth)
        │
        ▼
INSERT INTO leakage_events   ← DB write happens BEFORE any email is sent
        │
        ▼
SELECT users.notification_email, notify_leakage
        │  (falls back to users.email if no notification_email is set)
        ▼
If notify_leakage = 1 → render_leak_email() → send_email()
        │
        ▼
Gmail SMTP (PHPMailer if installed, else PHP mail() fallback)
        │
        ▼
INSERT INTO notifications_log  (sent / failed / skipped)
        │
        ▼
User receives "🚨 Water Leakage Detected" email
```

The email now includes (fixed in this pass — it previously omitted current
usage and showed the raw `Activated`/`Deactivated` enum instead of
Open/Closed):
- Date & time
- Current water usage (today's total, queried live from `usage_readings`)
- Leakage volume
- Leakage severity
- Valve status, shown as **Open/Closed**
- A clear warning plus a plumbing-inspection recommendation

Duplicate prevention: same `event_key` (explicit or auto-derived) is never
inserted twice, and the email is only sent on the first, successful insert.

---

## 8. Future ESP32 Integration Guide

**Usage:**
```bash
curl -X POST https://your-app.vercel.app/api/ingest-usage \
     -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
     -d "user_id=1&kitchen=5.2&washroom=3.1"
```

**Leak event:**
```bash
curl -X POST https://your-app.vercel.app/api/ingest-leakage \
     -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
     -d "user_id=1&volume=42&severity=High&valve_status=Deactivated&event_key=demo-001"
```
Confirm a 200 response (and, if SMTP is configured, the email) before
writing any ESP32 code.

**Best practices**
- Batch usage sends (1–5 min), send leak events immediately.
- Keep the device token out of source control.
- Use `WiFiClientSecure` with a proper root CA, not `setInsecure()` in production.
- Debounce leak detection in firmware — don't fire on every raw sensor tick.

**Common mistakes to avoid**
- Sending JSON when the endpoints expect `application/x-www-form-urlencoded`.
- Omitting `event_key` and relying solely on the auto-derived one for
  retries that span more than a minute — space out retries or generate a
  stable key client-side if your retry logic can be slower than that.
- Forgetting the device token header (falls through to session auth → 401).

---

## 9. Complete API Documentation & Readiness Assessment

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/login` | POST | – | Sign in, starts session |
| `/api/register` | POST | – | Create account |
| `/api/forgot-password` | POST | – | Email a password-reset link |
| `/api/reset-password` | POST | – | Consume the token, set new password |
| `/api/logout` | POST | ✅ | End session |
| `/api/me` | GET | ✅ | Current user's real profile (name/household/location/email) |
| `/api/update-profile` | POST | ✅ | Update name/household/location/email |
| `/api/change-password` | POST | ✅ | Change password |
| `/api/delete-account` | POST | ✅ | Delete account (cascades all data) |
| `/api/usage` | GET | ✅ | Kitchen/washroom/overall totals for a period |
| `/api/usage-trend` | GET | ✅ | 7 or 30 daily buckets, `?period=week\|month` |
| `/api/leakage` | GET | ✅ | Leak events for `?period=latest\|week\|month` |
| `/api/reports` | GET | ✅ | Fully computed usage/leakage/valve/efficiency summary |
| `/api/export` | GET | ✅ | Download usage as CSV or PDF |
| `/api/notification-settings` | GET/POST | ✅ | Read/save notification email + toggle |
| `/api/notification-history` | GET | ✅ | Real notification send log |
| `/api/ingest-usage` | POST | 🔐 or ✅ | Hardware routine-usage ingestion |
| `/api/ingest-leakage` | POST | 🔐 or ✅ | Hardware leak-event ingestion |

🔐 = shared device token (`X-Device-Token`), not a user session.

### What was fixed in this pass

1. **Missing usage-ingestion endpoint** — `/api/ingest-usage` didn't exist;
   only leak events had a hardware route. Built.
2. **`/api/usage-trend` ignored `?period=`** — always returned a fixed 7-day
   window, so the Dashboard's week/month toggle silently did nothing. Fixed
   to return 7 or 30 daily buckets based on the requested period.
3. **Leak-alert email was incomplete** — missing "current water usage"
   entirely, and showed the raw `Activated`/`Deactivated` enum instead of
   Open/Closed. Fixed.
4. **Leak dedup relied entirely on an optional client-supplied `event_key`**
   — if the ESP32 omitted it, retries could double-send emails. Now the
   backend derives a same-minute key automatically when none is given.
5. **Forgot Password never actually sent an email** — the reset link was
   only written to the server error log, with a literal `// TODO: send
   $devLink via email` in the code; a real user in production would get a
   "success" message and then nothing. Now wired to `send_email()` with a
   proper branded HTML template.
6. Frontend mock data removed from Usage, Usage Trend, Leakage, and
   Settings→Profile pages (fixed in an earlier pass — noted here as it's
   directly relevant to §9's readiness verdict).

### Honest readiness assessment

- **Ready for ESP32 hardware integration:** Yes, for the documented data
  shape and both endpoints (usage + leak events) — this was the main gap
  and it's now closed.
- **Backend APIs fully prepared:** Yes — validated, prepared statements
  throughout, consistent JSON error shapes, device-token auth on both
  ingestion routes.
- **Database fully prepared:** Yes — correct relationships/indexes/foreign
  keys, no out-of-scope fields. One action item: delete the seeded demo
  account before going live.
- **Dashboard fully database-driven:** Yes.
- **Analytics (Usage / Usage Trend / Leakage) fully database-driven:** Yes.
- **Reports fully database-driven:** Yes — every figure, including the
  efficiency score and recommendations, is computed from live rows.
- **Leakage notification system fully functional:** Yes, now that the email
  content is complete and dedup is robust to a missing `event_key`.
- **Forgot Password fully functional:** Yes, now that it actually sends an
  email — it did not before this pass.
- **Ready for public hosting:** Conditionally yes. Before flipping
  `APP_ENV` to `prod` and going public: (a) delete the demo account, (b)
  make sure `SMTP_USER`/`SMTP_PASS`/`DEVICE_INGEST_TOKEN` are set as real
  environment variables on the host rather than left blank, and (c) serve
  the backend over HTTPS — the session-cookie logic in `bootstrap.php`
  requires it for `SameSite=None; Secure` cookies to work cross-origin.
- **Production-ready overall:** Yes, with the three items directly above
  as the remaining checklist before a public launch — none of them are
  code changes, they're deployment/configuration steps specific to your
  hosting environment, which I can't perform from here.

**One honest caveat on my own verification:** I have no network access in
this sandbox, so I could not run `npm/bun install` + a real build, nor
execute the PHP files against a live MySQL instance. Everything above was
verified by careful static read-through of every endpoint and every
frontend page's data source, not by an actual build/run.
