-- migration 0016: 対象ライフステージ範囲(lifestage_min / lifestage_max)を facilities に追加する。
-- age_range(child/adult/both)を上書きせず、その内側でさらに絞り込むための任意の細分。
-- 序数は src/features/support/services/lifestage-mapping.ts の LIFESTAGE_VALUES 順:
--   preschool=0, elementary-junior-high=1, high-school=2, university-vocational=3, working-adult=4
-- NULL = 細分なし(従来どおり age_range のみで判定)。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0016-add-lifestage-range.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用し取込ロジック側で
-- 判定するため本ファイルは不要(SQLite の ALTER は列ごとに 1 文ずつ実行する)。

ALTER TABLE facilities ADD COLUMN lifestage_min INTEGER CHECK (lifestage_min IS NULL OR lifestage_min BETWEEN 0 AND 4);
ALTER TABLE facilities ADD COLUMN lifestage_max INTEGER CHECK (lifestage_max IS NULL OR lifestage_max BETWEEN 0 AND 4);

-- ---- バックフィル(冪等)----------------------------------------------------
-- 確定情報を持つデータセット/サービス/サブタイプのみを更新する。NULL のままの行は従来どおり。

-- 1) 保育施設(0〜6歳): 未就学のみ [0,0]。
UPDATE facilities SET lifestage_min = 0, lifestage_max = 0
WHERE dataset_id = 'ds-taito-hoiku-shisetsu';

-- 2) 児童館・こどもクラブ(ds-taito-jidokan): 解決済み facility_subtype 単位で細分する。
--    「こどもクラブ・学童保育所」= 放課後児童健全育成事業(学齢児の放課後児童クラブ)。
--    本アプリの5区分には「小学生」単独の区分が無く、最も近い包含は elementary-junior-high のみ [1,1]。
UPDATE facilities SET lifestage_min = 1, lifestage_max = 1
WHERE dataset_id = 'ds-taito-jidokan' AND facility_subtype = 'こどもクラブ・学童保育所';
--    「児童館」(児童福祉法上 0〜18 の一般来館施設)は広範のため細分せず NULL のまま据え置く
--    (このデータセットは fixedAgeRange='child' により adult 検索には元から出ない)。

-- 3) WAM NET(ds-wam-net-disability-services): サービス分類単位で細分する。
--    児童発達支援 = 未就学児(0〜6)向けの療育 → [0,0]。
UPDATE facilities SET lifestage_min = 0, lifestage_max = 0
WHERE dataset_id = 'ds-wam-net-disability-services' AND service_category = '児童発達支援';
--    放課後等デイサービス = 就学児(小・中・高)向け → [1,2]。
UPDATE facilities SET lifestage_min = 1, lifestage_max = 2
WHERE dataset_id = 'ds-wam-net-disability-services' AND service_category = '放課後等デイサービス';
-- その他の WAM サービス(保育所等訪問支援・居宅訪問型児童発達支援・障害児相談支援=子どもの全区分、
-- 自立訓練・就労移行支援・就労定着支援=成人の全区分)は、age_range の粗い区分内で全区分にまたがるため
-- 細分しない(NULL のまま = age_range のみで判定)。
