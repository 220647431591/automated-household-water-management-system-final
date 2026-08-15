# Automated Household Water Management System — Documentation

Complete technical documentation, written to hand off to another software
engineer or an ESP32 firmware developer who has never seen this project.
Every statement in this set is based on direct inspection of the current
codebase — nothing here describes a feature that doesn't exist.

## Document Index

| # | Document | Covers |
|---|---|---|
| 1 | [Project Overview](01_PROJECT_OVERVIEW.md) | Title, objective, purpose, features, tech stack, structure at a glance |
| 2 | [System Architecture](02_SYSTEM_ARCHITECTURE.md) | Component diagram, responsibilities, request/response pattern, auth model |
| 3 | [Database Documentation](03_DATABASE_DOCUMENTATION.md) | Every table, column, type, key, index, relationship |
| 4 | [Backend API Documentation](04_BACKEND_API_DOCUMENTATION.md) | Every endpoint: method, URL, auth, request/response, errors |
| 5 | [ESP32 Integration Guide](05_ESP32_INTEGRATION_GUIDE.md) | Firmware-developer-facing: auth, payloads, retries, testing |
| 6 | [Email Notification Guide](06_EMAIL_NOTIFICATION_GUIDE.md) | SMTP config, every email trigger, full leak/reset workflows, logging |
| 7 | [Installation Guide](07_INSTALLATION_GUIDE.md) | Fresh-machine setup: backend, frontend, verification steps |
| 8 | [Deployment Guide](08_DEPLOYMENT_GUIDE.md) | Production checklist, env vars, HTTPS, Apache, backups |
| 9 | [Maintenance Guide](09_MAINTENANCE_GUIDE.md) | How to extend endpoints/dashboard/reports/schema, monitor logs |
| 10 | [Hardware Integration Checklist](10_HARDWARE_INTEGRATION_CHECKLIST.md) | Step-by-step ESP32 bring-up checklist with pass/fail criteria |
| 11 | [Testing Guide](11_TESTING_GUIDE.md) | Manual test procedures and expected results for every workflow |
| 12 | [Troubleshooting Guide](12_TROUBLESHOOTING_GUIDE.md) | Common failures and their fixes |
| 13 | [Project Directory Structure](13_PROJECT_DIRECTORY_STRUCTURE.md) | Full folder tree with the purpose of every major file |
| 14 | [Final Project Summary](14_FINAL_PROJECT_SUMMARY.md) | Overall status, what's confirmed, what's left |

## Related files outside `docs/`

- `../TECHNICAL_DOCUMENTATION.md` — a single-file technical reference that
  also doubles as this project's dated changelog (three successive review
  passes are recorded there in full).
- `../ESP32_INTEGRATION_GUIDE.md` — a root-level copy of document 5, for a
  firmware developer who clones the repo and wants it immediately visible
  without navigating into `docs/`.

## How to use this set

- **New backend/frontend developer**: read 1 → 2 → 3 → 4, then 13 for the
  file layout, then 9 before making changes.
- **ESP32 firmware developer**: read 5 (or the root-level copy) — it's
  self-contained and doesn't require reading any of the others, though 10
  is the checklist to work through once firmware exists.
- **Deploying to production**: read 8, then confirm every item in its §8.1
  checklist.
- **Something's broken**: go straight to 12.
- **"Is this project done?"**: read 14.
