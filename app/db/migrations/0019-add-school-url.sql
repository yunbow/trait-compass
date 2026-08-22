-- migration 0019: schools テーブルに学校自体の公式ホームページURL(url)列を追加する
-- (data/manual/schema/municipality.schema.ts の SchoolSchema.url 導入に対応。
-- sources[].url(個々の事実の根拠資料リンク)とは別物、学校公式サイトそのもの)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0019-add-school-url.sql (本番は --remote)

ALTER TABLE schools ADD COLUMN url TEXT;
