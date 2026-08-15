# Migration: PHP/MySQL Backend → Vercel-Compatible Backend

This document is the full record of the conversion: what was found in the
repository, what changed, and exactly how to test and deploy the result.
The original PHP backend is untouched at `backend-legacy/` — nothing was
deleted.

---

## 1. Current System Analysis

**Frontend:** React + TypeScript + Vite + TanStack Router/Start, calling a
PHP backend via `fetch()` from `src/lib/api.ts` (`postForm` /
`getJson` helpers). It uses TanStack Start as an SSR shell, but **no route
in this app uses server-side loaders or `createServerFn`** — every data
call happens client-side via `fetch`. That's what makes it safe to add a
plain `/api` folder of Vercel Serverless Functions alongside the existing
frontend without touching its routing or components.

**Backend:** standalone PHP scripts, one per endpoint, each including a
shared `bootstrap.php` for CORS + PHP sessions + a PDO/MySQL connection,
using prepared statements throughout.

**Database:** MySQL/MariaDB, 4 tables — `users`, `usage_readings`,
`leakage_events`, `notifications_log` — plus a `reset_token`/`reset_expires`
pair on `users` for password resets.

**Auth:** PHP server-side sessions (`$_SESSION`, cookie holds only a
session ID). Passwords hashed with `password_hash()` (bcrypt, `$2y$`
prefix). Password reset via a random token + 1-hour expiry stored on the
user row.

**ESP32:** posts form-encoded `application/x-www-form-urlencoded` requests
directly to `ingest_usage.php` / `ingest_leakage.php`. The repository's own
`ingest_leakage.php` had the `X-Device-Token` check **commented out** for
demo purposes — a real security gap, flagged and fixed in the new backend
(§6, ESP32).

**Email:** PHPMailer over Gmail SMTP (App Password), sending styled HTML
for leak alerts, password resets, and test emails.

---

## 2. PHP Endpoint Mapping

| PHP endpoint | New Vercel endpoint | Method | Auth | Purpose |
|---|---|---|---|---|
| `login.php` | `/api/login` | POST | – | Sign in, sets session cookie |
| `register.php` | `/api/register` | POST | – | Create account |
| `logout.php` | `/api/logout` | POST | – | Clear session cookie |
| `me.php` | `/api/me` | GET | session | Current user profile |
| `forgot_password.php` | `/api/forgot-password` | POST | – | Email a reset link |
| `reset_password.php` | `/api/reset-password` | POST | – | Consume token, set new password |
| `change_password.php` | `/api/change-password` | POST | session | Change password |
| `update_profile.php` | `/api/update-profile` | POST | session | Update name/household/location/email |
| `delete_account.php` | `/api/delete-account` | POST | session | Delete account (cascades all data) |
| `usage.php` | `/api/usage` | GET | session | Kitchen/washroom/overall totals for a period |
| `usage_trend.php` | `/api/usage-trend` | GET | session | 7 or 30 daily buckets |
| `leakage.php` | `/api/leakage` | GET | session | Leak events for a period |
| `reports.php` | `/api/reports` | GET | session | Computed usage/leak/valve/efficiency summary |
| `export.php` | `/api/export` | GET | session | Download usage as CSV/PDF |
| `notification_settings.php` | `/api/notification-settings` | GET/POST | session | Read/save notification prefs |
| `notification_history.php` | `/api/notification-history` | GET | session | Notification send log |
| `ingest_usage.php` | `/api/ingest-usage` | POST | device token or session | ESP32 routine usage ingestion |
| `ingest_leakage.php` | `/api/ingest-leakage` | POST | device token or session | ESP32 leak-event ingestion + email |
| `test_email.php` | `/api/test-email` | POST | session | Send a diagnostic test email |

**Request bodies are unchanged** — every endpoint accepts the exact same
field names as before. The ESP32 ingestion endpoints still accept
`application/x-www-form-urlencoded` bodies (Vercel parses them
automatically), so **no ESP32 firmware body-encoding changes are needed** —
only the URL path.

**JSON response shapes are unchanged** wherever practical (e.g.
`{ "success": true, "data": {...} }`-style envelopes are preserved field
for field) — see each `api/*.ts` file for the exact shape, which mirrors
its PHP predecessor.

---

## 3. Database Analysis

