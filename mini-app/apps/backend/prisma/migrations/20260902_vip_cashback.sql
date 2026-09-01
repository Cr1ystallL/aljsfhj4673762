-- VIP System & Loyalty Cashback
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_level INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_vip_rewards INT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_cashback_claimed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS users_xp_idx ON users (xp);
CREATE INDEX IF NOT EXISTS users_vip_level_idx ON users (vip_level);
