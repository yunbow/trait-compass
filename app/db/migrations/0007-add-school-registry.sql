-- migration 0007: data/open-data/ 由来の学校一覧(オープンデータ)を保持する突合用テーブルを追加する。
-- schools 系7テーブル(手動調査、municipality 単位 DELETE→INSERT で洗い替え)とは意図的に
-- 外部キーで結ばず疎結合とする。突合は将来のスクリプトが name+municipality / school_code で行う。
-- 適用方法(既存環境):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0007-add-school-registry.sql
-- ローカル(db:reset:local / db:migrate:local)は schema.sql をフル再適用するため本ファイル不要。

CREATE TABLE IF NOT EXISTS school_registry (
  -- 安定ID: idFor(source_id, school_code または name+address)による決定的ハッシュ。
  id TEXT PRIMARY KEY,
  -- data/open-data/sources.yaml の id(例: mext-school-code-list)。
  source_id TEXT NOT NULL,
  -- MEXT 学校コード。提供元に無い場合は NULL。
  school_code TEXT,
  name TEXT NOT NULL,
  -- 学校段階。提供元の学校種コード(B1等)から変換し、未知の種別は 'other'。
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high','high','special_needs','other')),
  -- 東京都62区市町村名。住所から抽出できない場合は NULL(facilities と異なり広域フォールバックはしない)。
  municipality TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  -- 取込元CSV行の生データ(ヘッダー名→値のJSONオブジェクト)。
  raw_json TEXT,
  -- 原本の取得日時(data/open-data/<id>/fetch-meta.json の fetchedAt、ISO 8601)。
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_registry_municipality ON school_registry(municipality);
CREATE INDEX IF NOT EXISTS idx_school_registry_school_code ON school_registry(school_code);
CREATE INDEX IF NOT EXISTS idx_school_registry_source_id ON school_registry(source_id);
