-- migration 0024: 掲載情報の誤り報告 facility_reports と、その送信レート制限カウンタ
-- report_rate_limits を追加する(TICKET-0064)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0024-add-facility-reports.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS facility_reports (
  -- 受付ID(サーバー生成 UUID)。
  id TEXT PRIMARY KEY,
  -- 送信時点の施設ID。再取込でIDが変わり得るため参照整合は張らず、下のスナップショットを正とする。
  facility_id TEXT NOT NULL,
  -- 検索・突合用に非正規化した施設名・自治体(スナップショット)。
  facility_name TEXT NOT NULL,
  municipality TEXT NOT NULL,
  -- 送信時点で配信していた施設情報全体のスナップショット(JSON)。
  facility_snapshot_json TEXT NOT NULL,
  -- 報告種別(単一選択)。
  report_category TEXT NOT NULL CHECK (report_category IN
    ('phone','address','content','closure','link','unclear','other')),
  -- closure の場合のみ: 現在の状況。
  closure_status TEXT CHECK (closure_status IN
    ('closed','moved','renamed','merged','unknown-mismatch')),
  -- 正しいと思われる内容(任意、最大200字)。
  corrected_value TEXT,
  -- 補足・情報源など自由記述(任意、最大500字)。
  detail_text TEXT,
  -- 運用トリアージ状態。開発者が wrangler CLI で UPDATE する。
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_facility_reports_status ON facility_reports(status);
CREATE INDEX IF NOT EXISTS idx_facility_reports_created_at ON facility_reports(created_at);

CREATE TABLE IF NOT EXISTS report_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_report_rate_limits_window_start ON report_rate_limits(window_start);
