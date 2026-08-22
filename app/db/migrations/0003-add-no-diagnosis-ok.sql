-- migration 0003: facilities に「診断がなくても相談できる」フラグ(no_diagnosis_ok)を
-- 追加する(TICKET-0050)。
--
-- 対象: db/schema.sql をまだ適用していない新規環境は schema.sql の CREATE TABLE に
-- 既に no_diagnosis_ok が含まれているためこのファイルは不要(schema.sql をそのまま実行すればよい)。
-- 本ファイルは、TICKET-0050 より前に schema.sql(facilities に no_diagnosis_ok が無いバージョン)を
-- 適用済みの既存環境(本番 D1 等)に対して差分適用するためのものである(db/migrations/0002-add-latlng.sql
-- と同じパターン)。
--
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0003-add-no-diagnosis-ok.sql
-- ローカル(db:reset:local)は schema.sql を毎回フルで再適用するため、このファイルを
-- 使う必要はない。
--
-- 冪等性について: SQLite の `ALTER TABLE ADD COLUMN` は `IF NOT EXISTS` をサポートしない
-- ため、既に本マイグレーションを適用済みの環境で再実行すると
-- `duplicate column name: no_diagnosis_ok` のエラーになる。一度きりの適用を想定し、適用前に
-- `PRAGMA table_info(facilities);` で no_diagnosis_ok が未追加であることを確認すること。

ALTER TABLE facilities ADD COLUMN no_diagnosis_ok INTEGER NOT NULL DEFAULT 0 CHECK (no_diagnosis_ok IN (0, 1));
