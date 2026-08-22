-- migration 0021: AI 機能(LLM 呼び出し)の IP 単位レート制限カウンタ ai_rate_limits を追加する
-- (TICKET-0035)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0021-add-ai-rate-limits.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_window_start ON ai_rate_limits(window_start);
