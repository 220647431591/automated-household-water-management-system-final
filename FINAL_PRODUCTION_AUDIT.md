# Final Production Audit — Automated Household Water Management System

Method: every file under `api/`, `api/_lib/`, `src/`, `database/`, plus
config files (`vercel.json`, `package.json`, `.env.example`, `.gitignore`,
`vite.config.ts`) was opened and read. Every frontend `fetch`/`postJson`/
`getJson` call site was matched against its corresponding `api/*.ts`
handler, field-by-field. Every SQL query was matched against
`database/schema.postgres.sql`, column-by-column. Authorization was traced
per-endpoint to confirm no route trusts a client-supplied `user_id` for a
session request. **This audit could not run `npm run build`, `vercel dev`,
or hit a live database — no network access in this environment.** Anything
that requires that is marked ⏳ or ⚠️ below, never ✅.

## A. Overall Status

**ALMOST READY — MINOR FIXES**

The application-layer code (frontend ↔ API ↔ database ↔ auth ↔ email) is
internally consistent and correctly wired — no broken connections were
found there. Two real problems were found and fixed (see D/E). One
structural item (E, #3) needs a live Vercel build to fully verify — it
appears correctly configured for zero-config Vercel deployment, but that
can't be proven from static review alone.

## B. Complete Connection Matrix

| Feature | Frontend | API | Database | External service | Status |
|---|---|---|---|---|---|
| Register | `register.tsx` → `postJson("register", {email,password})` | `api/register.ts` | `users` (INSERT) | – | ✅ VERIFIED |
| Login | `index.tsx` → `postJson("login", {email,password})` | `api/login.ts` | `users` (SELECT, opportunistic rehash) | – | ✅ VERIFIED |
| Logout | `useAuth.tsx` → `postJson("logout", {})` | `api/logout.ts` | – | – | ✅ VERIFIED |
| Current user | `useAuth.tsx` → `getJson("me")` | `api/me.ts` | `users` (SELECT by session id) | – | ✅ VERIFIED |
| Forgot password | `forgot-password.tsx` → `postJson("forgot-password",{email})` | `api/forgot-password.ts` | `users` (token/expiry UPDATE) | SMTP/Resend | ✅ VERIFIED (logic) / ⏳ needs real mail credentials |
| Reset password | `reset-password.tsx` → `postJson("reset-password",{token,password})` | `api/reset-password.ts` | `users` (UPDATE, clears token) | – | ✅ VERIFIED |
| Dashboard | `dashboard.tsx` → `getJson("usage-trend")` | `api/usage-trend.ts` | `usage_readings` | – | ✅ VERIFIED |
| Kitchen/washroom usage | `usage.tsx` → `getJson("usage",{period})` | `api/usage.ts` | `usage_readings` (GROUP BY room) | – | ✅ VERIFIED |
| Total usage | same as above (`overall` field) | `api/usage.ts` | `usage_readings` | – | ✅ VERIFIED |
| Usage history / trends | `usage-trend.tsx` → `getJson("usage-trend")` | `api/usage-trend.ts` | `usage_readings` (DATE-bucketed) | – | ✅ VERIFIED |
| Daily average / peak usage | computed client-side from trend data in `dashboard.tsx`/`usage-trend.tsx` | `api/usage-trend.ts` | `usage_readings` | – | ✅ VERIFIED |
| Leakage detection / history | `leakage.tsx` → `getJson("leakage",{period})` | `api/leakage.ts` | `leakage_events` | – | ✅ VERIFIED |
| Leakage volume / severity | same | `api/leakage.ts`, `api/ingest-leakage.ts` | `leakage_events` | – | ✅ VERIFIED |
| Valve status | `leakage.tsx`, `reports.tsx` | `api/leakage.ts`, `api/reports.ts` | `leakage_events.valve_status` | – | ✅ VERIFIED |
| Reports | `reports.tsx` → `getJson("reports")` | `api/reports.ts` | `usage_readings`, `leakage_events` | – | ✅ VERIFIED |
| Export (CSV/PDF) | `settings.tsx` → `downloadUrl("export",{format})` | `api/export.ts` | `usage_readings` | – | ✅ VERIFIED |
| Notification settings | `settings.tsx` → `getJson`/`postJson("notification-settings")` | `api/notification-settings.ts` | `users.notification_email`, `notify_leakage` | – | ✅ VERIFIED |
| Notification history | `settings.tsx` → `getJson("notification-history",{limit})` | `api/notification-history.ts` | `notifications_log` JOIN `leakage_events` | – | ✅ VERIFIED |
| Leakage email | `api/ingest-leakage.ts` (server-triggered, no frontend call) | `api/ingest-leakage.ts` | `notifications_log` (INSERT) | SMTP/Resend | ✅ VERIFIED (logic) / ⏳ needs real mail credentials |
| ESP32 usage ingestion | ESP32 firmware → HTTPS POST | `api/ingest-usage.ts` | `usage_readings` (INSERT) | – | ✅ VERIFIED |
| ESP32 leakage ingestion | ESP32 firmware → HTTPS POST | `api/ingest-leakage.ts` | `leakage_events` (INSERT) | SMTP/Resend | ✅ VERIFIED |
| Device authentication | `X-Device-Token` header | `api/_lib/device.ts` | – | – | ✅ VERIFIED |
| User authorization (no cross-user access) | all session routes | `requireLogin()` in every handler | every query filters `WHERE user_id = <session id>` | – | ✅ VERIFIED |
| Frontend deploy / build target | — | `vite.config.ts`, `.output/` (removed, see D3) | – | Vercel | ⚠️ NOT FULLY VERIFIED — see D3/F |

## C. Confirmed Working

- **Frontend → API contract**: every `postJson`/`getJson` call site in
  `src/routes/*.tsx` and `src/hooks/useAuth.tsx` was matched field-by-field
  against its `api/*.ts` handler. All field names, methods, and response
  shapes (`{success, ...}`) line up exactly — no mismatches found.
- **API → Database contract**: every SQL query in `api/*.ts` was checked
  against `database/schema.postgres.sql`. All table names, column names,
  and types match (including the `room_type`, `severity_type`,
  `valve_status_type`, `notif_status_type` Postgres enums). All queries use
  the `sql` tagged-template client — parameterized, not string-concatenated
  — so they're SQL-injection safe by construction.
- **Authentication end-to-end**: register → bcrypt hash → login → verify →
  signed JWT cookie (`httpOnly`, `Secure` in production, `SameSite=lax`) →
  `/api/me` reads and verifies it → logout clears it. Legacy PHP `$2y$`
  bcrypt hashes are detected and transparently rehashed to `$2b$` on first
  successful login, so migrated users don't need a forced reset.
- **Password reset**: random 32-byte token, 1-hour expiry, stored on
  `users.reset_token`/`reset_expires`, single-use (cleared on success),
  never returned to the client except a `dev_reset_link` field that's
  explicitly gated to non-production (`VERCEL_ENV !== "production"`).
- **Authorization**: every session-protected endpoint calls
  `requireLogin()` first and returns a `401` before touching the database
  if it fails. Every query then filters by the **session-derived** user id
  — never a client-supplied one. The only place a client-supplied `user_id`
  is honored is the device-token path in `ingest-usage`/`ingest-leakage`
  (by design — see ESP32 section below), and a session request explicitly
  cannot use a client-supplied `user_id` even there
  (`auth.authenticatedAs === "session" ? auth.sessionUserId! : bodyUserId`).
- **ESP32 → API**: `X-Device-Token` is compared against
  `DEVICE_INGEST_TOKEN` (a server-only env var); a missing/wrong token with
  no valid session correctly returns `401`. Field names in
  `ESP32_INTEGRATION_GUIDE.md` (`user_id`, `kitchen`, `washroom`,
  `recorded_at`, `volume`, `severity`, `valve_status`, `event_key`) match
  `api/ingest-usage.ts`/`api/ingest-leakage.ts` exactly. Leak-event
  deduplication via `event_key` (explicit or auto-derived) plus the
  database's `UNIQUE(user_id, event_key)` constraint prevents duplicate
  emails from retried requests.
- **Units**: all usage figures are stored and returned consistently in
  liters (`NUMERIC(10,2)`) — no mixed-unit or unlabeled-unit fields found.
- **Error handling**: `serverError()` logs the real error server-side but
  returns a generic message to the client; the real message (`debug` field)
  is only included when `VERCEL_ENV !== "production"`. No endpoint leaks
  SQL text, stack traces, or file paths in a production response.
- **CORS**: `Access-Control-Allow-Origin` is never `*` — it only echoes an
  origin present in `ALLOWED_ORIGINS` (or the safe localhost defaults).
- **CSRF**: state-changing session endpoints (`change-password`,
  `update-profile`, `delete-account`, `notification-settings` POST) require
  `X-Requested-With: XMLHttpRequest`, which `src/lib/api.ts` always sends
  and a bare HTML form cannot forge.
- **Rate limiting**: DB-backed (`rate_limit_hits` table), correctly applied
  to `login` (10/5min), `forgot-password` (5/10min), `reset-password`
  (10/10min), `test-email` (5/10min) — a real replacement for the PHP
  version's file-based limiter, which cannot work on stateless Vercel
  functions.
- **No secrets in frontend bundle**: confirmed no `VITE_*` variable carries
  a secret — see `ENVIRONMENT_VARIABLE_AUDIT.md`.
- **Vercel API routing**: no route in `src/routes/` uses TanStack Start
  server functions or loaders (confirmed by grep) — all data fetching is
  client-side `fetch`, so there's no framework-level route that could
  compete with or shadow `/api/*`. `vercel.json` only sets a `maxDuration`
  on the API functions and doesn't override routing.

## D. Problems Found

1. **❌ BROKEN (security) — a live credential was committed to the
   repository.** `backend-legacy/.env` contained a real Gmail address and a
   working 16-character Gmail App Password in plain text
   (`SMTP_USER=water.management89project@gmail.com`,
   `SMTP_PASS=nqmizwkowjevrriu`). Root cause: `.gitignore` still referenced
   the **old** folder name `Backend/` from before the migration renamed it
   to `backend-legacy/`, so the ignore rule (`Backend/.env`) silently
   stopped matching and the real file was tracked/exported.

2. **⚠️ NEEDS ATTENTION — stray Cloudflare build artifact was included in
   the export.** A pre-built `.output/` directory was present, containing
   `nitro.json` with `"preset": "cloudflare-module"` and a
   `wrangler.json`/`wrangler.jsonc`, i.e. a **Cloudflare Workers** build,
   not a Vercel one. `.output/` is correctly listed in `.gitignore`, so
   this was a local build artifact that shouldn't have been zipped up —
   it's not itself evidence that the *actual* Vercel deploy would be wrong
   (see D3), but shipping it invites confusion (e.g. someone deploying it
   directly to Cloudflare by mistake, or a CI step picking up a stale
   build).

3. **⚠️ NOT FULLY VERIFIED — Vercel/Nitro preset selection can't be proven
   from static review.** `vite.config.ts` uses
   `@lovable.dev/vite-tanstack-config`, whose own comment states it
   "includes... nitro (build-only using cloudflare as a default target)".
   Vercel's own documentation confirms Lovable/TanStack Start projects using
   `@lovable.dev/vite-tanstack-config` ≥ 2.6.2 deploy to Vercel with **zero
   configuration** — Vercel's build environment is expected to select the
   correct (`vercel`) Nitro preset automatically, separately from what a
   plain local `vite build` produces (which is where the stray `cloudflare-module`
   output in D2 came from). This repo's `package.json` pins
   `@lovable.dev/vite-tanstack-config` at `2.7.0`, which satisfies that
   requirement. **This could not be executed in this environment (no
   network access to run `npm install`/`vercel build`)**, so it is marked
   ⏳/⚠️ rather than ✅ — confirm it with a real Vercel deployment (see F).

4. **⚠️ NEEDS ATTENTION (documentation only, not code) —
   `docs/08_DEPLOYMENT_GUIDE.md` and parts of
   `docs/03-07_*` describe the **old PHP/MySQL** deployment (Apache,
   `.htaccess`, `mysql` CLI, `Backend/.env`). These are stale leftovers from
   before the Vercel migration and could mislead someone deploying today.
   `MIGRATION.md` and `ESP32_INTEGRATION_GUIDE.md` are the current,
   accurate documents — no code depends on the stale docs, so this doesn't
   block production, but it should be cleaned up or clearly marked
   superseded.

No other broken, missing, or mismatched connections were found across
frontend, API, database, authentication, ESP32 ingestion, or email.

## E. Problems Fixed

1. **Rotated the exposure path for the leaked SMTP credential**: replaced
   the real Gmail address/App Password in `backend-legacy/.env` with
   placeholder values, and fixed `.gitignore` (`Backend/.env` →
   also `backend-legacy/.env`, `backend-legacy/.env.*`,
   `backend-legacy/vendor/`) so this can't recur for that file. **This does
   not rotate the credential on Google's side — that App Password is still
   live until you revoke it. You must do that manually** (see F).
2. **Removed the stray `.output/` Cloudflare build directory** from the
   project so nothing pointing at `wrangler`/Cloudflare Workers ships
   alongside the Vercel-targeted `api/` folder.

No application-logic files (`api/*.ts`, `api/_lib/*.ts`, `src/**`,
`database/*.sql`) required changes — every connection they implement was
already correct.

## F. Remaining Requirements (external configuration/testing only)

- [ ] **Revoke the leaked Gmail App Password immediately** at
      <https://myaccount.google.com/apppasswords> (for
      `water.management89project@gmail.com`) and generate a fresh one — do
      this regardless of anything else in this audit, since the old value
      was exposed to anyone who saw this repository/export.
