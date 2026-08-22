-- migration 0026: クローズドベータのパスワードゲート(/api/beta-gate)の IP 単位レート制限カウンタ
-- beta_gate_rate_limits を追加する(パスワード総当たり対策)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0026-add-beta-gate-rate-limits.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS beta_gate_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_beta_gate_rate_limits_window_start ON beta_gate_rate_limits(window_start);
