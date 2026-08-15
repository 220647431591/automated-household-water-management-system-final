# 3. Database Documentation

Database: `water_management` (MySQL/MariaDB, `utf8mb4_unicode_ci`, all
tables `InnoDB`). Defined in `Backend/schema.sql`; additive migrations live
in `Backend/migrations/`. The backend also **self-heals** two columns at
runtime (see §3.5) so an older live database won't hard-fail on a missing
column.

## 3.1 `users`

Stores one row per account. Also holds each user's notification
preferences and password-reset state (no separate tables for those).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | User ID, referenced by every other table |
| `email` | VARCHAR(100) | NOT NULL, UNIQUE | Login email; also the default notification recipient |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hash (`password_hash()` / `PASSWORD_BCRYPT`); rehashed on login if the algorithm/cost has moved on |
| `name` | VARCHAR(100) | DEFAULT '' | Display name, editable in Settings |
| `household_id` | VARCHAR(50) | DEFAULT '' | Free-text household identifier, editable in Settings |
| `location` | VARCHAR(100) | DEFAULT '' | Free-text location, editable in Settings |
| `notification_email` | VARCHAR(120) | DEFAULT '' | Optional alternate email for leak alerts; falls back to `email` if blank |
| `notify_leakage` | TINYINT(1) | NOT NULL, DEFAULT 1 | Master on/off switch for leak-alert emails |
| `reset_token` | VARCHAR(100) | DEFAULT NULL | Random 64-hex-char token, set by `forgot_password.php`, cleared on use |
| `reset_expires` | DATETIME | DEFAULT NULL | Token expiry (1 hour after issuance) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation time |

No foreign keys (this is the root table). No additional indexes beyond the
implicit ones on `id` (PK) and `email` (UNIQUE).

## 3.2 `usage_readings`

One row per reading the ESP32 (or a manual test call) reports for a room,
at a point in time. This is the sole source for every usage number shown
anywhere in the app.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | Reading ID |
| `user_id` | INT | NOT NULL, FK → `users.id` ON DELETE CASCADE | Owning household |
| `room` | ENUM('kitchen','washroom') | NOT NULL | Which monitored zone this reading is for |
| `liters` | DECIMAL(10,2) | NOT NULL | Liters recorded for this reading |
| `recorded_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When the reading applies (device-supplied or server receipt time) |

**Index**: `idx_user_time (user_id, recorded_at)` — every read query filters
by `user_id` and a `recorded_at` range, so this composite index covers all
of `usage.php`, `usage_trend.php`, `reports.php`, and `export.php`.

**Used by**: `ingest_usage.php` (writes), `usage.php`, `usage_trend.php`,
`reports.php`, `export.php` (all reads, all scoped to the logged-in user).

## 3.3 `leakage_events`

One row per detected leak event.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | Event ID |
| `user_id` | INT | NOT NULL, FK → `users.id` ON DELETE CASCADE | Owning household |
| `volume` | DECIMAL(10,2) | NOT NULL | Estimated leaked volume (liters) |
| `flow_rate` | DECIMAL(10,2) | DEFAULT NULL | Flow rate at detection time, if the device sent one |
| `severity` | ENUM('Low','Medium','High','Critical') | NOT NULL, DEFAULT 'Medium' | Device- or default-assigned severity |
| `valve_status` | ENUM('Activated','Deactivated') | NOT NULL, DEFAULT 'Deactivated' | Stored value; the UI/email show this as **Closed** (Activated) / **Open** (Deactivated) |
| `event_key` | VARCHAR(64) | DEFAULT NULL | Idempotency key — explicit from the device, or auto-derived (see §3.6) |
| `detected_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When the event was recorded |

**Constraints/indexes**:
- `UNIQUE KEY uniq_user_event (user_id, event_key)` — the database itself
  refuses a duplicate insert for the same user + event_key, as a second
  line of defense behind the application-level dedup check.
- `idx_user_time (user_id, detected_at)` — covers every read (latest/week/
  month filters all sort and filter on this pair).

**Used by**: `ingest_leakage.php` (writes, then triggers the email),
`leakage.php`, `reports.php` (both reads).

## 3.4 `notifications_log`

Audit trail of every email the system has ever attempted to send —
leak alerts, password-reset emails are **not** logged here (only leak
alerts and test emails currently write to this table; see
`06_EMAIL_NOTIFICATION_GUIDE.md` for the exact trigger list).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | Log entry ID |
| `user_id` | INT | NOT NULL, FK → `users.id` ON DELETE CASCADE | Owning household |
| `event_id` | INT | DEFAULT NULL | FK-by-convention to `leakage_events.id` (not a declared FK); `NULL` for test emails |
| `recipient` | VARCHAR(120) | NOT NULL | Address the email was sent (or attempted) to |
| `status` | ENUM('sent','failed','skipped') | NOT NULL, DEFAULT 'sent' | Outcome |
| `message` | VARCHAR(255) | DEFAULT '' | Human-readable detail (SMTP error text, or `"sent"`) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When the attempt happened |

**Index**: `idx_user_time (user_id, created_at)` — the Notification History
UI always queries "most recent N for this user."

**Used by**: `ingest_leakage.php` and `test_email.php` (writes),
`notification_history.php` (reads, `LEFT JOIN`ed against `leakage_events`
to surface severity/volume for leak-triggered rows).

## 3.5 Self-Healing Columns
`bootstrap.php` exposes `ensure_column($pdo, $table, $column, $definitionSql)`,
called by `ingest_leakage.php` and `notification_settings.php` for
`users.notification_email` and `users.notify_leakage`. On every request it
does a cheap `INFORMATION_SCHEMA` lookup and only runs `ALTER TABLE` the
first time the column is actually missing. This means an older database
provisioned before these columns existed in `schema.sql` will self-repair
on the next request instead of throwing a column-not-found error. The
one-time manual alternative is `Backend/migrations/2026_07_07_add_notification_columns.sql`.

## 3.6 Leak Event Deduplication (cross-reference)
`event_key` is the mechanism that prevents duplicate leak emails. If the
device doesn't supply one, the backend derives
`auto-{YmdHi}-{severity}-{round(volume,1)}` — i.e. retries within the same
minute, for the same severity/volume, collapse into one row and one email.
Full detail in `05_ESP32_INTEGRATION_GUIDE.md` §4 and
`06_EMAIL_NOTIFICATION_GUIDE.md` §3.

## 3.7 Entity-Relationship Summary
```
users (1) ──< usage_readings (many)
users (1) ──< leakage_events (many)
users (1) ──< notifications_log (many)
leakage_events (1) ──< notifications_log (many, via event_id — not a declared FK)
```
All child-table relationships cascade on delete: removing a `users` row
removes all of that user's usage readings, leak events, and notification
log entries.