- [ ] Set `DATABASE_URL` (Neon Postgres), `JWT_SECRET`, and
      `DEVICE_INGEST_TOKEN` in Vercel → Project → Settings → Environment
      Variables (see `ENVIRONMENT_VARIABLE_AUDIT.md`).
- [ ] Set `SMTP_USER`/`SMTP_PASS` (the **new** App Password) or switch to
      `MAIL_DRIVER=resend` + `RESEND_API_KEY`.
- [ ] Apply `database/schema.postgres.sql` to the Neon database.
- [ ] Deploy to Vercel and confirm in the build log that the framework was
      detected as TanStack Start / Nitro with the `vercel` preset (not
      `cloudflare-module`) — this directly verifies D3.
- [ ] Run the 22-item testing checklist in `MIGRATION.md` §7 against the
      live deployment (register/login/ingest/leak-email/export/etc.).
- [ ] Point real (or `curl`-simulated) ESP32 traffic at
      `https://<your-app>.vercel.app/api/ingest-usage` and `/ingest-leakage`
      with the new `DEVICE_INGEST_TOKEN`.
- [ ] Delete the demo account (`demo@water.local`) if
      `backend-legacy/migrations/seed_demo_user.sql` was ever run anywhere
      reachable.

## G. Production Deployment Steps

