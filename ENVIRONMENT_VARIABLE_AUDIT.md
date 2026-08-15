# Environment Variable Audit

Scope: `api/*.ts`, `api/_lib/*.ts`, `src/lib/api.ts`, and every config file
that reads `process.env` / `import.meta.env`. Verified by reading source,
not assumed.

| Variable | Used by | Required in production | Secret? | Correctly configured? |
|---|---|---|---|---|
| `DATABASE_URL` | `api/_lib/db.ts` (Neon connection) | ✅ Yes | ✅ Yes | ⏳ Must be set in Vercel — code correctly throws a clear error if missing, never falls back to a local DB |
| `JWT_SECRET` | `api/_lib/auth.ts` (signs/verifies session cookie) | ✅ Yes | ✅ Yes | ⏳ Must be set (32+ chars) — code enforces a minimum length and throws if missing/short |
| `DEVICE_INGEST_TOKEN` | `api/_lib/device.ts` (ESP32 auth) | ✅ Yes (for hardware ingestion) | ✅ Yes | ⏳ Must be set — never bundled into frontend, correctly server-only |
| `ALLOWED_ORIGINS` | `api/_lib/http.ts` (CORS allowlist) | ⚠️ Optional but recommended | No | ⏳ Falls back to `localhost` origins only if unset — fine for same-origin Vercel deploy (the recommended setup), but **set explicitly if the frontend is ever hosted on a separate domain** |
| `VERCEL_ENV` | `api/_lib/auth.ts`, `api/_lib/http.ts`, `api/forgot-password.ts` | Auto-set by Vercel | No | ✅ Set automatically by the Vercel platform — no action needed |
| `VERCEL` | `api/_lib/auth.ts` (cookie `Secure` flag) | Auto-set by Vercel | No | ✅ Set automatically by the Vercel platform |
| `MAIL_DRIVER` | `api/_lib/mailer.ts` | ⚠️ Optional (defaults to `smtp`) | No | ⏳ Set to `smtp` or `resend` depending on which provider you use |
| `SMTP_HOST` / `SMTP_PORT` | `api/_lib/mailer.ts` | Required if `MAIL_DRIVER=smtp` | No | ⏳ Defaults to Gmail's host/port if unset |
| `SMTP_USER` / `SMTP_PASS` | `api/_lib/mailer.ts` | Required if `MAIL_DRIVER=smtp` | ✅ Yes | ⏳ Must be set — code correctly returns `success:false` with a clear message instead of crashing if missing |
| `MAIL_FROM` / `MAIL_FROM_NAME` | `api/_lib/mailer.ts` | ⚠️ Optional | No | ⏳ Falls back to `SMTP_USER` / a default name |
| `RESEND_API_KEY` | `api/_lib/mailer.ts` | Required only if `MAIL_DRIVER=resend` | ✅ Yes | ⏳ Not needed unless you switch drivers |
| `FRONTEND_URL` | `api/forgot-password.ts` | ⚠️ Optional (fallback only) | No | ⏳ Only used when a request has no `Origin` header — set it to your production domain as a safety net |
| `VITE_API_BASE_URL` | `src/lib/api.ts` (frontend build-time) | ❌ Leave unset | No | ✅ Correctly left unset for the recommended same-origin deployment — frontend calls `/api/*` automatically |

## Findings

**✅ No secret is exposed through a `VITE_*` variable or any other
frontend-bundled code.** Every credential (`DATABASE_URL`, `JWT_SECRET`,
`DEVICE_INGEST_TOKEN`, `SMTP_*`, `RESEND_API_KEY`) is read only inside
`api/_lib/*.ts` and `api/*.ts`, which run server-side only. `src/lib/api.ts`
(the only frontend file that reads an env var) reads just
`VITE_API_BASE_URL`, which is a plain URL, not a secret.

**❌ CRITICAL — a real secret was found committed in the repository**, just
not in a `VITE_*` variable: `backend-legacy/.env` (the legacy PHP backend's
env file, not part of the Vercel API) contained a **live Gmail address and
a working 16-character Gmail App Password** in plain text. This is
documented as Problem #1 in `FINAL_PRODUCTION_AUDIT.md` — it has been
redacted in this pass, but **you must rotate that App Password immediately**
regardless, since it was exposed to anyone with repository access.

**No hard-coded `localhost` / `127.0.0.1` / IP addresses** were found
anywhere in `api/` or `src/` production code paths, except the intentional,
harmless CORS dev-fallback list in `api/_lib/http.ts` (only used if
`ALLOWED_ORIGINS` is left unset).
