# Database

## What changed

| Before | After |
|---|---|
| MySQL/MariaDB | PostgreSQL (Neon serverless, free tier) |
| `Backend/schema.sql` | `database/schema.postgres.sql` |
| PDO over a persistent TCP connection | `@neondatabase/serverless` over HTTP |

Every table, column, relationship, foreign key, and index from the original
`schema.sql` is preserved — see the comment block at the top of
`schema.postgres.sql` for the exact MySQL → Postgres type mapping.

**Why Postgres instead of MySQL?** Vercel Serverless Functions are
short-lived and stateless — a normal MySQL client with a connection pool
would quickly exhaust your database's connection limit. Neon is a
serverless Postgres provider with a free tier, built specifically for this
(HTTP-based driver, built-in pooling, scales to zero). If you'd rather keep
MySQL, **PlanetScale** (also free-tier, MySQL-compatible, serverless) is a
drop-in alternative — swap `@neondatabase/serverless` for
`@planetscale/database` in `api/_lib/db.ts` and keep `Backend/schema.sql` as
your schema (only `api/_lib/db.ts` and the SQL syntax in each `api/*.ts`
file would need to change; the query template-literal style used throughout
already matches PlanetScale's driver closely).

## 1. Create the database (Neon)

1. Go to <https://neon.tech>, sign up free, create a project.
2. Copy the connection string it gives you (starts with `postgres://`).
3. That's your `DATABASE_URL`.

## 2. Apply the schema

```bash
psql "$DATABASE_URL" -f database/schema.postgres.sql
```

(No `psql` installed? Neon's dashboard has a built-in SQL editor — paste the
contents of `schema.postgres.sql` there instead.)

## 3. Migrate existing data (only if you have real data in MySQL already)

If your current MySQL database only has the demo/test data, skip this —
just register a fresh account through the app. Otherwise:

```bash
npm install mysql2 pg --no-save   # one-time, just for running this script

MYSQL_URL="mysql://user:pass@host:3306/water_management" \
DATABASE_URL="postgres://user:pass@host/neondb?sslmode=require" \
node database/migrate-data.mjs
```

This copies `users`, `usage_readings`, `leakage_events`, and
`notifications_log` row-by-row, preserving IDs (so foreign keys stay
intact). It's read-only against MySQL — safe to run before you're ready to
cut over, and safe to re-run (it skips rows that already exist).

Existing users' passwords keep working: PHP's `password_hash()` bcrypt
hashes (`$2y$...`) are verified correctly by the new backend (see
`api/_lib/password.ts`) — no forced password reset needed.
