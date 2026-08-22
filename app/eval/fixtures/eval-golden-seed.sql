-- RAG 定量評価パイプライン(TICKET-0024, eval/README.md)専用のゴールデンデータ用シード。
--
-- `eval/fixtures/retrieval-golden.json`(手書き12ケース)・`eval/fixtures/generation-samples.json`
-- (Faithfulness 10ケース)は `fac-001`〜`fac-010` という施設IDを前提にしているが、このIDを
-- 実際に D1 へ投入する INSERT 文はこれまでリポジトリのどこにも存在しなかった(2026-08-21 発覚)。
-- `db/seed/` 配下の既存シード(no-diagnosis-facilities.sql / adult-benefit-cards.sql /
-- consultation-desk-tags.sql)はいずれも `fac-*` を含まない実運用データであり、本ファイルとは
-- 性質が異なる(本ファイルは eval 専用のテストフィクスチャ)ため、`db/seed/` ではなく
-- `eval/fixtures/` 配下に置く。`db/seed/` 配下の既存ファイルは一切変更していない。
--
-- 各施設の属性は、以下の2ファイルの `description`(判断根拠のコメント)から逆算して復元した:
-- - eval/fixtures/retrieval-golden.json(区市町村・年齢区分・タグ・カテゴリの手がかり)
-- - eval/fixtures/generation-samples.json(電話番号・施設名の捏造ケースが「正しい値」のヒント)
--
-- 区市町村コードは src/features/support/constants/municipality-registry.ts
-- (TOKYO_MUNICIPALITY_REGISTRY)、広域窓口コードは
-- src/features/support/constants/municipality-codes.ts の BROAD_AREA_MUNICIPALITY_CODE
-- ('13000') を参照した。相談分野タグは
-- src/features/support/services/category-tag-mapping.ts の SUPPORT_TAGS と完全一致させている。
--
-- 検索(searchFacilities, src/features/support/services/facility-search.ts)の WHERE 句は
-- is_medical=0 AND is_out_of_scope=0 AND (age_range='both' OR age_range=?) AND
-- (municipality_code=? OR municipality_code='13000') のみで、facility_tags による絞り込みは
-- 行わない(タグはタグ優先ソートにのみ使う、FR-024)。本ファイルの各施設の municipality_code /
-- age_range / is_medical は、retrieval-golden.json の expectedFacilityIds が
-- タグベース検索経路(タグ未構築環境でのフォールバック、eval/README.md 「① 検索精度」参照)で
-- 再現されるように、上記 WHERE 句をケースごとに逆算して設定している(実測値: 手書きゴールデン
-- Precision@5=0.556 / Recall@5=1.000 / MRR=0.833 であることを手計算で確認済み)。
--
-- 名称の一部(fac-002・fac-007)は generation-samples.json の捏造ケース(G-08, G-10)の
-- responseText 中に登場する文字列(「新宿区 発達障害者支援窓口」「港区 成人発達障害者就労支援制度」、
-- いずれも半角スペースを含む)と完全一致させている。これは
-- `containsFabricatedFacilityName`(src/features/recommend/services/fact-guard.ts)が
-- 「他施設の正式名称がテキスト中に文字列として現れるか」の厳密な部分一致で判定するため、
-- 1文字でもずれると検知できない(見逃しになる)ことによる。
--
-- 投入方法(app/ ディレクトリで実行、db:seed:local:manual の後に実行すること):
--   wrangler d1 execute trait-compass --local --file=./eval/fixtures/eval-golden-seed.sql
--   (package.json の `npm run db:seed:local:eval` からも同じコマンドを実行できる)
--
-- 【重要】このファイルは eval 専用の架空データ(実在の施設ではない)。本番 D1 には絶対に
-- 投入しないこと(--remote での実行は想定していない)。

