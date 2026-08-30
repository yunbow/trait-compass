-- migration 0037: open_data_batch_ids(ingest-open-data.mjs のUPSERT後始末用マーカーテーブル)を追加する。
--
-- 外部コードレビュー指摘(項目4): ingest-open-data.mjs の buildSqlForSource は facilities 本体を
-- 「DELETE FROM facilities WHERE dataset_id=X」→「N件INSERT」構成で投入しており、
-- splitSqlIntoChunks(1,000文単位)により大きな source では複数の独立した
-- wrangler d1 execute --file 呼び出し(それぞれ別トランザクション)に分割されうる。
-- 後半チャンクが失敗すると「既存データは消えたが新データは一部しか入っていない」部分投入状態
-- になる(facility_tags_backup と同種の非原子性の問題。facility_tags 側は migration 0035 で
-- 対応済みだが facilities 本体は未対応だった)。
--
-- facilities.id は idFor() による内容ハッシュのため、内容が変わらなければ再取込でも同じ id に
-- なる決定性を利用し、「UPSERT(ON CONFLICT DO UPDATE)+ 事後差分クリーンアップ」方式に変更する。
-- 本テーブルは「今回のバッチに含まれる facility_id」を実際のUPSERTより先にマーキングする
-- マーカーで、UPSERT自体がチャンク境界で中断しても、後始末(配信元で削除された facility の
-- 削除)は全チャンク成功後にのみ実行される独立した最終ステップのため、誤って削除されることはない
-- (詳細は ingest-open-data.mjs の buildSqlForSource / buildOrphanCleanupSql のコメント参照)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0037-add-open-data-batch-ids.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイルは不要。

-- dataset_id を PRIMARY KEY の先頭列にすることで、cleanup/reset時の
-- `WHERE dataset_id = X` 検索は追加のインデックス無しでこの主キーインデックスの前方一致で
-- 効率的に処理できる(facility_tags_backup のように dataset_id 用の別インデックスは不要)。
CREATE TABLE IF NOT EXISTS open_data_batch_ids (
  dataset_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  PRIMARY KEY (dataset_id, facility_id)
);
