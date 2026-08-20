-- Speed up "latest broadcast failure per telegram_id" lookups
-- used by the re-engagement inactive-reason classifier.
-- Idempotent.

CREATE INDEX IF NOT EXISTS broadcast_recipients_telegram_attempted_idx
  ON broadcast_recipients (telegram_id, attempted_at DESC, id DESC);
