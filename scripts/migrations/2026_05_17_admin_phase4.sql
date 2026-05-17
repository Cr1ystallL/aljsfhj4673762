-- Migration: Admin Phase 4 (Finance)
--
-- Withdrawal requests with full lifecycle (pending → approved /
-- rejected). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  amount          NUMERIC(20, 2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'PLN',
  method          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  -- pending | approved | rejected | paid
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMP(3),
  rejection_reason TEXT,
  metadata        JSONB,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx
  ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx
  ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS withdrawal_requests_created_idx
  ON withdrawal_requests(created_at);
