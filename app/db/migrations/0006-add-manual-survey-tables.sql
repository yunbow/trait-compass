-- migration 0006: data/manual/municipalities/*.yaml の手動調査データを保持するテーブルを追加する。
--
-- 対象: 既存環境に学校・進学・自治体調査メタ情報のテーブルを追加する。
-- 新規テーブルのみの追加のため、0005 のような既存テーブルの再作成トリックは不要である。
-- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS により安全に再実行できる。
--
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0006-add-manual-survey-tables.sql
-- ローカル(db:reset:local)は schema.sql を毎回フルで再適用するため、このファイルを使う必要はない。

-- 学校の基本情報。municipality は将来の他自治体データ追加に備える。
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY, municipality TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high')),
  name TEXT NOT NULL, area_hint TEXT, address TEXT, lat REAL, lng REAL, district_note TEXT,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 学校ごとの固定級(特別支援学級)。
CREATE TABLE IF NOT EXISTS school_fixed_classes (
  id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
  disability_type TEXT NOT NULL CHECK (disability_type IN ('intellectual','autism_emotional','hearing','language','visual','health_impairment','physical','other')),
  class_name TEXT, class_count INTEGER, capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','unconfirmed','phone_required')),
  note TEXT, sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_fixed_classes_school_id ON school_fixed_classes(school_id);

-- 学校ごとの特別支援教室(通級相当)・拠点校情報。
CREATE TABLE IF NOT EXISTS school_resource_rooms (
  school_id TEXT PRIMARY KEY REFERENCES schools(id),
  has_resource_room INTEGER NOT NULL CHECK (has_resource_room IN (0,1)),
  is_hub_school INTEGER NOT NULL DEFAULT 0 CHECK (is_hub_school IN (0,1)),
  hub_school_name TEXT, group_name TEXT,
  operation_mode TEXT CHECK (operation_mode IN ('itinerant_teacher','student_travels_to_hub')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 高校進学先と通学条件。
CREATE TABLE IF NOT EXISTS high_school_pathways (
  id TEXT PRIMARY KEY, municipality TEXT NOT NULL, name TEXT NOT NULL,
  pathway_type TEXT NOT NULL CHECK (pathway_type IN ('challenge_school','encourage_school','correspondence_support_school','palette_school','community_active_school','creative_school','other')),
  prefecture TEXT, address TEXT, nearest_station TEXT, estimated_commute_minutes INTEGER,
  commute_rating TEXT CHECK (commute_rating IN ('excellent','good','marginal')),
  commute_note TEXT, sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_high_school_pathways_municipality ON high_school_pathways(municipality);

-- 固定級の学級編制に関する調査判定。
CREATE TABLE IF NOT EXISTS class_organizations (
  id TEXT PRIMARY KEY, municipality TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high')),
  judgement TEXT NOT NULL CHECK (judgement IN ('separate','combined','mixed','unconfirmed','not_applicable')),
  rationale TEXT NOT NULL, sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_class_organizations_municipality ON class_organizations(municipality);

-- 特別支援学校と通学区域情報。
CREATE TABLE IF NOT EXISTS special_needs_schools (
  id TEXT PRIMARY KEY, municipality TEXT NOT NULL, name TEXT NOT NULL,
  disability_types_json TEXT NOT NULL, levels_json TEXT NOT NULL, address TEXT,
  is_in_municipality INTEGER NOT NULL DEFAULT 1 CHECK (is_in_municipality IN (0,1)),
  zoning_note TEXT, sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_special_needs_schools_municipality ON special_needs_schools(municipality);

-- 自治体調査の基準日・人口等と画面注記に用いる補足情報。
CREATE TABLE IF NOT EXISTS municipality_survey_meta (
  municipality TEXT PRIMARY KEY, municipality_code TEXT NOT NULL, survey_date TEXT NOT NULL,
  population INTEGER, households INTEGER, representative_stations_json TEXT, hazard_map_json TEXT,
  school_boundary_flexibility_json TEXT, limitations_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
