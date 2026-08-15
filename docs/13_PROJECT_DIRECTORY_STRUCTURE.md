# 13. Project Directory Structure

```
automated household water management system web/
│
├── Backend/                          PHP backend — plain files, no framework/router
│   ├── .env                          Real secrets (gitignored, never commit)
│   ├── .env.example                  Template documenting every variable
│   ├── .htaccess                     Blocks direct access to .env, config.php,
│   │                                   bootstrap.php, .sql/.md, composer.json/.lock
│   ├── bootstrap.php                 Included by every endpoint: CORS, security
│   │                                   headers, session setup, db(), json_out(),
│   │                                   require_login(), rate_limit(), server_error(),
│   │                                   ensure_column()
│   ├── config.php                    Minimal .env loader + DB/CORS/APP_ENV constants
│   ├── mailer.php                    send_email() + HTML email templates
│   ├── schema.sql                    Full DB schema + seeded demo account
│   ├── migrations/
│   │   └── 2026_07_07_add_notification_columns.sql
│   │                                 Manual alternative to the self-healing
│   │                                   ensure_column() mechanism
│   ├── composer.json / composer.lock PHPMailer dependency declaration
│   ├── vendor/                       Installed Composer packages (PHPMailer)
│   ├── README.md                     Backend-specific setup notes
│   │
│   ├── login.php                     Auth
│   ├── register.php
│   ├── logout.php
│   ├── me.php                        Session check ("who am I")
│   ├── forgot_password.php
│   ├── reset_password.php
│   ├── change_password.php
│   ├── update_profile.php
│   ├── delete_account.php
│   │
│   ├── ingest_usage.php              ESP32-facing: routine usage
│   ├── ingest_leakage.php            ESP32-facing: leak events + email trigger
│   │
│   ├── usage.php                     Frontend-facing reads
│   ├── usage_trend.php
│   ├── leakage.php
│   ├── reports.php
│   ├── export.php                    CSV/PDF download (not JSON — see its own
│   │                                   comment header)
│   ├── notification_settings.php
│   ├── notification_history.php
│   └── test_email.php
│
├── docs/                             This numbered documentation set (01–14)
│
├── src/                              React frontend (TanStack Start/Router)
│   ├── routes/                       One file per page; file-based routing
│   │   ├── __root.tsx                Root layout (providers, error boundary)
│   │   ├── index.tsx                 Login page ("/")
│   │   ├── register.tsx
│   │   ├── forgot-password.tsx
│   │   ├── reset-password.tsx
│   │   ├── dashboard.tsx
│   │   ├── usage.tsx                 Per-room usage, period-filtered
│   │   ├── usage-trend.tsx           7/30-day chart.js line chart
│   │   ├── leakage.tsx               Leak event table, period-filtered
│   │   ├── reports.tsx               Live system performance report
│   │   └── settings.tsx              Profile, password, notifications,
│   │                                   notification history, export, delete account
│   │
│   ├── components/
│   │   ├── Sidebar.tsx                Main authenticated-app navigation
│   │   ├── RequireAuth.tsx            Route guard — redirects to "/" if no session
│   │   ├── PasswordStrength.tsx       Password strength meter (register/reset)
│   │   └── ui/                        shadcn/ui primitives (Radix-based) — a large
│   │                                   generated component library; only a subset
│   │                                   is actually used by the routes above
│   │
│   ├── hooks/
│   │   ├── useAuth.tsx                Session context: user, loading, refresh, signOut
│   │   └── use-mobile.tsx             Responsive breakpoint hook (shadcn/ui dependency)
│   │
│   ├── lib/
│   │   ├── api.ts                    getJson / postForm / downloadUrl — the ONLY
│   │   │                               place frontend code should call the backend
│   │   ├── validation.ts             zod schemas (email/password rules) shared by
│   │   │                               Login/Register/Reset Password
│   │   ├── utils.ts                  cn() — Tailwind class-merging helper (shadcn/ui)
│   │   ├── csv.ts                    Generic client-side CSV builder — **not
│   │   │                               currently imported anywhere**; real CSV
│   │   │                               export goes through Backend/export.php.
│   │   │                               Leave as-is or remove in a future cleanup
│   │   │                               pass; it is not part of any live workflow.
│   │   ├── error-capture.ts          SSR error-recovery plumbing (TanStack Start)
│   │   ├── error-page.ts             Fallback HTML for an unrecovered SSR error
│   │   └── lovable-error-reporting.ts Error reporting hook for the Lovable platform
│   │                                   this project was originally scaffolded in
│   │
│   ├── router.tsx                    TanStack Router instance
│   ├── routeTree.gen.ts              Auto-generated route tree — do not hand-edit
│   ├── server.ts / start.ts          TanStack Start server entry points
│   └── styles.css                    Global styles, Tailwind directives, custom
│                                       keyframes (titleMarquee, fadeInOut, bounceY, …)
│
├── public/
│   └── favicon.ico
│
├── TECHNICAL_DOCUMENTATION.md         Single-file technical doc + the full,
│                                       dated changelog of every review pass
│                                       performed on this project (§8, §10, §11)
├── ESP32_INTEGRATION_GUIDE.md         Root-level copy of the ESP32 guide (kept
│                                       in sync with docs/05_ESP32_INTEGRATION_GUIDE.md
│                                       — see 09_MAINTENANCE_GUIDE.md §9.7)
│
├── package.json / package-lock.json   npm dependency manifest
├── bunfig.toml / bun.lock             Bun is also supported as an alternative
│                                       package manager/runtime
├── vite.config.ts                     Vite build config (React, Tailwind v4,
│                                       TanStack Start plugins)
├── tsconfig.json                      TypeScript config
├── eslint.config.js                   ESLint flat config
├── components.json                    shadcn/ui CLI config
├── .prettierrc / .prettierignore      Formatting rules
└── .lovable/project.json              Metadata from the Lovable scaffolding
                                        platform this project was originally
                                        built in — not read by the app at runtime
```

## Notes on generated/build directories (not part of the source tree)
- `node_modules/` — installed npm dependencies (not committed; regenerate
  with `npm install`).
- `.output/` — a previous `vite build` output, present in this repo copy
  as a build artifact, not source. Safe to delete and regenerate.
- `.wrangler/` — Cloudflare Workers tooling cache, also a build artifact.

## Why two copies of some documents exist
`ESP32_INTEGRATION_GUIDE.md` (root) and `docs/05_ESP32_INTEGRATION_GUIDE.md`
cover the same material. This was a deliberate earlier decision (root-level
for a firmware developer who clones the repo and wants the guide
immediately visible; `docs/` for the complete, numbered documentation set
delivered here). Keep both in sync — see `09_MAINTENANCE_GUIDE.md` §9.7.
`TECHNICAL_DOCUMENTATION.md` at the root additionally serves as this
project's running changelog (§8/§10/§11 inside it document three
successive review passes) and is broader in scope than any single file
under `docs/`.
