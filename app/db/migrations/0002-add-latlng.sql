-- migration 0002: facilities に緯度経度(lat/lng)カラムを追加する(FR-02A, TICKET-0028)。
--
-- 対象: db/schema.sql をまだ適用していない新規環境は schema.sql の CREATE TABLE に
-- 既に lat/lng が含まれているためこのファイルは不要(schema.sql をそのまま実行すればよい)。
-- 本ファイルは、TICKET-0028 より前に schema.sql(facilities に lat/lng が無いバージョン)を
-- 適用済みの既存環境(本番 D1 等)に対して差分適用するためのものである。
--
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0002-add-latlng.sql
-- ローカル(db:reset:local)は schema.sql を毎回フルで再適用するため、このファイルを
-- 使う必要はない。
--
-- 冪等性について: SQLite の `ALTER TABLE ADD COLUMN` は `IF NOT EXISTS` をサポートしない
-- ため(schema.sql の CREATE TABLE IF NOT EXISTS のような冪等再実行はできない)、
-- 既に本マイグレーションを適用済みの環境で再実行すると
-- `duplicate column name: lat` のエラーになる。一度きりの適用を想定し、適用前に
-- `PRAGMA table_info(facilities);` で lat/lng が未追加であることを確認すること。

ALTER TABLE facilities ADD COLUMN lat REAL;
ALTER TABLE facilities ADD COLUMN lng REAL;
