-- migration 0015: 保育施設・児童館・子ども家庭支援センターの age_range を child へ固定するバックフィル
-- (transform.ts の fixedAgeRange 導入に対応。冪等)。
-- 保育施設(0〜6歳)・児童館(学齢児)・子ども家庭支援センター(子育て世帯)はデータセット全体が
-- 18歳未満/子育て世帯専用だが、ageHint 列が「名称」のため inferAgeRange が一部行で 'both' に
-- 既定化していた(AIAI NURSERY 入谷・ほうらい子育てサポートセンター 等が age=adult 検索に混入)。
-- dataset 単位の確定情報で上書きする。
-- db:reset:local(schema.sql フル再適用+再取込)では取込ロジック側で判定されるため本ファイル不要。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0015-backfill-child-age-range-hoiku-jidokan-kodomo-katei.sql (本番は --remote)

UPDATE facilities SET age_range = 'child'
WHERE age_range <> 'child'
  AND dataset_id IN ('ds-taito-hoiku-shisetsu', 'ds-taito-jidokan', 'ds-taito-kodomo-katei-shien');
