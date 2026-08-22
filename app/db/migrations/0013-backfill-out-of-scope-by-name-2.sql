-- migration 0013: 施設名による is_out_of_scope バックフィル第2弾(migration 0012 と同方式・冪等)。
-- 台東区「保健施設」CSV(ds-taito-hoken-shisetsu)は「大分類」が常に「保健施設」でサブタイプ判定が
-- 効かないため、名称ベースで高齢者向け2施設を除外する:
--   1) 老人保健施設千束: 「老人保健施設」(介護老人保健施設)は法令上高齢者専用の類型。
--      workers/ingest/transform.ts の OUT_OF_SCOPE_NAME_PATTERN へ同キーワードを追加済み。
--   2) 三ノ輪口腔ケアセンター: 「口腔ケア」は一般的なサービス記述語でキーワード化すると
--      障害者歯科等の誤除外リスクがあるため、transform.ts の OUT_OF_SCOPE_EXACT_NAMES による
--      施設名完全一致で除外する。本 SQL も完全一致で対応させる。
-- raw_json の「名称」キーを持たない行(手動シード・HTML由来)は json_extract が NULL となり影響しない。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0013-backfill-out-of-scope-by-name-2.sql
-- ローカルは同コマンド(--local)。db:reset:local(schema.sql フル再適用+再取込)では取込ロジック側で判定されるため本ファイル不要。

UPDATE facilities SET is_out_of_scope = 1
WHERE is_out_of_scope = 0
  AND (
    TRIM(json_extract(raw_json, '$.名称')) LIKE '%老人保健施設%'
    OR TRIM(json_extract(raw_json, '$.名称')) = '三ノ輪口腔ケアセンター'
  );
