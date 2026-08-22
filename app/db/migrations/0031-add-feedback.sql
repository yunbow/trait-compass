-- migration 0031: 支援先一覧画面「このページで、次に何をすればよいか分かりましたか?」フィードバック
-- (3択評価 + 「まだ分からない」時の内訳 + 任意の一言コメント)の集計カウンタ・コメント・
-- 送信レート制限テーブルを追加する。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0031-add-feedback.sql (本番は --remote)
--
-- プライバシー最小主義(個人を特定できる情報を一切保存しない、NFR-31〜33)を厳守するため、
-- 3択評価・内訳は行レベル記録を一切持たず「日付×選択肢」の純粋な集計カウンタのみとする
-- (usage_counts と同方針)。コメントのみ「送信された自由記述文そのもの」を保持する必要があるため
-- 行レベルで保持するが、created_date は日付(YYYY-MM-DD)のみとし、IP・User-Agent・詳細な
-- タイムスタンプ等の付随情報は一切保存しない。

-- 3択評価(「分かった」「少し分かった」「まだ分からない」)の日付×画面×選択肢の集計カウンタ。
-- 行レベル記録は持たない(誰が・いつ・何回押したかは復元できない)。
CREATE TABLE IF NOT EXISTS feedback_rating_counts (
  -- 集計日(ISO 8601 の日付部分のみ、UTC、例: '2026-08-19')。時刻は保持しない。
  date TEXT NOT NULL,
  -- 評価元の画面。今後の画面追加に備え、支援先一覧(support-results)と結果準備画面
  -- (result-prepare)の2値で開始する。
  source TEXT NOT NULL CHECK (source IN ('support-results', 'result-prepare')),
  -- 3択評価。
  rating TEXT NOT NULL CHECK (rating IN ('clear', 'partial', 'unclear')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, source, rating)
);

-- rating='unclear' を選んだ場合の内訳(単一選択・任意)の日付×選択肢の集計カウンタ。
-- feedback_rating_counts とは意図的に別テーブルにする(内訳は画面(source)非依存の理由の
-- 集計であり、source別に持つ必要がないため)。行レベル記録は持たない。
CREATE TABLE IF NOT EXISTS feedback_unclear_reason_counts (
  date TEXT NOT NULL,
  -- 「まだ分からない」の理由。
  reason TEXT NOT NULL CHECK (reason IN ('facility-fit', 'first-step', 'scheme-diff', 'info-gap', 'other')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, reason)
);

-- 任意の一言コメント(公開許可付き)。このテーブルのみ、送信された自由記述文そのものを
-- 行レベルで保持する(3択評価・内訳とは異なり集計値に還元できないため)。個人を特定できる
-- 情報(IP・User-Agent・詳細なタイムスタンプ等)は一切含めず、created_date も日付
-- (YYYY-MM-DD)のみを保持する。
CREATE TABLE IF NOT EXISTS feedback_comments (
  -- 受付ID(サーバー生成UUID)。
  id TEXT PRIMARY KEY,
  -- 送信日(ISO 8601 の日付部分のみ、UTC)。時刻は保持しない。
  created_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('support-results', 'result-prepare')),
  -- コメント本文(トリム後1〜500字、送信者側で検証済みだが列側には長さ制約を付けない
  -- ・SQLite の TEXT には文字数上限を課す標準的な CHECK 手段がないため、検証は
  -- zod スキーマ側(FeedbackRequestSchema)の責務とする)。
  comment_text TEXT NOT NULL,
  -- 送信者が「このコメントを公開してよい」に同意したかどうか(0/1)。同意が無い場合、
  -- published を 1 にしてはならない(運用ルール、DBの制約では表現しない)。
  publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (publish_consent IN (0, 1)),
  -- 公開フラグ(0/1)。開発者が内容を確認したうえで wrangler d1 execute で手動更新する
  -- (facility_reports.status と同じく専用の管理UIは持たない)。既定は未公開(0)。
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_created_date ON feedback_comments(created_date);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_published ON feedback_comments(published);

-- フィードバック送信(POST /api/feedback)専用のレート制限カウンタ。ai_rate_limits /
-- report_rate_limits / beta_gate_rate_limits / track_rate_limits とは意図的に別テーブルとする。
-- IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_window_start ON feedback_rate_limits(window_start);
