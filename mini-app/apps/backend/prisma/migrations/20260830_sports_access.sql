-- Per-player sports book access. Not an admin role: dock shows
-- Ставки instead of Партнёрка when this flag is on.
-- Idempotent: safe to rerun.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sports_access BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_sports_access_idx
  ON users (sports_access)
  WHERE sports_access = true;
