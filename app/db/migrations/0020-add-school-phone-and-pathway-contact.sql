-- migration 0020: schools テーブルに電話番号(phone)列、high_school_pathways テーブルに
-- 公式ホームページURL(url)・電話番号(phone)列を追加する
-- (data/manual/schema/municipality.schema.ts の SchoolSchema.phone / HighSchoolPathwaySchema.url,phone
-- 導入に対応)。
-- 適用: wrangler d1 execute trait-compass --local --file=./db/migrations/0020-add-school-phone-and-pathway-contact.sql (本番は --remote)

ALTER TABLE schools ADD COLUMN phone TEXT;
ALTER TABLE high_school_pathways ADD COLUMN url TEXT;
ALTER TABLE high_school_pathways ADD COLUMN phone TEXT;
