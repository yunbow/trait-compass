-- migration 0030: 利用計測(POST /api/track)の IP 単位レート制限カウンタ track_rate_limits を
-- 追加する(セキュリティレビュー指摘: レート制限が無く連続POSTでusage_countsを汚染できたため)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0030-add-track-rate-limits.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS track_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_track_rate_limits_window_start ON track_rate_limits(window_start);
