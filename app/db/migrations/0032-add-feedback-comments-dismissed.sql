-- migration 0032: feedback_comments に dismissed 列を追加する。
-- 背景: published(0/1)だけでは「まだレビューしていない」と「レビューした結果、掲載を
-- 見送ると判断した」を区別できず、日次Slackダイジェスト(feedback-digest.ts)が
-- 見送り済みの同一コメントを毎日通知し続けてしまう問題があった。facility_reports/
-- content_reports の status(new/done/dismissed)と同じ設計思想で、「人間が確認済み」を
-- 表す dismissed を published とは別に持つ(published は /outcomes 表示のゲートという
-- 既存の役割を変えないため、あえて別列にする)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0032-add-feedback-comments-dismissed.sql (本番は --remote)

ALTER TABLE feedback_comments ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_feedback_comments_dismissed ON feedback_comments(dismissed);
