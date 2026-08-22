-- migration 0010: facility_subtype をデータセット単位既定値から CSV 行単位の値(「大分類」列)へ移行する。
-- 語彙はデータセット追加のたびに増える開放集合であることが判明したため、CHECK 制約(閉じた列挙)は
-- 廃止し素の TEXT 列とする(値の妥当性は取込 Worker 側の責務。facility_tags.tag と同じ方針)。
-- SQLite は CHECK の変更ができないが、この列自身に紐づく列レベル CHECK は列ごと DROP できるため、
-- DROP COLUMN → ADD COLUMN で作り直す(facility_subtype にインデックス・参照は無い)。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0010-facility-subtype-per-row.sql
-- ローカルの既存 DB にも同コマンド(--local)で適用可能。db:reset:local は schema.sql をフル再適用するため本ファイル不要。

ALTER TABLE facilities DROP COLUMN facility_subtype;
ALTER TABLE facilities ADD COLUMN facility_subtype TEXT;

-- 既存行のバックフィル: raw_json(取込元 CSV 行の生データ)の「大分類」から再導出する。
-- 空・欠損セルは従来のデータセット単位既定値へフォールバックする(取込ロジックと同じ規則。冪等)。
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '行政窓口')            WHERE dataset_id = 'ds-taito-kuyakusho';
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '子ども家庭支援')      WHERE dataset_id = 'ds-taito-kodomo-katei-shien';
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '保健施設')            WHERE dataset_id = 'ds-taito-hoken-shisetsu';
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '福祉施設')            WHERE dataset_id = 'ds-taito-fukushi-shisetsu';
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '児童館・こどもクラブ') WHERE dataset_id = 'ds-taito-jidokan';
UPDATE facilities SET facility_subtype = COALESCE(NULLIF(TRIM(json_extract(raw_json, '$.大分類')), ''), '保育施設')            WHERE dataset_id = 'ds-taito-hoiku-shisetsu';
