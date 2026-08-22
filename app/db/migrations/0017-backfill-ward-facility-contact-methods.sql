-- migration 0017: 台東区立施設(区が単一組織として運営する6データセット)の contact_methods を
-- 区の総合問い合わせフォーム案内へバックフィルする(transform.ts の fixedContactMethods 導入に対応。
-- 冪等: contact_methods が既に値を持つ行は上書きしない)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0017-backfill-ward-facility-contact-methods.sql (本番は --remote)

UPDATE facilities SET contact_methods = '個別のメール窓口はありませんが、台東区ウェブサイトの「お問合せ・ご意見」ページからお問い合わせいただけます(施設宛の専用フォームではなく区の総合窓口です): https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html'
WHERE contact_methods IS NULL
  AND dataset_id IN ('ds-taito-kuyakusho', 'ds-taito-jidokan', 'ds-taito-hoiku-shisetsu', 'ds-taito-kodomo-katei-shien', 'ds-taito-hoken-shisetsu', 'ds-taito-fukushi-shisetsu');
