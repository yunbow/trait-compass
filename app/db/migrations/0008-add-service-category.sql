-- migration 0008: WAM NET由来の国制度上のサービス分類を facilities に構造化して保持する。
-- facility_tags は相談分野タグ(SUPPORT_TAGS)専用のため、サービス分類は混在させない。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0008-add-service-category.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイル不要。

ALTER TABLE facilities ADD COLUMN service_category TEXT
  CHECK (service_category IS NULL OR service_category IN (
    '児童発達支援','放課後等デイサービス','保育所等訪問支援',
    '居宅訪問型児童発達支援','障害児相談支援','自立訓練',
    '就労移行支援','就労定着支援'
  ));
