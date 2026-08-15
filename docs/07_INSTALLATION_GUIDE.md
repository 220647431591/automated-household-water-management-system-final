# 7. Installation Guide

Step-by-step setup from a fresh machine to a running local instance.

## 7.1 Requirements

| Component | Version | Notes |
|---|---|---|
| PHP | **8.0+** | Set in `Backend/composer.json` (`"php": ">=8.0"`). Needs the `pdo_mysql` extension enabled. |
| MySQL / MariaDB | Any recent version supporting `utf8mb4` and `InnoDB` (both are the default on modern installs) |
| Apache | With `mod_rewrite`/`.htaccess` support (`AllowOverride All` on the `Backend/` directory) — see `Backend/.htaccess` |
| Composer | Any recent 2.x | Only needed if you're setting up `Backend/vendor/` from scratch; it's already committed in this repo |
| Node.js | **20.19+** (Vite 8's minimum) — Node 22 LTS recommended | Only needed for the frontend build/dev server |
| npm or bun | Either works — `bunfig.toml` and `bun.lock` are present, but `package-lock.json` (npm) is also committed |

## 7.2 Backend Setup (XAMPP / local Apache+MySQL+PHP)

1. **Install XAMPP** (or your own Apache + PHP 8 + MySQL stack) and start
   Apache + MySQL.
2. **Copy the `Backend/` folder** into your web root, e.g.
   `C:\xampp\htdocs\automated household water management system web\Backend`
   (the frontend's default API base URL,
   `http://localhost/automated%20household%20water%20management%20system%20web/Backend`,
   assumes this exact path — see `src/lib/api.ts`; if you place it
   elsewhere, set `VITE_API_BASE_URL` in the frontend `.env` to match).
3. **Create the database**:
   ```bash
   mysql -u root -p < Backend/schema.sql
   ```
   or paste `schema.sql`'s contents into phpMyAdmin's SQL tab. This creates
   the `water_management` database, all four tables, and a seeded demo
   account (`demo@water.local` / `Password1`) — **delete this account
   before deploying to production** (see §8, Deployment Guide).
4. **Configure environment variables**:
   ```bash
   cp Backend/.env.example Backend/.env
   ```
   Edit `Backend/.env` and set at minimum: `DB_HOST`, `DB_NAME`, `DB_USER`,
   `DB_PASS`, `ALLOWED_ORIGINS` (your frontend's dev URL, e.g.
   `http://localhost:5173`), `SMTP_USER`/`SMTP_PASS` (a Gmail App
   Password — see §6.2), and `DEVICE_INGEST_TOKEN` (any long random
   string — this is the shared secret the ESP32 will use later).
   Leave `APP_ENV=dev` for local development.
5. **Install PHPMailer** (only if `Backend/vendor/` is missing — it's
   already committed in this repo, so this is normally a no-op):
   ```bash
   cd Backend
   composer install
   ```
6. **Verify**: visit `http://localhost/.../Backend/me.php` in a browser —
   you should get `{"success":false,"user":null}` (not logged in yet, but
   valid JSON — confirms PHP + DB connection work). If you get an Apache
   error page or a raw PHP error instead of JSON, see
   `12_TROUBLESHOOTING_GUIDE.md`.

## 7.3 Frontend Setup

1. **Install dependencies**:
   ```bash
   npm install
   # or: bun install
   ```
2. **Configure the API base URL** (only needed if your backend isn't at
   the default XAMPP path from §7.2 step 2). Create a `.env` at the
   project root:
   ```
   VITE_API_BASE_URL=http://localhost/automated%20household%20water%20management%20system%20web/Backend
   ```
3. **Run the dev server**:
   ```bash
   npm run dev
   ```
   This starts Vite's dev server (default `http://localhost:5173`).
   Make sure that origin is included in `Backend/.env`'s
   `ALLOWED_ORIGINS`, or every API call will be blocked by CORS.
4. **Open the app** in a browser, register a new account (or use the
   seeded demo account), and confirm you land on `/dashboard` after login.

## 7.4 Verifying the Full Stack Locally

1. Register an account (or log in as the demo user).
2. Go to Settings → Notifications → "Send Test Email" and confirm you
   receive it (proves SMTP is configured correctly).
3. Simulate an ESP32 usage upload:
   ```bash
   curl -X POST http://localhost/.../Backend/ingest_usage.php \
        -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
        -d "user_id=1&kitchen=5.2&washroom=3.1"
   ```
   (Use the actual `id` of your test user — `1` for a fresh `schema.sql`
   import, since the demo user is the first row inserted.)
4. Refresh the Dashboard/Usage/Usage Trend pages and confirm the numbers
   changed.
5. Simulate a leak event:
   ```bash
   curl -X POST http://localhost/.../Backend/ingest_leakage.php \
        -H "X-Device-Token: <your DEVICE_INGEST_TOKEN>" \
        -d "user_id=1&volume=42&severity=High&valve_status=Deactivated&event_key=install-test-001"
   ```
6. Confirm: the Leakage Events page shows it, Reports reflects it, and
   (if `notify_leakage=1` for that user) an email arrives and Notification
   History shows a `sent` row.

## 7.5 Building for Production

```bash
npm run build
```
Outputs a static build (server-rendered via TanStack Start's Node/edge
target — see `src/server.ts`/`src/start.ts`). Deployment specifics are in
`08_DEPLOYMENT_GUIDE.md`.

## 7.6 Common Install Pitfalls

- **Blank/500 page instead of JSON from any `Backend/*.php` file**: check
  `Backend/.env` exists and has correct DB credentials — `db()` in
  `bootstrap.php` returns a JSON 500 with a generic message on connection
  failure (the real cause goes to the PHP error log, not the response —
  see §12).
- **CORS errors in the browser console**: the frontend's origin (protocol
  + host + port) must be listed exactly in `ALLOWED_ORIGINS` — a mismatch
  on port alone (`5173` vs `3000`) will block every request.
- **"Column not found" errors on `notification_email`/`notify_leakage`**:
  shouldn't happen on a fresh `schema.sql` import (those columns are in
  the base schema), but if you're working from an older dump, the backend
  self-heals this automatically on the next request — see
  `03_DATABASE_DOCUMENTATION.md` §3.5.
