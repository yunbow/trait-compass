-- migration 0035: facility_tags_backup(再取込時のタグ退避用ステージングテーブル)を追加する。
--
-- 外部コードレビュー指摘(P1): ingest-open-data.mjs は1データセットのSQLが1,000文単位で
-- チャンク分割され、チャンクごとに別々のwrangler d1 execute呼び出し(それぞれ独立した
-- トランザクション)として実行される。従来の「CREATE TABLE ... AS SELECT + 末尾DROP TABLE」の
-- 使い捨て退避テーブルでは、チャンク境界をまたいだ中断(例: 1,001件中994件挿入した時点で
-- 失敗)後に再実行すると、冒頭のDROP TABLE IF EXISTSが直前の(復元前の)退避テーブルを
-- 消してしまい、既に空になったfacility_tagsから取り直すため、タグが永久に失われる
-- (実機再現済み)。
--
-- 本テーブルはdataset_id列を持つ永続テーブルとし、ingest-open-data.mjsのbuildSqlForSourceが
-- 「そのdataset_idの退避行が既に存在するか」で退避済み判定を行う。中断からの再実行を
-- 何度繰り返してもタグを失わない設計にする(詳細はdb/schema.sqlの当該テーブルコメント参照)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0035-add-facility-tags-backup.sql
-- ローカル(db:reset:local / db:migrate:local)はschema.sqlをフル再適用するため本ファイルは不要。

CREATE TABLE IF NOT EXISTS facility_tags_backup (
  facility_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  PRIMARY KEY (facility_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_facility_tags_backup_dataset_id ON facility_tags_backup(dataset_id);
