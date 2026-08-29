-- 相談窓口(category_type='相談窓口')への facility_tags 手動キュレーション、オープンデータ
-- (WAM NET・CKAN)由来の施設ID分(consultation-desk-tags.sql からの分割、2026-08是正)。
--
-- 分割理由: これらのIDは `batch/scripts/ingest-open-data.mjs`(WAM NET)・CKAN自動取込
-- (batch/ingest/)経由で投入される施設を参照するため、それらを投入していないローカルD1では
-- 参照先が存在せず外部キー制約違反になる。db:seed:local:manual・db:reset:local には含めず、
-- 本ファイルは対象施設が存在する場合のみ個別に実行する
-- (ローカル: npm run db:seed:local:tags-open-data、本番: npm run db:seed:remote:tags-open-data。
-- 本番D1は対象施設が既に存在するため常に成功する)。詳細な経緯は consultation-desk-tags.sql
-- 冒頭コメント参照。
--
-- べき等性への注意(外部コードレビュー指摘 #4): INSERT OR IGNORE のため再実行自体は安全だが、
-- ingest-open-data.mjs は対象データセットの facility_tags を削除してから facilities を
-- 再投入する(タグの再投入は行わない)。本ファイルの投入対象IDはコンテンツ由来の決定的ハッシュ
-- (idFor(datasetId, serviceName, name, address))のため、元データ(名称・住所・facility_subtype)が
-- 変わらない限り再取込後も同じIDになるが、タグ行自体は再取込のたびに失われる。該当データセット
-- (ds-wam-net-disability-services)を再取込した場合は、本ファイルを再実行してタグを復元すること
-- (理想的には ingest-open-data.mjs 側で自動化したいが、現時点では手動運用。
-- docs/designs/data-governance.md §2 参照)。
--
-- 投入方法: wrangler d1 execute trait-compass --local --file=./db/seed/consultation-desk-tags-open-data.sql
--   (本番投入時は --local を --remote に置き換える。ハッカソン審査期間中は実施しない)

INSERT OR IGNORE INTO facility_tags (facility_id, tag) VALUES
  -- 葛飾区子ども発達センター(堀切3-34-1 ウェルピアかつしか、dataset: ds-wam-net-disability-services)。
  -- 同一住所・同一名称で児童発達支援・保育所等訪問支援・障害児相談支援の3事業者登録が別行として
  -- 存在するため(WAM NET由来データの特性)、3行すべてにタグを付与する。4拠点で児童発達支援を
  -- 実施し、就学前〜学齢期の発達相談窓口としても機能する総合的な施設のため、ALL_TAGS相当とする。
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', 'こころ・感情'),
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', '不注意・段取り'),
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', '感覚'),
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', '学習・からだ'),
  ('ds-wam-net-disability-services-8a97aac5f50f96e3', 'こだわり'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', 'こころ・感情'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', '不注意・段取り'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', '感覚'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', '学習・からだ'),
  ('ds-wam-net-disability-services-c4c4d659d1e51d31', 'こだわり'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', 'こころ・感情'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', '不注意・段取り'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', '感覚'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', '学習・からだ'),
  ('ds-wam-net-disability-services-34d2aae0e5884869', 'こだわり'),

  -- 江戸川区発達相談・支援センター(平井4-1-29、dataset: ds-wam-net-disability-services)。
  -- 上記と同じ理由(WAM NET由来の3行分割・発達障害相談センターと児童発達支援センターの機能を
  -- 兼ねる総合的な施設)により、3行すべてにALL_TAGS相当を付与する。
  ('ds-wam-net-disability-services-056d390693f26964', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-056d390693f26964', 'こころ・感情'),
  ('ds-wam-net-disability-services-056d390693f26964', '不注意・段取り'),
  ('ds-wam-net-disability-services-056d390693f26964', '感覚'),
  ('ds-wam-net-disability-services-056d390693f26964', '学習・からだ'),
  ('ds-wam-net-disability-services-056d390693f26964', 'こだわり'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', 'こころ・感情'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', '不注意・段取り'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', '感覚'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', '学習・からだ'),
  ('ds-wam-net-disability-services-f0b9305b50d35f43', 'こだわり'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', '対人・コミュニケーション'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', 'こころ・感情'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', '不注意・段取り'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', '感覚'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', '学習・からだ'),
  ('ds-wam-net-disability-services-f592e4a3f67e153e', 'こだわり'),

  -- 都立精神保健福祉センター(仮施設、台東区、dataset: ds-taito-hoken-shisetsu、CKAN自動取込)。
  -- 名称上「精神保健福祉センター」と同一の施設種別。
  ('fac-bf06b39f', 'こころ・感情');
