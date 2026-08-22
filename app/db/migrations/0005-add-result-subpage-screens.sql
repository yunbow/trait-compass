-- migration 0005: usage_counts.screen の CHECK 制約に、/result 副次ページ3画面
-- (result-prepare / result-summarize / result-recommend)を追加する。
--
-- 対象: db/schema.sql をまだ適用していない新規環境は schema.sql の CREATE TABLE に
-- 既に3画面が含まれているためこのファイルは不要(schema.sql をそのまま実行すればよい)。
-- 本ファイルは、/result 副次ページの追加より前に schema.sql を適用済みの既存環境
-- (本番 D1 等)に対して差分適用するためのものである。
--
-- SQLite は ALTER TABLE で CHECK 制約を直接変更できないため、新テーブルを作成して
-- データを移行し、旧テーブルを置き換える標準的な手順を取る。
--
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0005-add-result-subpage-screens.sql
-- ローカル(db:reset:local)は schema.sql を毎回フルで再適用するため、このファイルを
-- 使う必要はない。

CREATE TABLE usage_counts_new (
  date TEXT NOT NULL,
  screen TEXT NOT NULL CHECK (screen IN ('top', 'survey', 'result', 'support-results', 'result-prepare', 'result-summarize', 'result-recommend')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, screen)
);

INSERT INTO usage_counts_new SELECT * FROM usage_counts;

DROP TABLE usage_counts;

ALTER TABLE usage_counts_new RENAME TO usage_counts;