1. Create a Neon Postgres project; copy its connection string as
   `DATABASE_URL`.
2. `psql "$DATABASE_URL" -f database/schema.postgres.sql`.
3. Generate `JWT_SECRET` and `DEVICE_INGEST_TOKEN`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   (run twice, once per variable).
4. Revoke the old Gmail App Password and create a new one; set
   `SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`/`MAIL_FROM_NAME` (or switch to
   Resend).
5. Push this repository to GitHub; import it at vercel.com/new.
6. In Vercel, set all variables from step 1–4 (plus optional
   `ALLOWED_ORIGINS`/`FRONTEND_URL`) under Settings → Environment
   Variables.
7. Deploy. Confirm the build log shows a TanStack Start / Nitro `vercel`
   preset build, and that `/api/*` functions are listed separately in the
   deployment summary.
8. Run the full checklist in `MIGRATION.md` §7 against the live URL.
9. Update ESP32 firmware to point at
   `https://<your-app>.vercel.app/api/ingest-usage` /
   `/api/ingest-leakage` with the new device token (body format/field names
   are unchanged — see H).

## H. ESP32 Changes

**ESP32 firmware does not require field-format changes.** Only two things
change from the old PHP setup, both operational, not code-shape:
1. The target URL (`https://<your-app>.vercel.app/api/ingest-usage` /
   `/api/ingest-leakage` instead of the old `.php` paths).
