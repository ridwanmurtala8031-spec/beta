DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS signals;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS user_premiums;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS user_lanes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS group_bindings;

CREATE TABLE IF NOT EXISTS group_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  topic_id TEXT,
  lane TEXT NOT NULL,
  market TEXT NOT NULL,
  data TEXT,
  purpose TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  safety_profile TEXT NOT NULL DEFAULT 'balanced',
  priority_fee_tier TEXT DEFAULT 'medium',
  show_token_preview INTEGER NOT NULL DEFAULT 1,
  unsafe_override INTEGER NOT NULL DEFAULT 0,
  price_impact_limit INTEGER DEFAULT 500,
  liquidity_minimum TEXT DEFAULT '1000',
  tp_percent INTEGER,
  sl_percent INTEGER,
  min_buy_amount TEXT DEFAULT '0.01',
  priority_fee_amount TEXT DEFAULT '0.0015',
  mev_protection INTEGER NOT NULL DEFAULT 1,
  max_retries INTEGER DEFAULT 3,
  rpc_preference TEXT DEFAULT 'auto',
  custom_rpc_url TEXT,
  duplicate_protection INTEGER NOT NULL DEFAULT 1,
  is_mainnet INTEGER NOT NULL DEFAULT 1,
  last_airdrop INTEGER,
  last_active INTEGER,
  withdrawal_address TEXT,
  withdrawal_amount TEXT
);

CREATE TABLE IF NOT EXISTS user_lanes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  topic_id TEXT,
  lane TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_premiums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  daily_analyze_usage INTEGER NOT NULL DEFAULT 0,
  daily_other_usage INTEGER NOT NULL DEFAULT 0,
  last_usage_reset INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  is_owner INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_mainnet INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 0,
  balance TEXT DEFAULT '0',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  bias TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  timeframe TEXT DEFAULT '1h',
  status TEXT DEFAULT 'active',
  entry_price TEXT,
  tp1 TEXT,
  tp2 TEXT,
  tp3 TEXT,
  sl TEXT,
  message_id TEXT,
  chat_id TEXT,
  topic_id TEXT,
  last_update_at INTEGER,
  next_update_at INTEGER,
  data TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  wallet_id INTEGER NOT NULL,
  mint TEXT NOT NULL,
  symbol TEXT,
  amount_in TEXT NOT NULL,
  amount_out TEXT,
  entry_price TEXT,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  error TEXT,
  tp1 TEXT,
  sl TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
CREATE INDEX IF NOT EXISTS idx_user_lanes_user_id ON user_lanes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_group_id ON user_subscriptions(group_id);
CREATE INDEX IF NOT EXISTS idx_user_premiums_user_id ON user_premiums(user_id);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_is_active ON wallets(is_active);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_chat_id ON signals(chat_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_id ON trades(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_mint ON trades(mint);
CREATE INDEX IF NOT EXISTS idx_group_bindings_group_id ON group_bindings(group_id);
