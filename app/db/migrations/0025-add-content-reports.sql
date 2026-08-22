-- migration 0025: 掲載情報の訂正・更新報告を施設以外(想定ルート・学校情報・結果の見方ガイド)へ
-- 拡張するための content_reports を追加する。facility_reports(0024)は変更しない。
-- レート制限は 0024 の report_rate_limits を共用する(新テーブル不要)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0025-add-content-reports.sql (本番は --remote)

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('pathway','school','guide_note','guide_generic')),
  -- 送信時点の対象ID(support_pathways.id / schools.id / results_guide_notes.id)。
  -- guide_generic(D1行を持たない汎用ガイド)のみ NULL。参照整合は張らず snapshot を正とする。
  target_id TEXT,
  -- 検索・突合用に非正規化した対象の表示名(purpose_label / 学校名 / ガイド見出し)。
  target_label TEXT NOT NULL,
  municipality TEXT NOT NULL,
  -- pathway・guide のみ: 対象のライフステージ(schools は lifestage 非依存のため NULL)。
  lifestage TEXT CHECK (lifestage IN ('preschool','elementary-junior-high','high-school','university-vocational','working-adult')),
  -- guide_note / guide_generic のみ: 対象タブ。
  tab TEXT CHECK (tab IN ('相談窓口','学校情報','福祉ガイド','発達障害支援資料','支援制度')),
  -- 送信時点で配信していた対象情報全体のスナップショット(JSON)。サーバーが D1/ソースコードから再構築する。
  target_snapshot_json TEXT NOT NULL,
  report_category TEXT NOT NULL CHECK (report_category IN
    ('phone','address','contact','content','fixed-class','resource-room','school-status','link','outdated','unclear','other')),
  corrected_value TEXT,
  detail_text TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at);
