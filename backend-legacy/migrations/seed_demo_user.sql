-- ============================================================
-- OPTIONAL demo account for local development/testing only.
-- Email:    demo@water.local
-- Password: Password1
--
-- Do NOT run this against a production database — it's a real, working
-- login with a publicly-documented password. schema.sql no longer creates
-- this automatically; run this file yourself only on a local/dev DB.
--
-- Usage: mysql -u root water_management < seed_demo_user.sql
-- ============================================================

INSERT INTO users (email, password_hash, name, household_id, location)
VALUES (
  'demo@water.local',
  '$2y$10$Q4h0nQ6mZQ5S7pV5m6h5W.f0eB7O3JmYyq9Wc0Fh9tS2vY1qA.n7q',
  'Demo User',
  'HH-001',
  'Dar es Salaam'
)
ON DUPLICATE KEY UPDATE email = email;
