# 8. Deployment Guide

## 8.1 Pre-Deployment Checklist

- [ ] Delete or change the seeded demo account (`demo@water.local` from
      `schema.sql`) — it ships with a known password.
- [ ] Set `APP_ENV=prod` in the production `Backend/.env` (suppresses
      `dev_reset_link` in forgot-password responses and the `debug` field
      on 500 errors — see `06_EMAIL_NOTIFICATION_GUIDE.md` §6.5.1 and
      `04_BACKEND_API_DOCUMENTATION.md`).
- [ ] Generate a fresh, long, random `DEVICE_INGEST_TOKEN` — don't reuse a
      development value.
- [ ] Set `ALLOWED_ORIGINS` to your real production frontend domain(s)
      only — remove `localhost` entries.
- [ ] Set `FRONTEND_URL` (used as a fallback base for password-reset links
      when a request has no `Origin` header — e.g. Postman/server-to-server
      calls).
- [ ] Confirm `Backend/.htaccess` is actually being read (`AllowOverride
      All` on that directory) — it's what blocks direct access to `.env`,
      `config.php`, `bootstrap.php`, and `.sql`/`.md` files.
- [ ] Serve over HTTPS (required — see §8.4).
- [ ] Use production DB credentials with least-privilege access (the app
      only needs `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`ALTER` on its own
      database — `ALTER` is needed for the self-healing-column mechanism
      in §3.5 of the database doc).

## 8.2 Environment Variables (production reference)

All of these live in `Backend/.env` (or real server/process environment
variables, which take precedence — see the comment at the top of
`.env.example`):

| Variable | Production guidance |
|---|---|
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | Your production MySQL instance |
| `ALLOWED_ORIGINS` | Comma-separated exact origins, e.g. `https://water.example.com` |
| `APP_ENV` | `prod` |
| `MAIL_DRIVER` | `smtp` |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` | Production mail account credentials (an App Password if using Gmail) |
| `MAIL_FROM`/`MAIL_FROM_NAME` | Your production sender identity |
| `FRONTEND_URL` | `https://water.example.com` |
| `DEVICE_INGEST_TOKEN` | A freshly generated secret, distinct from any dev value |

Frontend build-time variable (set wherever you build, e.g. CI):
| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://water.example.com/Backend` (your production backend URL) |

## 8.3 Database Migration

For a brand-new production database:
```bash
mysql -u <user> -p < Backend/schema.sql
```
For an existing database that predates the notification columns:
```bash
mysql -u <user> -p water_management < Backend/migrations/2026_07_07_add_notification_columns.sql
```
This step is optional in practice — `ensure_column()` in `bootstrap.php`
self-heals both columns on the first request that needs them (see
`03_DATABASE_DOCUMENTATION.md` §3.5) — but running the migration by hand
avoids relying on the deploying DB user having `ALTER` privileges.

**After importing `schema.sql`**, immediately remove the seeded demo row:
```sql
DELETE FROM users WHERE email = 'demo@water.local';
```

## 8.4 HTTPS

Required, not optional, for two independent reasons:
1. **Session cookies**: `bootstrap.php` sets `SameSite=None; Secure` on the
   session cookie whenever the request is detected as HTTPS
   (`$_SERVER['HTTPS']`), which is required by modern browsers for any
   cross-origin cookie (frontend and backend on different subdomains).
   Serving the backend over plain HTTP in production means the session
   cookie won't be reliably accepted cross-origin, breaking login.
2. **Credentials in transit**: passwords, session cookies, and the
   `X-Device-Token` header should never travel over plain HTTP.

Use a reverse proxy (nginx/Apache with Let's Encrypt) or your host's
built-in TLS termination in front of the PHP backend.

## 8.5 Apache Configuration

- `Backend/.htaccess` must be honored (`AllowOverride All`, or fold its
  rules directly into your vhost's `<Directory>` block if `.htaccess` is
  disabled for performance reasons).
- Point your document root / vhost at the repo so that `Backend/` is
  reachable at whatever path `VITE_API_BASE_URL` expects.
- If deploying the frontend separately (e.g. a static host or a different
  origin than the backend), double check `ALLOWED_ORIGINS` matches that
  exact origin.

## 8.6 Frontend Deployment

`npm run build` produces a server-rendered TanStack Start build
(`src/server.ts`/`src/start.ts`). Deploy it to whatever Node-capable
hosting you use, with `VITE_API_BASE_URL` set at build time to your
production backend URL. This repo doesn't prescribe a specific host —
verify your target platform's Node version support against §7.1's Node
requirement before deploying.

## 8.7 Security Recommendations (production-specific)

- Rotate `DEVICE_INGEST_TOKEN` immediately if a physical device is lost or
  decommissioned.
- Keep `Backend/vendor/` out of version control conflicts but present on
  the server (PHPMailer must be installed for real email delivery — see
  §6.2).
- Confirm `.env` is not web-accessible: `curl https://your-domain.com/Backend/.env`
  should return a 403, not the file contents (this is what
  `Backend/.htaccess`'s dotfile block enforces).
- Keep `APP_ENV=prod` at all times in production — re-check this after
  any deploy that might have copied a dev `.env` over the production one.

## 8.8 Backup Recommendations

- **Database**: back up `water_management` on a regular schedule
  (`mysqldump`), since it is the application's sole source of truth —
  there is no secondary data store to recover from if it's lost.
- **`Backend/.env`**: back up securely (it contains all secrets) but never
  commit it to version control — it's already gitignored.
- **Notification history**: `notifications_log` is part of the regular DB
  backup; there's no separate email-archive system to back up.
