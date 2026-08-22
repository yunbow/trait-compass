-- 「診断がなくても相談できる」フラグ(no_diagnosis_ok)の実データ手動シード(TICKET-0050 AC-2)。
--
-- db/seed.sql(ローカル開発専用のダミー名称・連絡先)とは投入経路を分離し、実在窓口の名称・
-- 住所・電話番号のみを本ファイルで扱う。既存の自動取込パイプライン(CKAN 由来データ、
-- batch/ingest/)とは独立した手動シードであり、投入対象は開発者による手動調査(公的機関の
-- 公開情報を WebFetch で直接確認)で実在・住所・電話番号を確認できた窓口のみに限定する
-- (「事実の捏造禁止」の方針。根拠が確認できない施設への一律付与はしない)。
--
-- 対象選定の理由(作業ログにも記録):
-- - TOSCA は NFR-55「TOSCA=規約不在(事前照会なしに取り込まない)」/FR-021「TOSCA 等の
--   規約未確認データは取り込まず、必要な場合は外部リンクとしてのみ提示する」により、
--   本チケットの対象からは除外する(データとして取り込まないという既存方針を優先する)。
-- - 地域若者サポートステーション2施設を、各サポートステーションの公式サイトを直接確認した
--   うえで投入する(出典 URL は下記コメント参照、確認日 2026-07-13)。
--
-- 投入方法: wrangler d1 execute trait-compass --local --file=./db/seed/no-diagnosis-facilities.sql
--   (本番投入時は --local を --remote に置き換える)
--
-- 注意: 名称・住所・電話番号は実在する公的機関の情報である。lat/lng は本ファイルでは
-- 投入しない(TICKET-0028 の geocode ステップ対象外の手動シードのため、既定 NULL のまま
-- とし、ピン無し・一覧のみ表示として扱う)。
--
-- 2026-08-10追記: 事務局方針(都データの許諾未確認分はダミー化)により、東京都立精神保健福祉
-- センター3施設をダミー化した。地域若者サポートステーション2施設は厚生労働省(PDL1.0)+
-- 各運営団体公式サイトが根拠で都データではないため、実データのまま維持している。
--
-- 2026-08-11追記(方針転換): 上記のダミー化(実データを偽の名称・住所・電話番号へ差し替えて
-- 投入し続ける方式)を見直し、東京都立精神保健福祉センター3施設(fac-manual-mhwc-taito・
-- fac-manual-mhwc-chubu・fac-manual-mhwc-tama)を D1 への投入自体から除外した(削除)。
-- 理由: (1) 学校情報・相談窓口の許諾待ちデータは内部方針どおり「除外(非表示)」を既定として
-- おり、`facilities` 側だけダミー値を表示し続けるのは一貫しない。(2) 結果画面には
-- `LicenseAuditNotice`(docs/usage/... ではなく
-- src/features/support/components/LicenseAuditNotice.tsx)で「相談窓口情報: ○○区への許諾申請中の
-- ため、現在掲載していません。」という趣旨のバナーが既に表示されており、このダミー施設は
-- 情報として重複・冗長かつ、実在窓口と誤認されるリスクがあった(電話番号は無効値だが「(ダミー)」
-- 表記を見落とすと実在の相談窓口と誤解しかねない)。旧出典・旧データは本コミットの直前の
-- git履歴を参照。復旧する場合は git 履歴から INSERT 文を復元すること。

-- ============================================================
-- datasets: 手動シードのメタ情報
-- ============================================================
-- ckan_package_id は手動投入データのため NULL(ds-kodomo-dx-registry と同じパターン)。
-- license は CC BY 4.0 等の東京都オープンデータではなく、各機関の公式サイトで公開されている
-- 名称・住所・電話番号(事実情報)を手動確認・転記したものであるため、既存のライセンス
-- 区分とは異なる自由記述の区分コード "manual-fact-verified" を用いる(db/schema.sql
-- コメント「自由記述の区分コード」を参照)。事実情報(住所・電話番号)の転記であり、
-- risk_level は low(全文表示可)とする。
INSERT INTO datasets (
  id, ckan_package_id, title, source_org, license, risk_level,
  source_url, fetched_at, freshness_note, is_alive, frozen
) VALUES (
  'ds-manual-no-diagnosis-facilities',
  NULL,
  '「診断がなくても相談できる」窓口(手動調査)',
  '開発者による手動調査(公的機関公開情報)',
  'manual-fact-verified',
  'low',
  'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/jinzaikaihatsu/saposute.html',
  '2026-07-13T00:00:00.000Z',
  '自動取込パイプライン(CKAN)とは独立した手動シード(TICKET-0050)。各機関の公式サイトを' ||
  'WebFetch で直接確認したうえで名称・住所・電話番号を投入している(再取得による自動更新は' ||
  '行わないため、鮮度は投入時点の確認日が上限)。' ||
  ' 都立精神保健福祉センター3施設は2026-08-10にダミー化のうえ、2026-08-11に投入対象から除外した。',
  1,
  1
);

-- 2026-08-11追記: 過去に投入済みの環境(db:reset:localを経ずに本ファイルだけ再実行した場合)
-- に残っている旧ダミー行を確実に除去するため、明示的に削除する(通常の初回投入では0件ヒットで無害)。
DELETE FROM facilities WHERE id IN ('fac-manual-mhwc-taito', 'fac-manual-mhwc-chubu', 'fac-manual-mhwc-tama');
DELETE FROM facility_tags WHERE facility_id IN ('fac-manual-mhwc-taito', 'fac-manual-mhwc-chubu', 'fac-manual-mhwc-tama');

-- ============================================================
-- facilities: 地域若者サポートステーション(2施設)
-- ============================================================
-- 出典: 厚生労働省「地域若者サポートステーション」
--   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/jinzaikaihatsu/saposute.html
--   (確認日 2026-07-13)。対象は「働くことに悩みを抱えている15歳から49歳までの方」であり、
--   診断書・障害者手帳・受給者証の提示を利用条件とする記載は無い(年齢のみを要件とする
--   一般向けの就労支援機関)。
-- 出典: しんじゅく若者サポートステーション公式サイト https://syss.roukyou.gr.jp/ (確認日 2026-07-13)
-- 出典: せたがや若者サポートステーション公式サイト https://www.setagaya-saposute.com/ (確認日 2026-07-13)
INSERT INTO facilities (
  id, dataset_id, name, category_type, municipality, municipality_code, address, phone, url,
  age_range, is_medical, description, no_diagnosis_ok
) VALUES
  (
    'fac-manual-saposute-shinjuku', 'ds-manual-no-diagnosis-facilities',
    'しんじゅく若者サポートステーション', '相談窓口', '新宿区', '13104',
    '東京都新宿区西早稲田2丁目4-7 東京DEW2階', '03-6380-2288',
    'https://syss.roukyou.gr.jp/',
    'both', 0,
    '働くことに悩む15〜49歳の方を対象に、相談から就職・定着までを無料で支援する公的な就労支援機関です。',
    1
  ),
  (
    'fac-manual-saposute-setagaya', 'ds-manual-no-diagnosis-facilities',
    'せたがや若者サポートステーション', '相談窓口', '世田谷区', '13112',
    '東京都世田谷区太子堂2丁目16-7 世田谷区役所三軒茶屋分庁舎5階', '03-5779-8222',
    'https://www.setagaya-saposute.com/',
    'both', 0,
    '働くことに悩む15〜49歳の方を対象に、相談から就職・定着までを無料で支援する公的な就労支援機関です。',
    1
  );