Original MySQL tables → Postgres equivalents (see
`database/schema.postgres.sql` for the full, commented DDL):

| Table | Preserved | Notes |
|---|---|---|
| `users` | ✅ all columns | `password_hash` stays bcrypt-compatible |
| `usage_readings` | ✅ all columns, FK, index | `room` ENUM → Postgres native enum |
| `leakage_events` | ✅ all columns, FK, index, UNIQUE(user_id, event_key) | `severity`/`valve_status` ENUMs → native enums |
| `notifications_log` | ✅ all columns, FKs, index | `status` ENUM → native enum |
| *(new)* `rate_limit_hits` | — | Replaces PHP's file-based rate limiter (Vercel functions share no local disk) |

**Why Postgres (Neon) instead of MySQL:** Vercel Functions are stateless
and short-lived; a traditional MySQL connection pool would exhaust the
database's connection limit under load. Neon is serverless Postgres with a
free tier and an HTTP-based driver (`@neondatabase/serverless`) built for
exactly this. Full reasoning and a MySQL-compatible alternative
(PlanetScale) are documented in `database/README.md`.

**Migration path** (only needed if you have real data already):
1. Apply `database/schema.postgres.sql` to a new Neon database.
2. Run `database/migrate-data.mjs` to copy every row from your existing
   MySQL database, preserving IDs and relationships (read-only against
   MySQL, safe to run ahead of cutover).

Full instructions: `database/README.md`.

---

## 4. Architecture

```
                         Vercel (one project)
                 ┌─────────────────────────────────┐
Browser  ───────►│  React frontend (static build)   │
                 │  api/*.ts  (Serverless Functions) │──────► Postgres (Neon)
ESP32    ───────►│  (X-Device-Token auth)            │
                 └─────────────────────────────────┘
```

Frontend and API are deployed together as one Vercel project, so browser
calls to `/api/*` are same-origin — no CORS needed for the normal case.
CORS headers (`api/_lib/http.ts`) exist for local development and for a
frontend hosted on a separate domain, controlled by `ALLOWED_ORIGINS`.

---

## 5. Migration Plan (what was actually done)

1. Inspected the full repository: every PHP file, `schema.sql`,
   `bootstrap.php`, `mailer.php`, and every `fetch` call site in the React
   app.
2. Copied `Backend/` to `backend-legacy/` (untouched, kept as a safety net
   — nothing was deleted).
3. Built `api/_lib/` — shared helpers replacing what `bootstrap.php` did:
   `db.ts` (Postgres connection), `auth.ts` (JWT session cookies, replacing
   PHP `$_SESSION`), `password.ts` (bcrypt, PHP-hash compatible),
   `rateLimit.ts` (DB-backed, replacing the file-based limiter),
   `device.ts` (ESP32 token auth), `http.ts` (CORS, JSON, error handling,
   CSRF header check), `mailer.ts` (Gmail SMTP via nodemailer, same free
   setup, with Resend as a documented fallback), `dates.ts`.
4. Ported every PHP endpoint to a matching `api/*.ts` file (§2), preserving
   field names, response shapes, and business logic (report scoring
   thresholds, leak dedup logic, etc. — logic ported as-is, not redesigned).
5. Wrote `database/schema.postgres.sql` (schema) and
   `database/migrate-data.mjs` (data migration).
6. Updated `src/lib/api.ts` to call `/api/*` (same-origin by default) and
   send JSON bodies; updated the ~11 route/hook files that referenced
   `*.php` filenames to use the new endpoint names (one-line-per-file
   changes only — no UI/component changes).
7. Added `@neondatabase/serverless`, `bcryptjs`, `jose`, `cookie`,
   `nodemailer` to `package.json`, plus `@vercel/node` and matching
   `@types/*` as dev dependencies.
8. Restored proper ESP32 device-token authentication (it was disabled in
   the existing `ingest_leakage.php` — see §6).

---

## 6. Security Review

Issues checked, and how each is handled in the new backend:

- **SQL injection** — every query uses the `sql` tagged-template client
  (`@neondatabase/serverless`); values are always sent as parameters, never
  string-concatenated.
- **Auth bypass** — every session-protected endpoint calls `requireLogin()`
  first and returns before touching the database if it fails.
- **Password handling** — bcrypt via `bcryptjs`; PHP's `$2y$` hashes verify
  correctly (normalized to `$2b$` internally) so existing users don't need
  a forced reset; new hashes stored the same way.
