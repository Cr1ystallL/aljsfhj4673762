-- =====================================================================
-- Bonuses extras — banners, global contests, promo activation rules
-- =====================================================================
--
-- Apply on the server with:
--   psql "$DATABASE_URL" -f prisma/migrations/20260521_bonuses_extras.sql
--
-- Idempotent — safe to re-run.

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- visibility: 'public' | 'private' | 'global'
-- (no CHECK constraint — value validation lives in the API).
-- Extending the column is a no-op if already TEXT.

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '[]'::jsonb;
