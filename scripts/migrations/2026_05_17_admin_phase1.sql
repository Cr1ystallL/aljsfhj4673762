-- Migration: Admin Phase 1
--
-- Adds moderation flags to `users` and creates the append-only audit log.
-- Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE INDEX IF NOT EXISTS users_is_blocked_idx ON users(is_blocked);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                TEXT PRIMARY KEY,
  admin_user_id     TEXT NOT NULL,
  admin_telegram_id BIGINT NOT NULL,
  action            TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         TEXT,
  payload_before    JSONB,
  payload_after     JSONB,
  reason            TEXT,
  ip_address        TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at);