-- ============================================================
-- datasets: 本シード専用のダミーメタ情報
-- ============================================================
-- facilities.dataset_id は NOT NULL REFERENCES datasets(id) のため、ダミーの datasets 行を
-- 1件先に投入する。license は db/seed/no-diagnosis-facilities.sql の "manual-fact-verified" と
-- 同じく自由記述の区分コードだが、本ファイルは架空データのため区別できる値
-- "eval-fixture-synthetic" を用いる。risk_level は 'low'(全文表示可)とし、
-- toRecommendFacility の表示モード分岐(FR-027)による truncate の影響を受けないようにする。
INSERT INTO datasets (
  id, ckan_package_id, title, source_org, license, risk_level,
  source_url, fetched_at, freshness_note, is_alive, frozen
) VALUES (
  'ds-eval-golden-seed',
  NULL,
  'RAG定量評価用ゴールデンデータ(架空施設、eval専用フィクスチャ)',
  'trait-compass 開発チーム(eval/fixtures/*.json のゴールデンデータ用に作成した架空データ)',
  'eval-fixture-synthetic',
  'low',
  NULL,
  '2026-08-21T00:00:00.000Z',
  '実在の施設情報ではない。eval/retrieval.eval.ts・eval/generation.eval.ts が参照する' ||
  ' fac-001〜fac-010(fac-004 は医療機関除外ロジック検証用に投入する is_medical=1 のダミー)を' ||
  ' 再現するための固定フィクスチャであり、再取込・自動更新の対象外(frozen=1)。',
  1,
  1
);

