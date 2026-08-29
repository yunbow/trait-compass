-- 相談窓口(category_type='相談窓口')への facility_tags 手動キュレーション(TICKET-0013 の
-- 未着手だった「施設側」のタグ投入。タグ語彙自体は TICKET-0013 で確定済みの
-- src/features/support/services/category-tag-mapping.ts の SUPPORT_TAGS をそのまま用いる)。
--
-- workers/ingest/db.ts のオープンデータ取込パイプラインは facility_tags を意図的にスコープ外と
-- しており(TICKET-0011)、本番導入以来 facility_tags は全カテゴリ・全区市町村で0件のままだった。
-- そのため「相談分野との関連順」(sortByTagPriority)が実データ上は常に無効化されていた。
--
-- 2026-08是正: 本ファイルは以前から存在したが、db:seed:local:manual / db:reset:local のいずれからも
-- 呼ばれておらず、ローカル・本番いずれの D1 にも一度も適用されていなかったことが判明した
-- (外部コードレビュー指摘)。あわせて、記載していた9施設のうち8施設のIDが、記述時点から
-- ソースデータの入れ替わり(自治体調査データの許諾範囲変更・オープンデータの再取込によるID再生成)
-- で現在の facilities テーブルと一致しなくなっていたため、全面的に再調査・更新した
-- (2026-08-29、本番D1に対する直接クエリで現存ID・現存内容を確認)。
--
-- ファイル分割: 対象施設のうち、オープンデータ取込(WAM NET・CKAN由来)経由で投入される施設は、
-- それらを未投入のローカルD1では参照先が存在せず外部キー制約違反になる。D1(ローカル・本番とも)
-- は `wrangler d1 execute --file` の内容を1バッチ(実質1トランザクション)として実行するため、
-- 1ファイル内で「存在確実な行」と「存在するとは限らない行」を混在させると、後者のFK違反で
-- 前者まで道連れでロールバックされてしまう。そのため、投入対象を以下の2ファイルに分けている。
--
-- - 本ファイル(consultation-desk-tags.sql): `db/seed/no-diagnosis-facilities.sql` 由来の
--   固定IDのみを対象とし、`db:seed:local:manual`(このファイルの直後に実行される順序)経由で
--   常に安全に実行できる。
-- - `consultation-desk-tags-open-data.sql`: WAM NET・CKAN 由来のIDを対象とし、対象施設が
--   D1に存在する場合のみ実行できる(ローカルは `npm run db:seed:local:tags-open-data`、本番は
--   対象施設が既に存在するため常に成功する `npm run db:seed:remote:tags-open-data`)。
--
-- 対象選定の方針(db/seed/no-diagnosis-facilities.sql と同じ「事実の捏造禁止」を踏襲):
-- 名称・description から、発達障害・神経多様性の支援ニーズとの関連が明確に読み取れる施設
-- にのみタグを付与する。根拠が確認できない施設への一律付与はしない。
--
-- 除外した項目(2026-08-29時点): 台東区「こころの相談室」・台東区「就学相談・転学相談」・
-- 葛飾区「就学相談・特別支援教室利用開始手続き」・江戸川区「就学相談・転学相談」の4件は、
-- 対応する自治体調査データ(data/manual/municipalities/*.yaml)がハッカソン審査期間中
-- (〜2026年9月下旬)は本番D1へ反映されない方針(docs/data/permission-requests/README.md参照)
-- のため、当該施設が現時点の本番D1に存在しない。審査終了後、実データが投入されたタイミングで
-- 改めてIDを確認しこのファイルへ追加すること(docs/todo/ に追跡タスクとして記録)。
--
-- べき等性: INSERT OR IGNORE とすることで、既にタグが投入済みの施設に対して再実行してもエラー
-- にならない。
--
-- 投入方法: wrangler d1 execute trait-compass --local --file=./db/seed/consultation-desk-tags.sql
--   (npm run db:seed:local:manual に含まれるため、通常は個別実行不要。本番投入は
--   npm run db:seed:remote:manual。2026-08-29に本番D1へ適用済み。運営への確認により、
--   新規自治体許諾データとは無関係な既存オープンデータへのタグ付与・実在施設情報の追加は
--   審査期間中の反映が問題ないことを確認済み)

INSERT OR IGNORE INTO facility_tags (facility_id, tag) VALUES
  -- しんじゅく若者サポートステーション: 働くことに悩む15〜49歳向けの就労支援
  -- (職場での対人関係・段取りの相談ニーズと関連するため2タグを付与)。
  ('fac-manual-saposute-shinjuku', '対人・コミュニケーション'),
  ('fac-manual-saposute-shinjuku', '不注意・段取り'),

  -- せたがや若者サポートステーション(同上)。
  ('fac-manual-saposute-setagaya', '対人・コミュニケーション'),
  ('fac-manual-saposute-setagaya', '不注意・段取り');
