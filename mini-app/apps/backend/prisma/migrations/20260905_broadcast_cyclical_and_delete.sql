-- Migration: Add cyclical broadcast support and message deletion tracking
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS broadcast_type TEXT DEFAULT 'single';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS interval_seconds INT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS interval_str TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS until_date TIMESTAMPTZ;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS cycle_count INT DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS messages_deleted BOOLEAN DEFAULT false;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS message_id BIGINT;