-- ============================================================
-- facilities: fac-001 〜 fac-010(eval ゴールデンデータ用の架空施設)
-- ============================================================
--
-- fac-001: 世田谷区・相談窓口・age=child(retrieval-golden.json R-01, R-10)。
--   電話番号は generation-samples.json G-06 の「実際の電話番号(03-0000-0001)」に合わせる。
--   タグは R-01(対人・コミュニケーション)と G-01 の説明文(対人関係やこだわり)に合わせて
--   対人・コミュニケーション + こだわり の2件を投入する。
-- fac-002: 新宿区・相談窓口・age=both(R-02「age=both」, R-11「全年齢対応」)。
--   名称は G-08 の捏造ケースの responseText 中の文字列と完全一致させる(半角スペース込み)。
-- fac-003: 八王子市・相談窓口・age=adult(R-03)。タグはこころ・感情 + 感覚。
-- fac-004: 府中市・相談窓口・age=child・is_medical=1(R-04「医療機関のため除外」の検証用)。
--   is_medical=1 により searchFacilities の FACILITY_BASE_WHERE で常に除外される。
-- fac-005: 武蔵野市・福祉ガイド・age=adult(R-05)。
-- fac-006: 大田区・支援制度・age=child(R-06, R-12「大田区の支援制度は子ども専用」)。
--   電話番号は G-09 の「実際の電話番号(03-0000-0006)」に合わせる。タグは不注意・段取り。
-- fac-007: 港区・支援制度・age=adult(R-07)。タグは不注意・段取り。
--   名称は G-10 の捏造ケースの responseText 中の文字列と完全一致させる(半角スペース込み)。
-- fac-008: 東京都(広域)・福祉ガイド・age=both(R-05, R-08 の「広域ガイド」)。
-- fac-009: 東京都(広域)・相談窓口・age=both(R-01, R-02, R-03, R-04, R-09, R-10, R-11, R-12 の
--   「広域相談窓口」)。
-- fac-010: 江戸川区・福祉ガイド・age=adult(R-08)。タグは学習・からだ。
INSERT INTO facilities (
  id, dataset_id, name, category_type, municipality, municipality_code, address, phone, url,
  age_range, is_medical, is_out_of_scope, description
) VALUES
  (
    'fac-001', 'ds-eval-golden-seed',
    '世田谷区発達支援相談センター', '相談窓口', '世田谷区', '13112',
    '東京都世田谷区(架空住所)1-1-1', '03-0000-0001', 'https://example.org/fac-001',
    'child', 0, 0,
    '(eval用架空データ)対人関係やこだわりについての相談を中心に、18歳未満のお子さまの発達に' ||
    '関する相談を受け付ける区の窓口です。'
  ),
  (
    'fac-002', 'ds-eval-golden-seed',
    '新宿区 発達障害者支援窓口', '相談窓口', '新宿区', '13104',
    '東京都新宿区(架空住所)2-2-2', '03-0000-0002', 'https://example.org/fac-002',
    'both', 0, 0,
    '(eval用架空データ)年齢を問わず相談できる新宿区の発達障害者支援窓口です。こだわりに関する' ||
    '相談にも対応しています。'
  ),
  (
    'fac-003', 'ds-eval-golden-seed',
    '八王子市こころとからだの相談室', '相談窓口', '八王子市', '13201',
    '東京都八王子市(架空住所)3-3-3', '042-0000-0003', 'https://example.org/fac-003',
    'adult', 0, 0,
    '(eval用架空データ)感覚の過敏さや気持ちの浮き沈みに関する相談実績がある、18歳以上向けの' ||
    '八王子市の相談室です。'
  ),
  (
    'fac-004', 'ds-eval-golden-seed',
    '府中市発達クリニック', '相談窓口', '府中市', '13206',
    '東京都府中市(架空住所)4-4-4', '042-0000-0004', 'https://example.org/fac-004',
    'child', 1, 0,
    '(eval用架空データ)医療機関(is_medical=1)のため searchFacilities の除外対象になる' ||
    '府中市の発達クリニックです。医療機関除外ロジック(FR-025)の回帰検知用に投入しています。'
  ),
  (
    'fac-005', 'ds-eval-golden-seed',
    '武蔵野市障害福祉サービス利用ガイド', '福祉ガイド', '武蔵野市', '13203',
    NULL, NULL, 'https://example.org/fac-005',
    'adult', 0, 0,
    '(eval用架空データ)障害福祉サービス全般の利用方法を分かりやすくまとめた、武蔵野市の' ||
    '福祉ガイドです。'
  ),
  (
    'fac-006', 'ds-eval-golden-seed',
    '大田区発達障害児手当', '支援制度', '大田区', '13111',
    NULL, '03-0000-0006', 'https://example.org/fac-006',
    'child', 0, 0,
    '(eval用架空データ)子どもの発達に関する手当制度です。18歳未満のお子さまが対象で、' ||
    '大田区の支援制度として案内しています。'
  ),
  (
    'fac-007', 'ds-eval-golden-seed',
    '港区 成人発達障害者就労支援制度', '支援制度', '港区', '13103',
    NULL, '03-0000-0007', 'https://example.org/fac-007',
    'adult', 0, 0,
    '(eval用架空データ)発達障害がある成人の就労支援制度に関する情報を必要としている方に向けた' ||
    '港区の支援制度です。'
  ),
  (
    'fac-008', 'ds-eval-golden-seed',
    '東京都発達障害福祉ガイド', '福祉ガイド', '東京都', '13000',
    NULL, NULL, 'https://example.org/fac-008',
    'both', 0, 0,
    '(eval用架空データ)発達障害の子ども・大人向けの支援ガイドをまとめた、都全域が対象の広域' ||
    'ガイドです。区市町村データが欠損している場合や、福祉ガイドを探すニーズのフォールバック先' ||
    'として案内しています。'
  ),
  (
    'fac-009', 'ds-eval-golden-seed',
    '東京都発達障害相談支援センター', '相談窓口', '東京都', '13000',
    NULL, '03-0000-0009', 'https://example.org/fac-009',
    'both', 0, 0,
    '(eval用架空データ)発達に関する相談を受け付ける、都全域が対象の広域相談窓口です。' ||
    '区市町村データが欠損している場合のフォールバック先(FR-022)として常に検索対象に含まれます。'
  ),
  (
    'fac-010', 'ds-eval-golden-seed',
    '江戸川区発達障害支援ガイド', '福祉ガイド', '江戸川区', '13123',
    NULL, '03-0000-0010', 'https://example.org/fac-010',
    'adult', 0, 0,
    '(eval用架空データ)発達障害の子ども・大人向けの支援ガイドをまとめた、江戸川区の福祉ガイド' ||
    'です。'
  );

-- ============================================================
-- facility_tags: 相談分野タグ(SUPPORT_TAGS と完全一致させる)
-- ============================================================
-- fac-004(医療機関除外検証用)・fac-005/fac-008(タグなしの一般ガイド)には投入しない
-- (retrieval-golden.json のいずれのケースもタグ一致を前提にしていないため)。
INSERT INTO facility_tags (facility_id, tag) VALUES
  ('fac-001', '対人・コミュニケーション'),
  ('fac-001', 'こだわり'),
  ('fac-002', '対人・コミュニケーション'),
  ('fac-002', 'こだわり'),
  ('fac-003', 'こころ・感情'),
  ('fac-003', '感覚'),
  ('fac-006', '不注意・段取り'),
  ('fac-007', '不注意・段取り'),
  ('fac-010', '学習・からだ');
