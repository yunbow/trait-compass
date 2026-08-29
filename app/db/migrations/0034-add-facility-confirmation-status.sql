-- migration 0034: facilities に confirmation_status / confirmed_on を追加する。
--
-- 外部コードレビュー指摘(手動調査プログラムの対象年齢・確認状態が検索へ反映されない)への
-- 対応の一部。data/manual/schema/municipality.schema.ts の ProgramSchema.status
-- (confirmed/unconfirmed/phone_required)・新設 confirmedOn を facilities 側で保持できるようにする。
--
-- 位置づけ(スキーマ・投入処理の土台のみ、2026-08是正): 本マイグレーションは列を追加する
-- だけであり、既存49自治体分の手動調査データ(YAML)の実際の確認状態・確認日は未設定のまま
-- (全行 NULL)である。ingest-manual-survey.mjs は今回の対応で program.status/confirmedOn を
-- 本列へ書き込むようになったため、今後 YAML 側にこれらの値を追加すれば投入時に反映される。
-- 既存YAMLへの値の追加(一次資料を確認して実際の状態を埋める作業)は別途のデータキュレーション
-- 作業であり、本マイグレーションのスコープ外(事実の捏造禁止の方針上、値の推測はしない)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0034-add-facility-confirmation-status.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイルは不要。

ALTER TABLE facilities ADD COLUMN confirmation_status TEXT CHECK (confirmation_status IS NULL OR confirmation_status IN ('confirmed', 'unconfirmed', 'phone_required'));
ALTER TABLE facilities ADD COLUMN confirmed_on TEXT;
