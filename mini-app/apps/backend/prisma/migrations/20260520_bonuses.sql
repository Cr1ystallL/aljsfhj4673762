-- =====================================================================
-- Bonuses subsystem migration
-- =====================================================================
--
-- Apply on the server with:
--   psql "$DATABASE_URL" -f prisma/migrations/20260520_bonuses.sql
--
-- Idempotent: every CREATE uses IF NOT EXISTS so a partial run can be
-- repeated safely. No data is written here — admins create promo
-- codes, configure the lucky wheel and launch contests through the
-- admin UI.

-- ---------------------------------------------------------------------
-- promo_codes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  amount             NUMERIC(20, 2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'PLN',
  max_redemptions    INTEGER,
  per_user_limit     INTEGER NOT NULL DEFAULT 1,
  expires_at         TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes (code);
CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON promo_codes (active);

-- ---------------------------------------------------------------------
-- promo_redemptions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id            TEXT PRIMARY KEY,
  promo_code_id TEXT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  amount        NUMERIC(20, 2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_redemptions_promo_idx ON promo_redemptions (promo_code_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx ON promo_redemptions (user_id);

-- ---------------------------------------------------------------------
-- bonus_wheel_spins
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bonus_wheel_spins (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  amount     NUMERIC(20, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bonus_wheel_spins_user_at_idx ON bonus_wheel_spins (user_id, created_at);
CREATE INDEX IF NOT EXISTS bonus_wheel_spins_at_idx ON bonus_wheel_spins (created_at);

-- ---------------------------------------------------------------------
-- contests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contests (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT,
  visibility         TEXT NOT NULL DEFAULT 'public',
  prize_pool         NUMERIC(20, 2) NOT NULL,
  winners_count      INTEGER NOT NULL,
  prize_shares       JSONB NOT NULL,
  rules              JSONB NOT NULL,
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  resolved_winners   JSONB,
  state              TEXT NOT NULL DEFAULT 'scheduled',
  created_by_user_id TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contests_visibility_state_idx ON contests (visibility, state);
CREATE INDEX IF NOT EXISTS contests_ends_at_idx ON contests (ends_at);

-- ---------------------------------------------------------------------
-- contest_participants
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contest_participants (
  id         TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  banned     BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, user_id)
);

CREATE INDEX IF NOT EXISTS contest_participants_user_idx ON contest_participants (user_id);
