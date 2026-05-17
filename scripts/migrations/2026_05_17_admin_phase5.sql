-- Migration: Admin Phase 5 (Broadcasts)
--
-- Adds broadcast queue + per-recipient delivery tracking.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS broadcasts (
  id              TEXT PRIMARY KEY,
  -- draft | scheduled | sending | sent | cancelled | failed
  status          TEXT NOT NULL DEFAULT 'scheduled',
  text            TEXT NOT NULL,
  parse_mode      TEXT NOT NULL DEFAULT 'HTML',  -- HTML | Markdown | none
  media_url       TEXT,
  -- JSONB array: [{ text, url }, …]   max 3
  buttons         JSONB,
  -- JSONB filter spec: { all?: bool, minBalance?, regAfter?, regBefore?,
  --                      inactiveDays?, telegramIds?: number[] }
  audience        JSONB NOT NULL,
  scheduled_at    TIMESTAMP(3),
  -- Stats updated by the python worker as it runs.
  total_targets   INTEGER NOT NULL DEFAULT 0,
  delivered       INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  -- Admin who created the broadcast.
  created_by      TEXT NOT NULL,
  created_by_tg   BIGINT NOT NULL,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      TIMESTAMP(3),
  finished_at     TIMESTAMP(3),
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS broadcasts_status_idx ON broadcasts(status);
CREATE INDEX IF NOT EXISTS broadcasts_scheduled_idx ON broadcasts(scheduled_at);
CREATE INDEX IF NOT EXISTS broadcasts_created_idx ON broadcasts(created_at);

-- Per-recipient delivery audit. The python worker writes a row per
-- attempt so admins can see who got the message and why some failed.
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id              BIGSERIAL PRIMARY KEY,
  broadcast_id    TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  telegram_id     BIGINT NOT NULL,
  -- delivered | blocked | error
  status          TEXT NOT NULL,
  error           TEXT,
  attempted_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS broadcast_recipients_bc_idx
  ON broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS broadcast_recipients_status_idx
  ON broadcast_recipients(status);
