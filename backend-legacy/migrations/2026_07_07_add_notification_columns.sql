-- ============================================================
-- Migration: add notification_email / notify_leakage to users
-- Run this ONCE against your live database if the Settings page
-- shows: SQLSTATE[42S22]: Column not found: 1054 Unknown column
-- 'notification_email' in 'field list'
--
-- The app now also self-heals this automatically on the next
-- request to notification_settings.php, so running this file by
-- hand is optional — only needed if your DB user lacks ALTER
-- privileges and the self-heal can't run.
--
-- Usage: mysql -u root -p water_management < 2026_07_07_add_notification_columns.sql
-- or paste into phpMyAdmin -> SQL tab.
-- ============================================================

-- Note: plain ALTER (not "IF NOT EXISTS") for compatibility with older
-- MySQL/MariaDB on shared hosting. If a column already exists you'll get
-- a harmless "Duplicate column name" error for that line — safe to ignore.
ALTER TABLE users
  ADD COLUMN notification_email VARCHAR(120) DEFAULT '' AFTER location;

ALTER TABLE users
  ADD COLUMN notify_leakage TINYINT(1) NOT NULL DEFAULT 1 AFTER notification_email;
