-- ═══════════════════════════════════════════════════════════════════════════
-- IOKNBO Finance Tracker — Initial PostgreSQL Schema
-- Migration: 001_initial.sql
-- Run via: psql $DATABASE_URL -f database/migrations/001_initial.sql
-- Or apply through Supabase SQL Editor / Dashboard
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Mirrors Supabase auth.users but with app-level profile data.
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         TEXT UNIQUE NOT NULL,          -- Supabase auth.users.id
  display_name    TEXT NOT NULL DEFAULT '',
  currency        CHAR(3) NOT NULL DEFAULT 'USD', -- ISO 4217
  mood_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TYPE transaction_category AS ENUM (
  'needs', 'wants', 'savings', 'debt_payment', 'income', 'transfer'
);

CREATE TYPE mood_tag AS ENUM (
  'happy', 'sad', 'anxious', 'neutral', 'excited', 'tired', 'grateful'
);

CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount           NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency         CHAR(3) NOT NULL,
  amount_base      NUMERIC(14, 2) NOT NULL CHECK (amount_base >= 0),
  category         transaction_category NOT NULL,
  merchant         TEXT,
  note             TEXT,
  mood_tag         mood_tag,
  receipt_url      TEXT,
  emoji_tag        TEXT,
  transaction_date DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions (user_id, category);

-- ─── Savings Goals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS savings_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  target_amount   NUMERIC(14, 2) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency        CHAR(3) NOT NULL,
  deadline        DATE,
  branch_emoji    TEXT NOT NULL DEFAULT '🌿',
  is_achieved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-mark goal as achieved when current_amount >= target_amount
CREATE OR REPLACE FUNCTION mark_goal_achieved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_amount >= NEW.target_amount THEN
    NEW.is_achieved := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_goal_achieved
BEFORE UPDATE ON savings_goals
FOR EACH ROW EXECUTE FUNCTION mark_goal_achieved();

-- ─── Debts ────────────────────────────────────────────────────────────────────
CREATE TYPE debt_direction AS ENUM ('borrowed', 'lent');

CREATE TABLE IF NOT EXISTS debts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty_name   TEXT NOT NULL,
  direction           debt_direction NOT NULL,
  amount              NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency            CHAR(3) NOT NULL,
  due_date            DATE,
  note                TEXT,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debts_user_settled
  ON debts (user_id, settled_at NULLS FIRST);

-- ─── Bill Splits ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  total_amount    NUMERIC(14, 2) NOT NULL CHECK (total_amount > 0),
  currency        CHAR(3) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS split_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id        UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  share_amount    NUMERIC(14, 2) NOT NULL CHECK (share_amount >= 0),
  paid_at         TIMESTAMPTZ
);

-- ─── AI Reflections ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reflections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  narrative_text  TEXT NOT NULL,
  budget_alert    TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reflections_user
  ON ai_reflections (user_id, generated_at DESC);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all user-owned tables so Supabase client queries are
-- automatically scoped to the authenticated user.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reflections ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own row
CREATE POLICY "users: own row" ON users
  USING (auth.uid()::text = auth_id);

-- Transactions: scoped to owner
CREATE POLICY "transactions: owner only" ON transactions
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Savings goals: scoped to owner
CREATE POLICY "savings_goals: owner only" ON savings_goals
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Debts: scoped to owner
CREATE POLICY "debts: owner only" ON debts
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Splits: owner can read/write
CREATE POLICY "splits: owner only" ON splits
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Split participants: readable if parent split belongs to user
CREATE POLICY "split_participants: via split owner" ON split_participants
  USING (
    split_id IN (
      SELECT id FROM splits
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- AI reflections: scoped to owner
CREATE POLICY "ai_reflections: owner only" ON ai_reflections
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- ─── updated_at auto-update trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_savings_goals_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_debts_updated_at BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
