-- migration 0009: 台東区オープンデータ由来のデータセット単位の施設サブタイプを facilities に保持する。
-- 生CSVにはサブタイプ列が無いため、datasets.config.ts のデータセット単位既定値
-- (defaultFacilitySubtype)から投入する。対象外の取込元では NULL を許容する。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0009-add-facility-subtype.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイル不要。

ALTER TABLE facilities ADD COLUMN facility_subtype TEXT
  CHECK (facility_subtype IS NULL OR facility_subtype IN (
    '行政窓口','子ども家庭支援','保健施設','福祉施設',
    '児童館・こどもクラブ','保育施設'
  ));

-- 既存行のバックフィル(次回 cron 取込を待たずに反映する。UPSERT と同じ値なので冪等)。
UPDATE facilities SET facility_subtype = '行政窓口'          WHERE dataset_id = 'ds-taito-kuyakusho';
UPDATE facilities SET facility_subtype = '子ども家庭支援'    WHERE dataset_id = 'ds-taito-kodomo-katei-shien';
UPDATE facilities SET facility_subtype = '保健施設'          WHERE dataset_id = 'ds-taito-hoken-shisetsu';
UPDATE facilities SET facility_subtype = '福祉施設'          WHERE dataset_id = 'ds-taito-fukushi-shisetsu';
UPDATE facilities SET facility_subtype = '児童館・こどもクラブ' WHERE dataset_id = 'ds-taito-jidokan';
UPDATE facilities SET facility_subtype = '保育施設'          WHERE dataset_id = 'ds-taito-hoiku-shisetsu';
