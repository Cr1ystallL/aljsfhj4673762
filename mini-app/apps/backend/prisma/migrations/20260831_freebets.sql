-- Freebets (Фрибеты)
-- Campaigns and user-issued freebets for sports betting

CREATE TABLE IF NOT EXISTS freebet_campaigns (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'deposit',
  min_deposit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_odds NUMERIC(8, 2) NOT NULL DEFAULT 2.50,
  max_odds NUMERIC(8, 2) NOT NULL DEFAULT 35.00,
  min_legs INT NOT NULL DEFAULT 1,
  valid_days INT NOT NULL DEFAULT 7,
  payout_type VARCHAR(32) NOT NULL DEFAULT 'net_win',
  allowed_sports JSONB,
  max_per_user INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS freebet_campaigns_active_trigger_idx
  ON freebet_campaigns (active, trigger_type);

CREATE TABLE IF NOT EXISTS user_freebets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id VARCHAR(64) REFERENCES freebet_campaigns(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  min_odds NUMERIC(8, 2) NOT NULL DEFAULT 2.50,
  max_odds NUMERIC(8, 2) NOT NULL DEFAULT 35.00,
  min_legs INT NOT NULL DEFAULT 1,
  payout_type VARCHAR(32) NOT NULL DEFAULT 'net_win',
  allowed_sports JSONB,
  status VARCHAR(32) NOT NULL DEFAULT 'available',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  bet_id VARCHAR(64),
  source_deposit_id VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS user_freebets_user_status_idx
  ON user_freebets (user_id, status);

CREATE INDEX IF NOT EXISTS user_freebets_status_expires_idx
  ON user_freebets (status, expires_at);
