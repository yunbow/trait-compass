-- 成人向け静的制度カード(手帳・自立支援医療・障害年金・就労移行支援・A型/B型)の
-- 手動シード(TICKET-0052 AC-1, AC-2)。
--
-- 精神障害者保健福祉手帳・自立支援医療(精神通院医療)・障害年金・就労移行支援・
-- 就労継続支援A型/B型は、東京都オープンデータカタログ(CKAN)に構造化データとして存在しない
-- ため、既存の自動取込パイプラインとは独立した手動シードとして投入する(AC-2)。
-- `ds-kodomo-dx-registry`(`ckanPackageId: null`)と同じ「CKAN 未登録データセット」パターンを
-- 踏襲し、category_type = '支援制度'・age_range = 'adult' として登録することで、既存の
-- `searchFacilities`(年齢一致・区市町村一致 or 広域の WHERE 句)にそのまま乗せる(検索ロジック
-- 自体への変更は不要、AC-4)。
--
-- 出典(開発者による手動調査、厚生労働省・日本年金機構の公開情報を WebFetch/WebSearch で
-- 直接確認、確認日 2026-07-13。各カードの url にも同じ出典 URL を設定する):
-- - 精神障害者保健福祉手帳: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/techou.html
-- - 自立支援医療(精神通院医療): https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/jiritsu/gaiyo.html
-- - 障害年金: https://www.nenkin.go.jp/service/jukyu/seido/shougainenkin/index.html
-- - 就労移行支援・就労継続支援A型・B型: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/naiyou.html
--
-- 文言は「利用できる可能性があります」「対象となる場合があります」等の非断定表現に統一し
-- (AC-3)、個別の受給資格・適用可否は断定しない。「最終確認日」の表示(AC-6)は、新規カラムを
-- 追加せず既存の datasets.fetched_at(DatasetFreshnessNote、TICKET-0033)を流用する
-- (実装方針3)。出典クレジット(AC-5)は既存の SourceCredit(FacilityCard、mode によらず
-- 常に表示)をそのまま利用する。
--
-- 投入方法: wrangler d1 execute trait-compass --local --file=./db/seed/adult-benefit-cards.sql
--   (本番投入時は --local を --remote に置き換える)

-- ============================================================
-- datasets: 手動シードのメタ情報
-- ============================================================
INSERT INTO datasets (
  id, ckan_package_id, title, source_org, license, risk_level,
  source_url, fetched_at, freshness_note, is_alive, frozen
) VALUES (
  'ds-manual-adult-benefits',
  NULL,
  '成人向け制度カード(手帳・自立支援医療・障害年金・就労支援、手動調査)',
  '開発者による手動調査(厚生労働省・日本年金機構の公開情報)',
  'manual-fact-verified',
  'low',
  'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/naiyou.html',
  '2026-07-13T00:00:00.000Z',
  '自動取込パイプライン(CKAN)には構造化データが存在しないため、既存の自動取込とは独立した' ||
  '手動シード(TICKET-0052)。各カードの文言は厚生労働省・日本年金機構の公開情報を' ||
  '直接確認したうえで作成しており、再取得による自動更新は行わない(鮮度は投入時点の確認日が上限)。',
  1,
  1
);

-- ============================================================
-- facilities: 成人向け制度カード(6件)
-- ============================================================
-- 全件 category_type='支援制度'・age_range='adult'・municipality='東京都'(広域、全国共通の
-- 国の制度であり特定区市町村に紐づかないため既存の広域フォールバック値をそのまま用いる、
-- FR-022 の枠組み)・is_medical=0。
INSERT INTO facilities (
  id, dataset_id, name, category_type, municipality, municipality_code, address, phone, url,
  age_range, is_medical, description
) VALUES
  (
    'fac-manual-benefit-techou', 'ds-manual-adult-benefits',
    '精神障害者保健福祉手帳', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/techou.html',
    'adult', 0,
    '一定程度の精神障害の状態にあることを都道府県知事等が認定する手帳制度です。等級(1級から' ||
    '3級)に応じて、税の控除や公共料金の割引等の支援を利用できる可能性があります。申請は市区町村の' ||
    '担当窓口を経由して行います。手帳の有効期限は交付日の属する月から2年後の月末までです。' ||
    '(出典: 厚生労働省「障害者手帳について」、最終確認日: 2026-07-13)'
  ),
  (
    'fac-manual-benefit-jiritsu-iryo', 'ds-manual-adult-benefits',
    '自立支援医療(精神通院医療)', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/jiritsu/gaiyo.html',
    'adult', 0,
    '通院による精神医療を継続的に必要とする方を対象に、医療費の自己負担を軽減できる可能性がある' ||
    '公費負担医療制度です。通常3割の自己負担が、所得等に応じて原則1割まで軽減される場合があります。' ||
    '受給者証の有効期間は原則1年で、更新の手続きが必要です。' ||
    '(出典: 厚生労働省「自立支援医療制度の概要」、最終確認日: 2026-07-13)'
  ),
  (
    'fac-manual-benefit-nenkin', 'ds-manual-adult-benefits',
    '障害年金', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.nenkin.go.jp/service/jukyu/seido/shougainenkin/index.html',
    'adult', 0,
    '病気やけがによって生活や仕事が制限されるようになった場合に、年金制度を通じて生活を支える' ||
    '給付を受けられる可能性があります。国民年金加入中の場合は障害基礎年金、厚生年金加入中の場合は' ||
    '障害基礎年金・障害厚生年金の対象となる場合があります。保険料の納付状況等、受給には一定の要件が' ||
    'あります。(出典: 日本年金機構「障害年金の制度」、最終確認日: 2026-07-13)'
  ),
  (
    'fac-manual-benefit-shurou-ikou', 'ds-manual-adult-benefits',
    '就労移行支援', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/naiyou.html',
    'adult', 0,
    '一般企業への就労を希望する方を対象にした障害福祉サービスです。就労に必要な知識・能力の向上の' ||
    'ための訓練、求職活動の支援、就職後の職場定着のための相談等を利用できる可能性があります。' ||
    '(出典: 厚生労働省「障害福祉サービスについて」、最終確認日: 2026-07-13)'
  ),
  (
    'fac-manual-benefit-shurou-a', 'ds-manual-adult-benefits',
    '就労継続支援A型', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/naiyou.html',
    'adult', 0,
    '一般企業への就労が難しいものの、雇用契約に基づく就労が可能な方を対象にした障害福祉サービスです。' ||
    '事業所と雇用契約を結んだうえで、就労の機会・生産活動の機会を利用できる可能性があります。' ||
    '雇用契約を結ぶため、最低賃金の適用対象になる場合があります。' ||
    '(出典: 厚生労働省「障害福祉サービスについて」、最終確認日: 2026-07-13)'
  ),
  (
    'fac-manual-benefit-shurou-b', 'ds-manual-adult-benefits',
    '就労継続支援B型', '支援制度', '東京都', '13000', NULL, NULL,
    'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/naiyou.html',
    'adult', 0,
    '一般企業への就労や雇用契約に基づく就労が難しい方を対象にした障害福祉サービスです。雇用契約を' ||
    '結ばずに、就労の機会・生産活動の機会を利用できる可能性があります。雇用契約を結ばないため、' ||
    '賃金とは異なる形の工賃が支払われる場合があります。' ||
    '(出典: 厚生労働省「障害福祉サービスについて」、最終確認日: 2026-07-13)'
  );
