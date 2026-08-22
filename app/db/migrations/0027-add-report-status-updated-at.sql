-- migration 0027: 掲載情報の訂正・更新報告(facility_reports/content_reports)の
-- status_updated_at 列を追加する。自由記述(corrected_value/detail_text)の保持期限
-- (status が done/dismissed になってから90日、report-retention.ts)を判定するために使う。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0027-add-report-status-updated-at.sql (本番は --remote)

ALTER TABLE facility_reports ADD COLUMN status_updated_at TEXT;
ALTER TABLE content_reports ADD COLUMN status_updated_at TEXT;

-- 既存のdone/dismissed行は実際のトリアージ日時を記録していないため、created_atで代用する
-- (保持期限を安全側=実際より早く起算するだけで、データ最小化の観点では問題ない)。
UPDATE facility_reports SET status_updated_at = created_at WHERE status != 'new' AND status_updated_at IS NULL;
UPDATE content_reports SET status_updated_at = created_at WHERE status != 'new' AND status_updated_at IS NULL;
