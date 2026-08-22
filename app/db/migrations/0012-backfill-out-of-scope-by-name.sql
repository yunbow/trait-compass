-- migration 0012: 施設名キーワードによる is_out_of_scope バックフィル。
-- 台東区「福祉施設」CSV(ds-taito-fukushi-shisetsu)の汎用「大分類=福祉施設」バケットに、
-- 名称から高齢者専用と判別できる行(ケアハウス松が谷)が1件残っていたため、
-- workers/ingest/transform.ts の OUT_OF_SCOPE_NAME_PATTERN と同一のキーワードで再導出する(冪等)。
-- raw_json の「名称」キーを持たない行(手動シード・HTML由来)は json_extract が NULL となり影響しない。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0012-backfill-out-of-scope-by-name.sql
-- ローカルは同コマンド(--local)。db:reset:local(schema.sql フル再適用+再取込)では取込ロジック側で判定されるため本ファイル不要。

UPDATE facilities SET is_out_of_scope = 1
WHERE is_out_of_scope = 0
  AND (
    TRIM(json_extract(raw_json, '$.名称')) LIKE '%ケアハウス%'
    OR TRIM(json_extract(raw_json, '$.名称')) LIKE '%老人ホーム%'
    OR TRIM(json_extract(raw_json, '$.名称')) LIKE '%老人福祉%'
    OR TRIM(json_extract(raw_json, '$.名称')) LIKE '%地域包括支援センター%'
  );
