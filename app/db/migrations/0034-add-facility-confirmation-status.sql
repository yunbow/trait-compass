-- migration 0034: facilities に confirmation_status / confirmed_on を追加する。
--
-- 外部コードレビュー指摘(手動調査プログラムの対象年齢・確認状態が検索へ反映されない)への
-- 対応の一部。data/manual/schema/municipality.schema.ts の ProgramSchema.status
-- (confirmed/unconfirmed/phone_required)・新設 confirmedOn を facilities 側で保持できるようにする。
--
-- 位置づけ: 本マイグレーションは列を追加するだけであり、既存49自治体分の手動調査データ
-- (YAML)の実際の確認状態・確認日は未設定のまま(全行 NULL)である。ingest-manual-survey.mjs
-- は今回の対応で program.status/confirmedOn を本列へ書き込むようになったため、今後 YAML 側に
-- これらの値を追加すれば投入時に反映される。既存YAMLへの値の追加(一次資料を確認して実際の
-- 状態を埋める作業)は別途のデータキュレーション作業であり、本マイグレーションのスコープ外
-- (事実の捏造禁止の方針上、値の推測はしない)。
--
-- 表示側の出し分け(2026-08是正で実装済み): FacilityCard・相談メモ(prepare)・AI推薦(recommend)
-- が共通コンポーネント ConfirmationNotice 経由で confirmation_status を表示する。また同是正で
-- program.status 未指定時の投入既定値が confirmed から unconfirmed へ変更されたため、
-- 再投入以降は既存49自治体分もNULLではなく unconfirmed が入るようになる(既投入の本番データは
-- コード変更だけでは変わらず、反映には再投入が別途必要。詳細は docs/designs/data-governance.md
-- 参照)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0034-add-facility-confirmation-status.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイルは不要。

ALTER TABLE facilities ADD COLUMN confirmation_status TEXT CHECK (confirmation_status IS NULL OR confirmation_status IN ('confirmed', 'unconfirmed', 'phone_required'));
ALTER TABLE facilities ADD COLUMN confirmed_on TEXT;
