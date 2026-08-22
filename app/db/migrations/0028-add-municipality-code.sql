-- migration 0028: 自治体識別の一意化(municipality_code の第一級化、全国版移行 Phase 1)。
-- facilities / schools / high_school_pathways / class_organizations / special_needs_schools /
-- support_pathways / results_guide_notes へ municipality_code TEXT NOT NULL を追加し、
-- 既存行を東京都62区市町村名→全国地方公共団体コード(JISコード5桁)へ決定的にバックフィルする
-- (現データは東京都のみのため安全)。municipality_survey_meta は D1/SQLite の主キー変更制約上、
-- 新テーブル作成→コピー→DROP→リネームで municipality_code 主キーへ移行する。
-- municipality 列は表示用として全テーブルに残す(非キー化。検索・削除・UPSERT・JOINのキーは
-- 今後 municipality_code を使う。本マイグレーションはスキーマとデータの移行のみで、
-- アプリ・batch のクエリ書き換えは別対応)。
--
-- 広域窓口(facilities.municipality='東京都')は規約値 '13000'(5桁ゼロ埋め)で表現する。
-- 総務省の全国地方公共団体コード上の都道府県代表行(東京都=130001)の5桁表記に対応し、
-- 他都道府県展開時も「XX000=その県の広域」という同一規約で拡張できる。
--
-- 適用(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0028-add-municipality-code.sql
-- ローカルは schema.sql をフル再適用するため(db:migrate:local / db:reset:local)本ファイルは不要。
--
-- 冪等性: 列追加バックフィルは WHERE municipality_code = '' により再実行しても安全。
-- ただし ALTER TABLE ADD COLUMN は再実行するとエラーになるため、0028自体の再適用はしない。

-- ============================================================
-- 1) 列追加(7テーブル。municipality_survey_meta は末尾の作り直しで対応)
-- ============================================================
-- SQLite の ADD COLUMN ... NOT NULL には非NULLデフォルトが必須のため DEFAULT '' とし、
-- '' を「未バックフィル」のセンチネルとして扱う(バックフィル後、後述の検証クエリで0件を確認する)。

ALTER TABLE facilities ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE high_school_pathways ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE class_organizations ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE special_needs_schools ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE support_pathways ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';
ALTER TABLE results_guide_notes ADD COLUMN municipality_code TEXT NOT NULL DEFAULT '';

-- ============================================================
-- 2) facilities のバックフィル(東京都62区市町村 + 広域'東京都')
-- ============================================================
-- 63分岐は静的に確定しており一時テーブル方式は不要。WHERE municipality_code = '' により冪等。

UPDATE facilities SET municipality_code = CASE municipality
  WHEN '千代田区' THEN '13101' WHEN '中央区' THEN '13102' WHEN '港区' THEN '13103'
  WHEN '新宿区' THEN '13104' WHEN '文京区' THEN '13105' WHEN '台東区' THEN '13106'
  WHEN '墨田区' THEN '13107' WHEN '江東区' THEN '13108' WHEN '品川区' THEN '13109'
  WHEN '目黒区' THEN '13110' WHEN '大田区' THEN '13111' WHEN '世田谷区' THEN '13112'
  WHEN '渋谷区' THEN '13113' WHEN '中野区' THEN '13114' WHEN '杉並区' THEN '13115'
  WHEN '豊島区' THEN '13116' WHEN '北区' THEN '13117' WHEN '荒川区' THEN '13118'
  WHEN '板橋区' THEN '13119' WHEN '練馬区' THEN '13120' WHEN '足立区' THEN '13121'
  WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  WHEN '八王子市' THEN '13201' WHEN '立川市' THEN '13202' WHEN '武蔵野市' THEN '13203'
  WHEN '三鷹市' THEN '13204' WHEN '青梅市' THEN '13205' WHEN '府中市' THEN '13206'
  WHEN '昭島市' THEN '13207' WHEN '調布市' THEN '13208' WHEN '町田市' THEN '13209'
  WHEN '小金井市' THEN '13210' WHEN '小平市' THEN '13211' WHEN '日野市' THEN '13212'
  WHEN '東村山市' THEN '13213' WHEN '国分寺市' THEN '13214' WHEN '国立市' THEN '13215'
  WHEN '福生市' THEN '13218' WHEN '狛江市' THEN '13219' WHEN '東大和市' THEN '13220'
  WHEN '清瀬市' THEN '13221' WHEN '東久留米市' THEN '13222' WHEN '武蔵村山市' THEN '13223'
  WHEN '多摩市' THEN '13224' WHEN '稲城市' THEN '13225' WHEN '羽村市' THEN '13227'
  WHEN 'あきる野市' THEN '13228' WHEN '西東京市' THEN '13229'
  WHEN '瑞穂町' THEN '13303' WHEN '日の出町' THEN '13305' WHEN '檜原村' THEN '13307'
  WHEN '奥多摩町' THEN '13308' WHEN '大島町' THEN '13361' WHEN '利島村' THEN '13362'
  WHEN '新島村' THEN '13363' WHEN '神津島村' THEN '13364' WHEN '三宅村' THEN '13381'
  WHEN '御蔵島村' THEN '13382' WHEN '八丈町' THEN '13401' WHEN '青ヶ島村' THEN '13402'
  WHEN '小笠原村' THEN '13421'
  WHEN '東京都' THEN '13000'
  ELSE municipality_code END
WHERE municipality_code = '';

-- ============================================================
-- 3) 残り6テーブルのバックフィル(手動調査データ由来。台東区/葛飾区/江戸川区の3値のみで完結)
-- ============================================================
-- data/manual/municipalities/ には 13106-taito.yaml・13122-katsushika.yaml・13123-edogawa.yaml の
-- 3ファイルしか存在せず、これら6テーブルはこの手動調査データからのみ投入されるため3値で足りる。

