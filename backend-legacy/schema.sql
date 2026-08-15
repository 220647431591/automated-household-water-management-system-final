-- ============================================================
-- Automated Household Water Management System — MySQL schema
-- Import via phpMyAdmin or:  mysql -u root < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS water_management
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE water_management;

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    email               VARCHAR(100) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    name                VARCHAR(100) DEFAULT '',
    household_id        VARCHAR(50)  DEFAULT '',
    location            VARCHAR(100) DEFAULT '',
    notification_email  VARCHAR(120) DEFAULT '',
    notify_leakage      TINYINT(1)   NOT NULL DEFAULT 1,
    reset_token         VARCHAR(100) DEFAULT NULL,
    reset_expires       DATETIME     DEFAULT NULL,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Additive migration for existing installs:
-- ALTER TABLE users
--   ADD COLUMN notification_email VARCHAR(120) DEFAULT '' AFTER location,
--   ADD COLUMN notify_leakage TINYINT(1) NOT NULL DEFAULT 1 AFTER notification_email;

-- ------------------------------------------------------------
-- Water usage readings (per room, per timestamp)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_readings (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    room       ENUM('kitchen','washroom') NOT NULL,
    liters     DECIMAL(10,2) NOT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, recorded_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Leakage events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leakage_events (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    volume       DECIMAL(10,2) NOT NULL,
    flow_rate    DECIMAL(10,2) DEFAULT NULL,
    severity     ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
    valve_status ENUM('Activated','Deactivated') NOT NULL DEFAULT 'Deactivated',
    event_key    VARCHAR(64) DEFAULT NULL,
    detected_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_user_event (user_id, event_key),
    INDEX idx_user_time (user_id, detected_at)
) ENGINE=InnoDB;

-- Additive migration for existing installs:
-- ALTER TABLE leakage_events
--   ADD COLUMN flow_rate DECIMAL(10,2) DEFAULT NULL AFTER volume,
--   ADD COLUMN severity ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium' AFTER flow_rate,
--   ADD COLUMN event_key VARCHAR(64) DEFAULT NULL,
--   ADD UNIQUE KEY uniq_user_event (user_id, event_key);

-- ------------------------------------------------------------
-- Notifications log (audit trail for every email sent)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    event_id   INT DEFAULT NULL,
    recipient  VARCHAR(120) NOT NULL,
    status     ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
    message    VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Demo user (email: demo@water.local  /  password: Password1)
-- ------------------------------------------------------------
INSERT INTO users (email, password_hash, name, household_id, location)
VALUES (
  'demo@water.local',
  '$2y$10$Q4h0nQ6mZQ5S7pV5m6h5W.f0eB7O3JmYyq9Wc0Fh9tS2vY1qA.n7q',
  'Demo User',
  'HH-001',
  'Dar es Salaam'
)
ON DUPLICATE KEY UPDATE email = email;
