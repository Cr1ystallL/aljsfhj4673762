-- Migration: direct_crypto_deposits
-- Create table for tracking direct crypto wallet deposits (TRC20, TON, BEP20)

CREATE TABLE IF NOT EXISTS direct_crypto_deposits (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    telegram_id BIGINT NOT NULL,
    network VARCHAR(32) NOT NULL, -- 'TRC20', 'TON', 'BEP20'
    requested_pln NUMERIC(20, 2) NOT NULL,
    unique_usdt NUMERIC(20, 4) NOT NULL,
    fx_rate NUMERIC(10, 4) NOT NULL,
    deposit_address TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'expired', 'cancelled'
    tx_hash TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    credit_tx_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_direct_crypto_user_status ON direct_crypto_deposits (user_id, status);
CREATE INDEX IF NOT EXISTS idx_direct_crypto_network_status ON direct_crypto_deposits (network, status);
CREATE INDEX IF NOT EXISTS idx_direct_crypto_unique_usdt ON direct_crypto_deposits (unique_usdt, status);
