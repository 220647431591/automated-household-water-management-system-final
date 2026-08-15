-- ============================================================
-- Automated Household Water Management System — PostgreSQL schema
-- (Vercel-compatible replacement for backend-legacy/schema.sql)
--
-- Run this once against a fresh Postgres database (e.g. Neon free tier):
--   psql "$DATABASE_URL" -f database/schema.postgres.sql
--
-- ============================================================
-- WHY POSTGRES INSTEAD OF MYSQL/MARIADB
-- ============================================================
-- Vercel Serverless Functions are short-lived and stateless, so the
-- database needs to be reachable over the internet with a driver that
-- doesn't require a long-lived TCP connection pool. Neon (https://neon.tech)
-- is a serverless Postgres provider with a free tier, an HTTP-based driver
-- (@neondatabase/serverless) purpose-built for this environment, and
-- built-in connection pooling — which is why Postgres was chosen over
-- trying to reach a traditional MySQL server from Vercel (possible, but
-- requires an always-on pooler like PlanetScale/PgBouncer-for-MySQL and
-- loses the free, zero-ops story). PlanetScale (MySQL-compatible, also has
-- a free tier) is a reasonable alternative if you'd rather stay on MySQL —
-- see database/README.md for that swap.
--
-- WHAT CHANGED FROM THE MYSQL SCHEMA (and why it's still equivalent)
--   - AUTO_INCREMENT INT       -> SERIAL / BIGSERIAL      (same behavior)
--   - ENUM('a','b')            -> a native Postgres ENUM TYPE (same constraint)
--   - TINYINT(1)                -> BOOLEAN                 (same semantics)
--   - ENGINE=InnoDB, CHARSET   -> not applicable in Postgres (always transactional, UTF-8)
--   - INDEX idx_x (a,b)        -> CREATE INDEX ... ON t (a,b) (identical)
--   - FOREIGN KEY ... ON DELETE CASCADE -> REFERENCES ... ON DELETE CASCADE (identical)
--   - UNIQUE KEY (user_id, event_key)   -> UNIQUE (user_id, event_key) (identical;
--       Postgres also treats multiple NULLs as distinct, same as MySQL)
-- Every table, column, relationship, constraint, and index from the
-- original schema is preserved 1:1.
-- ============================================================

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(100) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    name                VARCHAR(100) DEFAULT '',
    household_id        VARCHAR(50)  DEFAULT '',
    location            VARCHAR(100) DEFAULT '',
    notification_email  VARCHAR(120) DEFAULT '',
    notify_leakage      BOOLEAN      NOT NULL DEFAULT TRUE,
    reset_token         VARCHAR(100) DEFAULT NULL,
    reset_expires       TIMESTAMP    DEFAULT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Water usage readings (per room, per timestamp)
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE room_type AS ENUM ('kitchen', 'washroom');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS usage_readings (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room        room_type NOT NULL,
    liters      NUMERIC(10,2) NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_readings (user_id, recorded_at);

-- ------------------------------------------------------------
-- Leakage events
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE severity_type AS ENUM ('Low', 'Medium', 'High', 'Critical');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE valve_status_type AS ENUM ('Activated', 'Deactivated');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS leakage_events (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    volume       NUMERIC(10,2) NOT NULL,
    flow_rate    NUMERIC(10,2) DEFAULT NULL,
    severity     severity_type NOT NULL DEFAULT 'Medium',
    valve_status valve_status_type NOT NULL DEFAULT 'Deactivated',
    event_key    VARCHAR(64) DEFAULT NULL,
    detected_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_leak_user_time ON leakage_events (user_id, detected_at);

-- ------------------------------------------------------------
-- Notifications log (audit trail for every email sent)
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE notif_status_type AS ENUM ('sent', 'failed', 'skipped');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications_log (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id   INT DEFAULT NULL REFERENCES leakage_events(id) ON DELETE SET NULL,
    recipient  VARCHAR(120) NOT NULL,
    status     notif_status_type NOT NULL DEFAULT 'sent',
    message    VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_time ON notifications_log (user_id, created_at);

-- ------------------------------------------------------------
-- Rate limiting (new — replaces the PHP backend's local temp-file
-- counter, which can't work across stateless/multi-region Vercel
-- functions). Used by login, forgot-password, reset-password, test-email.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_hits (
    id         BIGSERIAL PRIMARY KEY,
    bucket     VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rl_bucket_time ON rate_limit_hits (bucket, created_at);

-- Optional: periodically prune old rate-limit rows (run manually, or on a
-- Vercel Cron hitting a small maintenance endpoint if you want automation).
-- DELETE FROM rate_limit_hits WHERE created_at < NOW() - INTERVAL '1 day';
