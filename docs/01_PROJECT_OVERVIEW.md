# 1. Project Overview

## Project Title
**Automated Household Water Management System**

## Project Objective
A Final Year Project that gives a household real-time visibility into its
water consumption and leak status, and prepares the software side for a
physical ESP32-based monitoring unit (flow sensors + a motorized shut-off
valve) that has not yet been built. The web application is complete and
production-ready; the hardware is the remaining phase.

## System Purpose
- Let a household account log in and see how much water it is using, per
  room and over time.
- Detect and record leakage events (reported by hardware once connected),
  automatically notify the user by email, and keep a full audit trail of
  every notification sent.
- Give the user reports, trend charts, and exportable usage history driven
  entirely by real data in a MySQL database — no mock or placeholder values
  anywhere in the UI.
- Provide a secure, documented HTTP API that an ESP32 device can call to
  report usage and leak events without any further backend changes.

## Main Features
- **Account system**: registration, login, forgot/reset password (real
  email delivery), change password, update profile, delete account.
- **Dashboard**: live KPIs (daily average, peak usage) derived from the
  last 7/30 days of readings.
- **Water Usage page**: kitchen / washroom / overall usage for a selectable
  period (today, this week, last week, this month).
- **Usage Trend page**: a line chart of daily usage (7- or 30-day view).
- **Leakage Events page**: latest / weekly / monthly leak events, with an
  auto-refreshing view of the most recent event in the selected window.
- **Reports page**: a live system-performance report — usage totals,
  leakage totals and percentage, valve response rate, an overall efficiency
  score, and generated recommendations — all computed from the database on
  every request.
- **Notification system**: automatic, event-driven email alerts on real
  leak events, a manual "send test email" diagnostic, and a Notification
  History log of every email attempt (sent/failed/skipped) with reason.
- **Export**: CSV and PDF download of the user's raw usage history.
- **Hardware ingestion API**: two endpoints (`ingest_usage.php`,
  `ingest_leakage.php`) purpose-built for an ESP32 device, authenticated by
  a shared device token, with duplicate-event protection.

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TanStack Start / TanStack Router (file-based routing) |
| Build tool | Vite 8 (Rolldown) |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui (Radix UI primitives) |
| Charts | Chart.js via `react-chartjs-2` |
| Forms/validation | `zod` schemas (`src/lib/validation.ts`) |
| Toasts | `react-toastify` |
| Language | TypeScript (strict), PHP 8+ |
| Backend | Plain PHP (no framework) + PDO/MySQL |
| Database | MySQL / MariaDB, InnoDB tables |
| Email | PHPMailer over SMTP (Gmail SMTP by default), with a `mail()` fallback |
| Package managers | npm (frontend), Composer (backend PHP) |

## System Architecture Overview
```
ESP32  →  Backend API (PHP)  →  MySQL Database  →  Web Dashboard (React)
                                        │
                                        └──→  Automatic Email Notification
```
See `02_SYSTEM_ARCHITECTURE.md` for the full breakdown of responsibilities.

## Project Structure (top level)
```
automated household water management system web/
├── Backend/              PHP API — every endpoint, schema.sql, mailer, .env
├── src/
│   ├── routes/           One file per page (TanStack Router file-based routing)
│   ├── components/       Sidebar, RequireAuth, PasswordStrength, ui/ (shadcn)
│   ├── hooks/             useAuth.tsx (session context)
│   └── lib/               api.ts (fetch helpers), validation.ts (zod schemas)
├── docs/                  This documentation set
├── TECHNICAL_DOCUMENTATION.md   Running engineering log of every review pass
├── ESP32_INTEGRATION_GUIDE.md   Standalone ESP32 quick-reference (root copy)
└── package.json
```
See `13_PROJECT_DIRECTORY_STRUCTURE.md` for the full, annotated tree.
