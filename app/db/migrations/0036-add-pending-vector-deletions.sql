-- migration 0036: pending_vector_deletions(Vectorize 削除同期用の outbox テーブル)を追加する。
--
-- 外部コードレビュー指摘(項目1): batch/ingest/workflow.ts の runEmbeddingStep は、当該
-- Workflow 実行で削除された facility ID(deleteStaleFacilities の戻り値)を引数で受け取り
-- VectorStore.delete() を呼ぶだけだった。この delete が(step.do のリトライを使い果たすなどで)
-- 失敗すると `{ status: "error" }` を返すのみで、削除対象 ID はどこにも永続化されない。
-- 次回の Workflow 実行時には該当 facility は既に D1 から削除済みのため deleteStaleFacilities の
-- 差分検出に再び現れることはなく、Vectorize 側には古いベクトルが永久に残留してしまう。
--
-- 本テーブルは「facilities から削除された(=Vectorize からも削除すべき)facility_id」を記録する
-- 永続的な outbox とし、db.ts の deleteStaleFacilities が facilities/facility_tags の削除と
-- 同一の db.batch(アトミック)内で本テーブルへの INSERT も行う。workflow.ts の
-- runEmbeddingStep は、今回の実行で削除された ID だけでなく本テーブルの全行を毎回読み取って
-- VectorStore.delete の対象にし、削除に成功した行だけを本テーブルから取り除く
-- (失敗した行は次回実行時に再度リトライされる自己修復設計)。
--
-- ローカル取込スクリプト(ingest-open-data.mjs / ingest-manual-survey.mjs)が生成する SQL も、
-- facilities を削除する箇所で同様に本テーブルへ記録する。これにより、ローカルスクリプト経由で
-- 本番 D1 から削除された facility のベクトルも、次回の CKAN 取込 Worker 実行時
-- (EMBEDDINGS_ENABLED=true)に自動的に Vectorize から削除される。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0036-add-pending-vector-deletions.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイルは不要。

CREATE TABLE IF NOT EXISTS pending_vector_deletions (
  facility_id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
