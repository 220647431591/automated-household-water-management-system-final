#!/usr/bin/env node
// ============================================================
// database/migrate-data.mjs
//
// One-time data migration: copies every row from your existing
// MySQL/MariaDB database into the new Postgres database, preserving
// primary keys (so foreign key relationships stay intact) and column
// values as-is. Run this AFTER applying database/schema.postgres.sql to
// the target Postgres database.
//
// This only copies DATA. It does not touch your existing MySQL database
// at all (read-only), so it's safe to run before you're ready to cut over.
// ============================================================
//
// Usage:
//   npm install mysql2 pg --no-save   (one-time, just for running this script)
//   MYSQL_URL="mysql://user:pass@host:3306/water_management" \
//   DATABASE_URL="postgres://user:pass@host/neondb?sslmode=require" \
//   node database/migrate-data.mjs
//
// ============================================================

import mysql from "mysql2/promise";
import pg from "pg";

const MYSQL_URL = process.env.MYSQL_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!MYSQL_URL || !DATABASE_URL) {
  console.error("Set MYSQL_URL (source) and DATABASE_URL (target Postgres) environment variables.");
  process.exit(1);
}

async function main() {
  const mysqlConn = await mysql.createConnection(MYSQL_URL);
  const pgClient = new pg.Client({ connectionString: DATABASE_URL });
  await pgClient.connect();

  try {
    await migrateUsers(mysqlConn, pgClient);
    await migrateUsageReadings(mysqlConn, pgClient);
    await migrateLeakageEvents(mysqlConn, pgClient);
    await migrateNotificationsLog(mysqlConn, pgClient);
    await resyncSequences(pgClient);
    console.log("\n✅ Migration complete.");
  } finally {
    await mysqlConn.end();
    await pgClient.end();
  }
}

async function migrateUsers(mysqlConn, pgClient) {
  const [rows] = await mysqlConn.query("SELECT * FROM users");
  console.log(`users: migrating ${rows.length} row(s)...`);
  for (const r of rows) {
    await pgClient.query(
      `INSERT INTO users
         (id, email, password_hash, name, household_id, location, notification_email,
          notify_leakage, reset_token, reset_expires, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id,
        r.email,
        r.password_hash, // PHP bcrypt ($2y$) hashes verify fine — see api/_lib/password.ts
        r.name ?? "",
        r.household_id ?? "",
        r.location ?? "",
        r.notification_email ?? "",
        !!r.notify_leakage,
        r.reset_token,
        r.reset_expires,
        r.created_at,
      ],
    );
  }
}

async function migrateUsageReadings(mysqlConn, pgClient) {
  const [rows] = await mysqlConn.query("SELECT * FROM usage_readings");
  console.log(`usage_readings: migrating ${rows.length} row(s)...`);
  for (const r of rows) {
    await pgClient.query(
      `INSERT INTO usage_readings (id, user_id, room, liters, recorded_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.user_id, r.room, r.liters, r.recorded_at],
    );
  }
}

async function migrateLeakageEvents(mysqlConn, pgClient) {
  const [rows] = await mysqlConn.query("SELECT * FROM leakage_events");
  console.log(`leakage_events: migrating ${rows.length} row(s)...`);
  for (const r of rows) {
    await pgClient.query(
      `INSERT INTO leakage_events
         (id, user_id, volume, flow_rate, severity, valve_status, event_key, detected_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.user_id, r.volume, r.flow_rate, r.severity, r.valve_status, r.event_key, r.detected_at],
    );
  }
}

async function migrateNotificationsLog(mysqlConn, pgClient) {
  const [rows] = await mysqlConn.query("SELECT * FROM notifications_log");
  console.log(`notifications_log: migrating ${rows.length} row(s)...`);
  for (const r of rows) {
    await pgClient.query(
      `INSERT INTO notifications_log (id, user_id, event_id, recipient, status, message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.user_id, r.event_id, r.recipient, r.status, r.message, r.created_at],
    );
  }
}

/** After inserting explicit IDs, Postgres SERIAL sequences must be bumped past the max used ID. */
async function resyncSequences(pgClient) {
  const tables = [
    ["users", "id"],
    ["usage_readings", "id"],
    ["leakage_events", "id"],
    ["notifications_log", "id"],
  ];
  for (const [table, col] of tables) {
    await pgClient.query(
      `SELECT setval(pg_get_serial_sequence('${table}', '${col}'), COALESCE((SELECT MAX(${col}) FROM ${table}), 1))`,
    );
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
