-- migration 0023: 支援検索結果画面の「1分でわかるガイド」機能のため、自治体固有の補足内容
-- (手動調査データ由来)を保持する results_guide_notes を追加する。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0023-add-results-guide-notes.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS results_guide_notes (
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  tab TEXT NOT NULL CHECK (tab IN ('相談窓口','学校情報','福祉ガイド')),
  body_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_results_guide_notes_lookup ON results_guide_notes(municipality, tab);
