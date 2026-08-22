-- migration 0029: municipality_survey_meta に license_audit_json を追加。
-- licenseAudit(4種別のライセンス状態: schoolClassData/consultationWindowData/zoningData/
-- highSchoolData)をD1へ保持し、フロントエンドで「申請中のため現在未掲載です」等の
-- 非掲載理由のステータス表示に使う(内部の調査経緯を含み得る note は含めず、4ステータス値のみ)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0029-add-license-audit.sql
-- ローカルは schema.sql をフル再適用するため(db:migrate:local / db:reset:local)本ファイルは不要。
--
-- 冪等性: ALTER TABLE ADD COLUMN は再実行するとエラーになるため、0029自体の再適用はしない。

ALTER TABLE municipality_survey_meta ADD COLUMN license_audit_json TEXT;
