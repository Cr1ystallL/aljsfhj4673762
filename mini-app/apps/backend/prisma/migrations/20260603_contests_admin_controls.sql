-- Contest admin controls extension
-- Adds draft_winners preview list and winner_wager multiplier.
-- Idempotent: safe to rerun.

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS draft_winners JSONB,
  ADD COLUMN IF NOT EXISTS winner_wager NUMERIC(10, 2) NOT NULL DEFAULT 0;
