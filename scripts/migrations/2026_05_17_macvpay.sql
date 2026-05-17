-- Migration: MacvPay integration
--
-- Stores every deposit order so the webhook handler can be idempotent
-- and the admin can reconcile missed webhooks via the status-check API.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS macvpay_orders (
  -- MacvPay's own UUID for the order.
  id              TEXT PRIMARY KEY,
  -- Our internal user.
  user_id         TEXT NOT NULL,
  -- The external_id we sent to MacvPay (= "dep_<userId>_<timestamp>").
  external_id     TEXT NOT NULL UNIQUE,
  -- Amount the user requested (before MacvPay adds unique kopecks).
  requested_amount NUMERIC(20, 2) NOT NULL,
  -- Unique amount MacvPay assigned — user must pay exactly this.
  unique_amount   NUMERIC(20, 2),
  currency        TEXT NOT NULL DEFAULT 'PLN',
  -- "bank" or "revolut"
  payment_type    TEXT NOT NULL DEFAULT 'bank',
  -- Recipient details returned by MacvPay.
  card            TEXT,
  recipient       TEXT,
  details         TEXT,
  -- pending | paid | cancelled | expired | credited
  status          TEXT NOT NULL DEFAULT 'pending',
  -- When MacvPay says the order expires (minutes from creation).
  expires_at      TIMESTAMP(3),
  -- Filled in when webhook arrives.
  paid_amount     NUMERIC(20, 2),
  paid_at         TIMESTAMP(3),
  -- The transaction.id we created when crediting the balance.
  credit_tx_id    TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS macvpay_orders_user_idx
  ON macvpay_orders(user_id);
CREATE INDEX IF NOT EXISTS macvpay_orders_status_idx
  ON macvpay_orders(status);
CREATE INDEX IF NOT EXISTS macvpay_orders_external_idx
  ON macvpay_orders(external_id);