UPDATE schools SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

UPDATE high_school_pathways SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

UPDATE class_organizations SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

UPDATE special_needs_schools SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

UPDATE support_pathways SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

UPDATE results_guide_notes SET municipality_code = CASE municipality
  WHEN '台東区' THEN '13106' WHEN '葛飾区' THEN '13122' WHEN '江戸川区' THEN '13123'
  ELSE municipality_code END
WHERE municipality_code = '';

-- ============================================================
-- 4) municipality_survey_meta の主キー移行(新テーブル作成→コピー→DROP→リネーム)
-- ============================================================
-- 既存データは3行のみ・他テーブルからのFK参照なし・専用インデックスなしのため低リスク。
-- SQLite は主キーを変更する ALTER を持たないため作り直す。

CREATE TABLE municipality_survey_meta_new (
  municipality_code TEXT PRIMARY KEY,          -- 新主キー(JIS 5桁)
  municipality TEXT NOT NULL,                  -- 表示用の自治体名(非キー化)
  survey_date TEXT NOT NULL,
  population INTEGER,
  households INTEGER,
  representative_stations_json TEXT,
  hazard_map_json TEXT,
  school_boundary_flexibility_json TEXT,
  limitations_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO municipality_survey_meta_new
  (municipality_code, municipality, survey_date, population, households,
   representative_stations_json, hazard_map_json, school_boundary_flexibility_json,
   limitations_json, created_at, updated_at)
  SELECT municipality_code, municipality, survey_date, population, households,
   representative_stations_json, hazard_map_json, school_boundary_flexibility_json,
   limitations_json, created_at, updated_at
  FROM municipality_survey_meta;
DROP TABLE municipality_survey_meta;
ALTER TABLE municipality_survey_meta_new RENAME TO municipality_survey_meta;

-- ============================================================
-- 5) インデックス(新規7本。既存の municipality 名インデックスは Phase 1 では残す)
-- ============================================================
-- ロールバック時(アプリ層をrevertして名前キー検索へ戻す場合)に即座に旧性能へ復帰できるよう、
-- 既存の idx_facilities_municipality 等は削除しない。削除は名前キー参照が完全消滅する Phase 2 で行う。

CREATE INDEX IF NOT EXISTS idx_facilities_municipality_code ON facilities(municipality_code);
CREATE INDEX IF NOT EXISTS idx_schools_municipality_code ON schools(municipality_code);
CREATE INDEX IF NOT EXISTS idx_high_school_pathways_municipality_code ON high_school_pathways(municipality_code);
CREATE INDEX IF NOT EXISTS idx_class_organizations_municipality_code ON class_organizations(municipality_code);
CREATE INDEX IF NOT EXISTS idx_special_needs_schools_municipality_code ON special_needs_schools(municipality_code);
CREATE INDEX IF NOT EXISTS idx_support_pathways_lookup_code ON support_pathways(municipality_code, lifestage, purpose_id);
CREATE INDEX IF NOT EXISTS idx_results_guide_notes_lookup_code ON results_guide_notes(municipality_code, tab);

-- ============================================================
-- 検証クエリ(適用後に手動実行。コミット対象外)
-- ============================================================
-- 各テーブルで0件であること:
--   SELECT COUNT(*) FROM facilities WHERE municipality_code = '';
--   SELECT COUNT(*) FROM schools WHERE municipality_code = '';
--   SELECT COUNT(*) FROM high_school_pathways WHERE municipality_code = '';
--   SELECT COUNT(*) FROM class_organizations WHERE municipality_code = '';
--   SELECT COUNT(*) FROM special_needs_schools WHERE municipality_code = '';
--   SELECT COUNT(*) FROM support_pathways WHERE municipality_code = '';
--   SELECT COUNT(*) FROM results_guide_notes WHERE municipality_code = '';
-- 行数が保存されていること:
--   SELECT COUNT(*) FROM municipality_survey_meta;  -- → 3
-- 新しい主キーが有効であること:
--   PRAGMA table_info(municipality_survey_meta);    -- → municipality_code の pk=1

-- ============================================================
-- ロールバック(municipality_survey_meta のみ非可逆。完全に旧スキーマへ戻す場合の逆手順)
-- ============================================================
-- 列追加(1)・バックフィル(2,3)・新規インデックス(5)は無害なため通常は revert 不要
-- (旧アプリ・batch コードは municipality 名列を読むだけで動作し続ける)。
-- municipality_survey_meta のみ主キーを municipality に戻す場合は以下を実行する:
--
-- CREATE TABLE municipality_survey_meta_old (
--   municipality TEXT PRIMARY KEY,
--   municipality_code TEXT NOT NULL,
--   survey_date TEXT NOT NULL,
--   population INTEGER,
--   households INTEGER,
--   representative_stations_json TEXT,
--   hazard_map_json TEXT,
--   school_boundary_flexibility_json TEXT,
--   limitations_json TEXT,
--   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
--   updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
-- );
-- INSERT INTO municipality_survey_meta_old
--   (municipality, municipality_code, survey_date, population, households,
--    representative_stations_json, hazard_map_json, school_boundary_flexibility_json,
--    limitations_json, created_at, updated_at)
--   SELECT municipality, municipality_code, survey_date, population, households,
--    representative_stations_json, hazard_map_json, school_boundary_flexibility_json,
--    limitations_json, created_at, updated_at
--   FROM municipality_survey_meta;
-- DROP TABLE municipality_survey_meta;
-- ALTER TABLE municipality_survey_meta_old RENAME TO municipality_survey_meta;