- **Device authentication** — **restored**. The existing
  `ingest_leakage.php` had `X-Device-Token` checking commented out; the new
  `/api/ingest-usage` and `/api/ingest-leakage` require either a valid
  `X-Device-Token` (compared against `DEVICE_INGEST_TOKEN`, a server-only
  env var — never in a `VITE_*` variable) or a logged-in session.
- **User ID manipulation** — a session-authenticated request always writes
  to *its own* `userId` from the verified JWT; a client-supplied `user_id`
  in the body is only honored for device-token requests (matching the
  original ESP32 firmware contract, where a device reports for a known
  household). If you provision multiple households, give each device its
  own token mapped server-side to a fixed `user_id` instead of trusting a
  client-supplied one.
- **CORS** — `Access-Control-Allow-Origin` is never `*`; it echoes back
  only an origin present in `ALLOWED_ORIGINS`.
- **Exposed secrets** — all secrets live in server-only env vars
  (`DATABASE_URL`, `JWT_SECRET`, `DEVICE_INGEST_TOKEN`, `SMTP_*`). Nothing
  secret is prefixed `VITE_*`, so nothing secret is bundled into the
  frontend.
- **Reset tokens** — random 32-byte hex, 1-hour expiry, single-use
  (cleared on success), never returned in any response except a
  `dev_reset_link` field that's only included outside production
  (`VERCEL_ENV !== "production"`).
- **Error messages** — `serverError()` logs the real error server-side but
  returns a generic message to the client in production; the real message
  is included only in non-production environments.
- **Rate limiting** — DB-backed, applied to login, forgot-password,
  reset-password, and test-email.
- **CSRF** — state-changing session-authenticated endpoints require the
  `X-Requested-With: XMLHttpRequest` header (can't be set by a bare HTML
  form submission), same defense as the original app.

---

## 7. Testing Checklist

Run these against a local `vercel dev` or the deployed URL. Each row is a
manual check; automate with your tool of choice if you'd like a script.

| # | Test | Expected |
|---|---|---|
| 1 | `POST /api/register` with a new email/password | `{"success":true}`, row appears in `users` |
| 2 | `POST /api/register` with the same email again | `{"success":false}`, duplicate rejected |
| 3 | `POST /api/login` with correct credentials | `Set-Cookie: whms_session=...`, `{"success":true,"user":{...}}` |
| 4 | `POST /api/login` with wrong password | `{"success":false}`, no cookie set |
| 5 | `GET /api/me` with the session cookie | Returns the logged-in user |
| 6 | `GET /api/me` with no cookie | `{"success":false,"user":null}` |
| 7 | `POST /api/ingest-usage` with valid `X-Device-Token` | `{"success":true,"inserted":{...}}` |
| 8 | `POST /api/ingest-usage` with a wrong/missing token and no session | `401` |
| 9 | `POST /api/ingest-leakage` with valid token | `{"success":true,"event_id":...}`, email sent (check `notifications_log`) |
| 10 | `GET /api/usage?period=current` | Correct kitchen/washroom/overall totals |
| 11 | `GET /api/usage-trend?period=week` | 7 labels + 7 data points |
| 12 | `GET /api/leakage?period=latest` | Most recent event only |
| 13 | `GET /api/reports` | Fully computed summary, no errors |
| 14 | `GET /api/notification-settings` then `POST` an update | Read reflects the write |
| 15 | `GET /api/notification-history` | Matches rows in `notifications_log` |
| 16 | `POST /api/forgot-password` with a real email | Email sent (or `dev_reset_link` outside prod) |
| 17 | `POST /api/reset-password` with that token | Password changes, token cleared, old token now rejected |
| 18 | `GET /api/export?format=CSV` and `?format=PDF` | Correct `Content-Disposition`, valid file |
| 19 | Try any session endpoint from an origin **not** in `ALLOWED_ORIGINS`, in a browser | Blocked by CORS |
| 20 | Kill `DATABASE_URL` temporarily and hit any endpoint | `500` with a generic message, real error only in Vercel logs |
| 21 | `POST /api/login` 11 times in a row | 11th request returns `429` |
| 22 | Deploy to Vercel, run tests 1–21 again against the production URL | Same results |

