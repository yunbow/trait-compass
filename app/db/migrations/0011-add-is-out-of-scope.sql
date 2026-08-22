-- migration 0011: アプリの対象領域(発達障害の相談支援)から外れる施設の除外フラグを追加する。
-- 台東区「福祉施設」CSV(ds-taito-fukushi-shisetsu)に高齢者専用の3分類(地域包括支援センター等、
-- 計32行)が含まれることが判明したため、is_medical(FR-025)と同じ機構(取込時に判定・
-- 検索クエリで除外・データ自体は保持)で除外する。判定は workers/ingest/transform.ts の
-- OUT_OF_SCOPE_SUBTYPES(解決済み facility_subtype の完全一致、データセット非依存)。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0011-add-is-out-of-scope.sql
-- ローカルの既存 DB にも同コマンド(--local)で適用可能。db:reset:local は schema.sql をフル再適用するため本ファイル不要。

ALTER TABLE facilities ADD COLUMN is_out_of_scope INTEGER NOT NULL DEFAULT 0 CHECK (is_out_of_scope IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_facilities_is_out_of_scope ON facilities(is_out_of_scope);

-- 既存行のバックフィル: migration 0010 と同じく raw_json の「大分類」から再導出する(冪等)。
-- どの環境でも取込ロジックと同じ判定になり、raw_json を持たない手動シード行
-- (json_extract が NULL)は既定値 0 のまま影響を受けない。
UPDATE facilities SET is_out_of_scope = 1
WHERE TRIM(json_extract(raw_json, '$.大分類')) IN (
  '地域包括支援センター・ケアマネジメントセンター',
  '特別養護老人ホーム・高齢者在宅サービスセンター',
  '老人福祉センター・老人福祉館'
);
