-- migration 0004: facilities に電話以外の連絡手段(contact_methods)を追加する(TICKET-0051)。
--
-- 対象: db/schema.sql をまだ適用していない新規環境は schema.sql の CREATE TABLE に
-- 既に contact_methods が含まれているためこのファイルは不要(schema.sql をそのまま実行すればよい)。
-- 本ファイルは、TICKET-0051 より前に schema.sql(facilities に contact_methods が無いバージョン)を
-- 適用済みの既存環境(本番 D1 等)に対して差分適用するためのものである(db/migrations/0002,
-- 0003 と同じパターン)。
--
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0004-add-contact-methods.sql
-- ローカル(db:reset:local)は schema.sql を毎回フルで再適用するため、このファイルを
-- 使う必要はない。
--
-- 冪等性について: SQLite の `ALTER TABLE ADD COLUMN` は `IF NOT EXISTS` をサポートしない
-- ため、既に本マイグレーションを適用済みの環境で再実行すると
-- `duplicate column name: contact_methods` のエラーになる。一度きりの適用を想定し、適用前に
-- `PRAGMA table_info(facilities);` で contact_methods が未追加であることを確認すること。

ALTER TABLE facilities ADD COLUMN contact_methods TEXT;