Also explicitly re-test the two integration paths end to end:
- **React → API**: log in, view dashboard/usage/leakage/reports/settings,
  export a CSV, change notification settings, log out.
- **ESP32 → API**: point real (or `curl`-simulated) hardware at
  `/api/ingest-usage` and `/api/ingest-leakage` with the device token and
  confirm data appears on the dashboard and a leak email arrives.

---

## 8. Deployment Instructions

### 8.1 Create the database

1. Go to <https://neon.tech>, sign up free, create a project.
2. Copy the connection string (`postgres://...`) — this is your
   `DATABASE_URL`.
3. Apply the schema:
   ```bash
   psql "$DATABASE_URL" -f database/schema.postgres.sql
   ```
   (No `psql`? Paste the file's contents into Neon's built-in SQL editor
   instead.)

### 8.2 Migrate existing data (skip if starting fresh)

```bash
npm install mysql2 pg --no-save
MYSQL_URL="mysql://user:pass@host:3306/water_management" \
DATABASE_URL="postgres://user:pass@host/neondb?sslmode=require" \
node database/migrate-data.mjs
```

### 8.3 Install dependencies

```bash
npm install
```

### 8.4 Set environment variables

Copy `.env.example` to `.env` for local dev (`vercel dev` reads it
automatically), and set the same variables in the Vercel dashboard for
production:

Vercel → your project → **Settings → Environment Variables**, add:
- `DATABASE_URL`
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DEVICE_INGEST_TOKEN` — generate the same way
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
  `MAIL_FROM_NAME` (Gmail App Password — see `.env.example` for the setup
  steps)
- `ALLOWED_ORIGINS` (optional — only if the frontend will be on a
  different domain than the API)
- `FRONTEND_URL` (optional fallback for reset-link generation)

### 8.5 Connect GitHub to Vercel

1. Push this repository to GitHub.
2. Go to <https://vercel.com/new>, choose **Import Git Repository**, select
   your repo.
3. Vercel auto-detects the frontend framework and the `api/` folder — no
   custom build command is required for the setup in this repo.
4. Click **Deploy**.

### 8.6 Deploy

Every push to your default branch redeploys automatically. For a manual
deploy from your machine:

```bash
npm install -g vercel
vercel login
vercel --prod
```

### 8.7 Obtain the production API URL

After deploy, Vercel gives you a URL like `https://your-app.vercel.app`.
Both the frontend and `/api/*` are served from that same domain — that's
also the URL the ESP32 should point at (`https://your-app.vercel.app/api/ingest-usage`).

### 8.8 Update the React frontend

Nothing to do — `VITE_API_BASE_URL` is left unset in production, so the
frontend calls same-origin `/api/*` automatically.

### 8.9 Update the ESP32 firmware

Only the base URL and endpoint paths change (body format is unchanged):

```cpp
// Before:
// POST https://your-domain.com/Backend/ingest_usage.php
// After:
POST https://your-app.vercel.app/api/ingest-usage

// Before:
// POST https://your-domain.com/Backend/ingest_leakage.php
// After:
POST https://your-app.vercel.app/api/ingest-leakage
```

Keep sending `X-Device-Token: <DEVICE_INGEST_TOKEN>` and the same
form-encoded body fields — nothing else changes. See
`ESP32_INTEGRATION_GUIDE.md` for the full field reference and `curl`
examples you can test with before touching firmware.

### 8.10 Test the production system

Work through the checklist in §7 again against the live
`https://your-app.vercel.app` URL.

---

## 9. Final Check

- [ ] Frontend loads and renders all pages (dashboard, usage, leakage,
      reports, settings, auth screens) with no UI changes
- [ ] `/api/*` responds correctly for every endpoint in §2
- [ ] Postgres (Neon) is reachable and the schema matches §3
- [ ] Login/logout/register/forgot-password/reset-password all work
- [ ] `/api/ingest-usage` accepts device-token requests and stores readings
- [ ] `/api/ingest-leakage` accepts device-token requests, stores the
      event, and sends an email
- [ ] ESP32 (or `curl` simulating it) successfully posts to both ingest
      endpoints using only an updated URL
- [ ] Notification settings/history and leak-alert emails work end to end
- [ ] Reports page renders a full computed summary with no errors
- [ ] Production deployment on Vercel serves both frontend and API from
      the same domain, with no PHP runtime involved anywhere