2. The `X-Device-Token` value, since it must be a freshly generated
   production secret (not any development value).

Every request field name (`user_id`, `kitchen`, `washroom`, `recorded_at`,
`volume`, `severity`, `valve_status`, `event_key`) and both content types
(`application/x-www-form-urlencoded` or JSON — the API accepts either) are
unchanged and already match `api/ingest-usage.ts`/`api/ingest-leakage.ts`
exactly, per `ESP32_INTEGRATION_GUIDE.md`.

---

## Final Question

> If I deploy this application using the recommended production
> configuration and provide the required environment variables/database
> credentials, will the entire system work together as I designed it?

**NO — these specific issues remain, in order of urgency:**

1. **You must revoke the leaked Gmail App Password before doing anything
   else** — this is a live credential exposure independent of deployment
   readiness (D1/E1).
2. **The Vercel build's Nitro preset (`vercel` vs `cloudflare-module`)
   could not be executed/confirmed in this sandbox** (no network access to
   run a real build) — the configuration is designed to auto-select
   correctly on Vercel per Vercel's own documentation, and nothing in the
   repository forces the wrong preset, but this is the one piece of the
   system that genuinely needs a live Vercel deployment to verify rather
   than static code review (D3/F).

Everything else — every frontend↔API↔database connection, authentication,
authorization, ESP32 ingestion, leak-email logic, reports, exports, and
environment-variable handling — was traced end to end and is correctly
wired. Once the credential is rotated and a real Vercel deploy confirms
the build target, this system should behave exactly as designed.
