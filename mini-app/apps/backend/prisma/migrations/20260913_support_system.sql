-- Support System Tables Migration
-- Creates support_tickets and support_messages with compatible VARCHAR(64) keys referencing users(id)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  subject VARCHAR(255),
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  unread_user_count INT NOT NULL DEFAULT 0,
  unread_admin_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at ON support_tickets(last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ticket_id VARCHAR(64) NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL,
  sender_id VARCHAR(100) NOT NULL,
  sender_name VARCHAR(100),
  text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at ASC);
