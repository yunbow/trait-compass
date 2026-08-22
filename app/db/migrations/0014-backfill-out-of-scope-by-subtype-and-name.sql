-- migration 0014: サブタイプ・施設名による is_out_of_scope バックフィル第3弾(migration 0012/0013 と同方式・冪等)。
-- 1) 台東区「区役所」CSV(ds-taito-kuyakusho)の「大分類=区民事務所」(証明書発行窓口・5行)と
--    「大分類=地区センター」(集会室貸出施設・5行)は相談機能を持たないため、
--    workers/ingest/transform.ts の OUT_OF_SCOPE_SUBTYPES へ両値を追加済み(「区役所」本体は除外しない)。
-- 2) 社会福祉協議会(ds-taito-fukushi-shisetsu): 台東区社協の総合事務所。キーワード化すると
--    WAM NET の「〇〇市社会福祉協議会…相談支援事業所」等の正規の障害相談窓口を誤除外するため、
--    transform.ts の OUT_OF_SCOPE_EXACT_NAMES による施設名完全一致で除外する。本 SQL も完全一致で対応させる。
-- 3) 身体障害者生活ホーム「フロム千束」(ds-taito-fukushi-shisetsu): 身体障害専用のグループホーム。
--    「身体障害者」は三障害複合の相談支援施設名にも現れうるため、同じく OUT_OF_SCOPE_EXACT_NAMES の完全一致で除外する。
-- raw_json の「大分類」「名称」キーを持たない行(手動シード・HTML由来)は json_extract が NULL となり影響しない。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0014-backfill-out-of-scope-by-subtype-and-name.sql
-- ローカルは同コマンド(--local)。db:reset:local(schema.sql フル再適用+再取込)では取込ロジック側で判定されるため本ファイル不要。

UPDATE facilities SET is_out_of_scope = 1
WHERE is_out_of_scope = 0
  AND (
    TRIM(json_extract(raw_json, '$.大分類')) IN ('区民事務所', '地区センター')
    OR TRIM(json_extract(raw_json, '$.名称')) IN ('社会福祉協議会', '身体障害者生活ホーム「フロム千束」')
  );
