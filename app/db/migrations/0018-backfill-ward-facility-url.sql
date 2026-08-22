-- migration 0018: 台東区立施設(6データセット)の url に区の総合問い合わせフォームを設定し、
-- あわせて contact_methods からは重複するURLを除いた文言へ短縮する
-- (transform.ts の fixedUrl 導入に対応。FacilityCard.tsx の既存「詳細を見る」ボタン導線を使う。
-- 冪等: url が既に設定済みの行は対象外)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0018-backfill-ward-facility-url.sql (本番は --remote)

UPDATE facilities
SET url = 'https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html',
    contact_methods = '個別のメール窓口はありませんが、台東区ウェブサイトの「お問合せ・ご意見」ページからお問い合わせいただけます(施設宛の専用フォームではなく区の総合窓口です)。'
WHERE url IS NULL
  AND dataset_id IN ('ds-taito-kuyakusho', 'ds-taito-jidokan', 'ds-taito-hoiku-shisetsu', 'ds-taito-kodomo-katei-shien', 'ds-taito-hoken-shisetsu', 'ds-taito-fukushi-shisetsu');
