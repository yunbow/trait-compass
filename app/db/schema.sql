-- D1(SQLite)スキーマ: 支援窓口検索(FR-023〜029)・取込データセットメタ(FR-031〜034)
--
-- 投入: npm run db:migrate:local
--   (実体: wrangler d1 execute trait-compass --local --file=./db/schema.sql)
--
-- 設計方針:
-- - id はすべて TEXT(UUID または取込元由来の安定キー)。取込 Worker(TICKET-0011〜)が
--   CKAN のリソース ID 等から決定的に生成できるようにし、再取込時の UPSERT を単純にする。
-- - 日時カラムは ISO 8601 文字列(TEXT)で保持する(SQLite に専用の日時型はないため)。
-- - 真偽値は INTEGER(0/1)。CHECK 制約で 0/1 のみを許可する。
-- - "IF NOT EXISTS" を全 DDL に付与し、再実行(冪等)を可能にする。

PRAGMA foreign_keys = ON;

-- ============================================================
-- datasets: 取込データセットのメタ情報
-- ============================================================
-- 出典・ライセンス区分・取得日時・リスク区分・鮮度メタを保持する(FR-033, FR-034)。
-- 取込 Worker(CKAN → R2 → D1)が 1 データセット = 1 行として UPSERT する想定。
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  -- 東京都オープンデータカタログ(CKAN)のパッケージ ID。手動投入データ等では NULL を許容する。
  ckan_package_id TEXT,
  title TEXT NOT NULL,
  source_org TEXT NOT NULL,
  -- ライセンス区分。P0 で全文投入するのは cc-by-4.0 / government-standard(A/F/G 相当、低リスク)のみ。
  -- グレー〜高リスクのライセンスは risk_level を medium/high にした上で個別確認まで全文を投入しない
  -- 運用とする(取込 Worker 側の責務。本スキーマは値を制約しない自由記述の区分コード)。
  license TEXT NOT NULL,
  -- リスク区分: low = 全文表示可, medium/high = タイトル・要約 + 外部リンク(high は事実情報のみ)。
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  source_url TEXT,
  -- 取得(fetch)日時。ISO 8601。
  fetched_at TEXT NOT NULL,
  -- 既知のデータ品質問題(CSV 404・カタログとサイト本体の鮮度差・更新終了 等)の注記(FR-034)。
  freshness_note TEXT,
  -- 死活監視フラグ(FR-029)。1 = 直近のリンクチェックで生存確認済み、0 = 死活監視で不達を検知。
  is_alive INTEGER NOT NULL DEFAULT 1 CHECK (is_alive IN (0, 1)),
  -- 更新終了フラグ(FR-034 AC-6、TICKET-0033)。1 = 提供元での更新が終了しており、以降
  -- fetched_at が進まないことが既知の状態(例: こどもDXレジストリ、workers/ingest/datasets.config.ts
  -- の DatasetConfig.frozen と対応)。支援情報案内画面の更新終了注記(DatasetFreshnessNote)の表示判定に使う。
  frozen INTEGER NOT NULL DEFAULT 0 CHECK (frozen IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- facilities: 相談窓口・支援機関
-- ============================================================
-- 分野タグ + 年齢区分 + 区市町村から検索する(FR-024)。医療機関は is_medical で除外する(FR-025)。
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  name TEXT NOT NULL,
  -- 「相談窓口」「支援制度」「福祉ガイド」「発達障害支援資料」の4分類タブ(FR-028)。
  category_type TEXT NOT NULL CHECK (
    category_type IN ('相談窓口', '支援制度', '福祉ガイド', '発達障害支援資料')
  ),
  -- 区市町村名。広域(都全域が対象)の窓口は '東京都' を格納し、区市町村データが
  -- 欠損している場合のフォールバック候補として検索する(FR-022, MVP-3)。表示用の列であり、
  -- 検索・削除・UPSERT・JOINのキーは municipality_code を使う(migration 0028)。
  municipality TEXT NOT NULL,
  -- 全国地方公共団体コード(JISコード5桁)。東京都62区市町村はそのコード、広域窓口
  -- (municipality='東京都')は規約値 '13000' を持つ(migration 0028)。
  municipality_code TEXT NOT NULL DEFAULT '',
  address TEXT,
  phone TEXT,
  url TEXT,
  -- 対象年齢区分。'both' は 18歳未満/18歳以上どちらの導線からも表示される(FR-021)。
  age_range TEXT NOT NULL CHECK (age_range IN ('child', 'adult', 'both')),
  -- 対象ライフステージ範囲(migration 0016)。age_range(child/adult/both の粗い区分)を上書きせず、
  -- その内側でさらに絞り込むための任意の細分。src/features/support/services/lifestage-mapping.ts の
  -- LIFESTAGE_VALUES 序数(preschool=0 … working-adult=4)で保持する。両方 NULL の施設は
  -- 「細分なし」= 従来どおり age_range のみで判定する(既定)。検索時に lifestage クエリが
  -- 与えられた場合のみ、(lifestage_min IS NULL OR 選択序数 BETWEEN lifestage_min AND lifestage_max)
  -- で絞り込む。データセット/サービス単位の確定情報(保育施設=未就学のみ 等)からのみ投入し、
  -- 自由記述からの行単位推測では投入しない(fixedAgeRange と同じ ground-truth 方針)。
  lifestage_min INTEGER CHECK (lifestage_min IS NULL OR lifestage_min BETWEEN 0 AND 4),
  lifestage_max INTEGER CHECK (lifestage_max IS NULL OR lifestage_max BETWEEN 0 AND 4),
  -- 国制度上のサービス分類。相談分野タグ(facility_tags)とは混在させず、WAM NET由来の
  -- 1事業所1サービス行に対して1値を保持する。対象外の取込元では NULL を許容する。
  service_category TEXT CHECK (service_category IS NULL OR service_category IN (
    '児童発達支援', '放課後等デイサービス', '保育所等訪問支援',
    '居宅訪問型児童発達支援', '障害児相談支援', '自立訓練',
    '就労移行支援', '就労定着支援'
  )),
  -- 施設サブタイプ(行単位)。取込元 CSV の「大分類」列(subtypeColumn)から行単位で投入し、
  -- 列が無い・値が空の場合は datasets.config.ts の既定値(defaultFacilitySubtype)へフォールバック
  -- する。語彙はデータセット追加で増える開放集合のため CHECK では制約しない(facility_tags.tag と
  -- 同方針。migration 0010)。対象外の取込元では NULL を許容する。
  facility_subtype TEXT,
  -- 医療機関除外フラグ(FR-025)。1 の場合、取込 Worker・検索クエリの双方で除外する。
  is_medical INTEGER NOT NULL DEFAULT 0 CHECK (is_medical IN (0, 1)),
  -- 対象領域外除外フラグ(migration 0011)。1 = 発達障害の相談支援というアプリの対象領域から
  -- 外れる施設(初出: 台東区「福祉施設」CSV の高齢者専用3分類)。is_medical と同じく、データは
  -- 保持したまま検索クエリ側で除外する。判定は workers/ingest/transform.ts の OUT_OF_SCOPE_SUBTYPES
  -- (解決済み facility_subtype の完全一致、データセット非依存)で行う。
  is_out_of_scope INTEGER NOT NULL DEFAULT 0 CHECK (is_out_of_scope IN (0, 1)),
  description TEXT,
  -- 緯度経度(FR-02A、TICKET-0028)。取込 Worker の geocode ステップ(GEOCODING_ENABLED=true 時のみ)
  -- が address から国土地理院 Geocoding API で解決した結果を保存する。既定は NULL
  -- (address が無い、GEOCODING_ENABLED が無効、ジオコーディング失敗のいずれか)で、
  -- 表示側(MapView)は NULL の施設をピン無し(一覧のみ)として扱う。
  lat REAL,
  lng REAL,
  -- 「診断がなくても相談できる」フラグ(TICKET-0050)。1 = 診断書・障害者手帳・受給者証等が
  -- 無くても相談を受け付けているとされる窓口(都立精神保健福祉センター・地域若者サポート
  -- ステーション等)。自動取込パイプライン(CKAN 由来データ)では判定できない性質情報のため、
  -- 既定値は 0 とし、手動シード(db/seed/no-diagnosis-facilities.sql)でのみ 1 を投入する。
  -- リスク区分(risk_level)による表示出し分け(FR-027)の対象外とし、mode によらず表示する。
  no_diagnosis_ok INTEGER NOT NULL DEFAULT 0 CHECK (no_diagnosis_ok IN (0, 1)),
  -- 電話以外の連絡手段(TICKET-0051)。メール・フォーム・来所予約の有無等を軽量なテキストで
  -- 保持する(複数手段がある場合はカンマ区切り等の自由記述)。取込元に該当列が無い、または
  -- 値が空の場合は NULL とし、「連絡手段なし」と誤読させる表示はしない(表示側は NULL を
  -- 非表示として扱う)。
  contact_methods TEXT,
  -- 確認状態(migration 0034、外部コードレビュー指摘: スキーマ・投入処理の土台のみ)。手動調査
  -- プログラム(data/manual/schema/municipality.schema.ts の ProgramSchema.status)の一次情報
  -- 確認状況を保持する。NULL = 本フラグの対象外(CKAN/オープンデータ由来など、確認状態という
  -- 概念を持たない取込元)。ingest-manual-survey.mjs のみが非NULL値を投入する。表示側での
  -- 出し分け(unconfirmedの非表示・phone_requiredの注記等)は本フィールド追加時点では未実装で、
  -- 別途対応が必要(既存49自治体分のYAMLはstatusが未確認/要電話でも実際の値をここに反映する
  -- ingest側の対応まで含めて是正が必要、詳細はdocs/designs/data-governance.md参照)。
  confirmation_status TEXT CHECK (confirmation_status IS NULL OR confirmation_status IN ('confirmed', 'unconfirmed', 'phone_required')),
  -- 確認日(YYYY-MM-DD、任意)。ProgramSchema.confirmedOn 対応、migration 0034。
  confirmed_on TEXT,
  -- 取込元(CKAN リソース/XLSX 行 等)の生データを保持し、再取込・デバッグ時に参照する。
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- lifestage_min/max は両方 NULL か両方非 NULL で、min <= max であること。
  -- (SQLite の CREATE TABLE 文法上、テーブルレベル制約は全カラム定義の後にまとめる必要があるため
  -- ここに置く。カラム定義の途中に挟むと `db:migrate:local` が構文エラーになる。)
  CHECK (
    (lifestage_min IS NULL AND lifestage_max IS NULL)
    OR (lifestage_min IS NOT NULL AND lifestage_max IS NOT NULL AND lifestage_min <= lifestage_max)
  )
);

-- ============================================================
-- facility_tags: 施設 × 相談分野タグ
-- ============================================================
-- タグ語彙は TICKET-0013(カテゴリ→相談分野タグ変換)で確定した
-- src/features/support/services/category-tag-mapping.ts の SUPPORT_TAGS
-- (対人・コミュニケーション/こころ・感情/不注意・段取り/感覚/学習・からだ/こだわり)を用いる。
-- タグでの突合を成立させるため、tag には SUPPORT_TAGS の値のみを投入すること。
-- スキーマ上は将来の拡張性のため自由文字列(TEXT)のまま保持する。
CREATE TABLE IF NOT EXISTS facility_tags (
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (facility_id, tag)
);

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_facilities_municipality ON facilities(municipality);
CREATE INDEX IF NOT EXISTS idx_facilities_municipality_code ON facilities(municipality_code);
CREATE INDEX IF NOT EXISTS idx_facilities_category_type ON facilities(category_type);
CREATE INDEX IF NOT EXISTS idx_facilities_is_medical ON facilities(is_medical);
CREATE INDEX IF NOT EXISTS idx_facilities_is_out_of_scope ON facilities(is_out_of_scope);
CREATE INDEX IF NOT EXISTS idx_facilities_dataset_id ON facilities(dataset_id);
CREATE INDEX IF NOT EXISTS idx_facility_tags_tag ON facility_tags(tag);
CREATE INDEX IF NOT EXISTS idx_facility_tags_facility_id ON facility_tags(facility_id);

-- ============================================================
-- usage_counts: プライバシー配慮の利用計測(画面到達数の集計カウンタ)
-- ============================================================
-- TICKET-0034。Cookie不使用・個人特定不可能な集計型アナリティクスとして、外部SaaS
-- (Cloudflare Web Analytics / Counterscale / Plausible)を採用せず、ファーストパーティの
-- D1集計カウンタとして実装する(オーケストレーター決定、理由はチケット本文・作業ログ参照)。
--
-- date × screen の集計値(到達回数)のみを保持する。IP・User-Agent・日付単位より詳細な
-- タイムスタンプ・その他のペイロードは一切保存しない(NFR-31〜33)。
CREATE TABLE IF NOT EXISTS usage_counts (
  -- 到達日(ISO 8601 の日付部分のみ、UTC、例: '2026-07-07')。時刻は保持しない。
  date TEXT NOT NULL,
  -- 到達画面。POST /api/track の zod スキーマと同じ7値の closed union。
  screen TEXT NOT NULL CHECK (screen IN ('top', 'survey', 'result', 'support-results', 'result-prepare', 'result-summarize', 'result-recommend')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, screen)
);

-- migration 0030。POST /api/track の IP 単位レート制限(連続POSTによる usage_counts 汚染対策)。
-- report_rate_limits/ai_rate_limits/beta_gate_rate_limits とは意図的に別テーブルとする。
CREATE TABLE IF NOT EXISTS track_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_track_rate_limits_window_start ON track_rate_limits(window_start);

-- ============================================================
-- ai_rate_limits: AI 機能の原価防衛用固定ウィンドウ回数制限
-- ============================================================
-- TICKET-0035。原価防衛(SP-00016)のための固定ウィンドウ回数制限。client_key は
-- SHA-256(クライアントIP + ':' + window_start + ':' + salt) の16進文字列であり、IP アドレス
-- そのものは保存しない(NFR-31〜33)。ウィンドウごとにハッシュ値が変わるため、行を跨いだ
-- 同一クライアント追跡は構造的にできない。行はウィンドウ経過後の最初のアクセス時に DELETE
-- され短命である。
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_window_start ON ai_rate_limits(window_start);

-- ============================================================
-- 手動調査: 学校・進学・自治体調査メタ情報
-- ============================================================
-- data/manual/municipalities/*.yaml の一次情報を、施設検索データとは分離して保持する。
-- municipality は将来の他自治体データを同じテーブルに追加するための自治体名である。

-- 学校の基本情報。level は小学校/中学校を区別し、sources_json に学校単位の出典を保持する。
CREATE TABLE IF NOT EXISTS schools (
  -- 安定ID、自治体名、学校段階、小学校/中学校名。municipality は表示用、検索キーは
  -- municipality_code(migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high')),
  name TEXT NOT NULL,
  -- 地図・一覧補助の地域目安、正式住所、任意の手動座標、学区域等の注記。
  area_hint TEXT,
  address TEXT,
  url TEXT,
  phone TEXT,
  lat REAL,
  lng REAL,
  district_note TEXT,
  -- 学校単位の一次資料出典(JSON配列)、作成・更新日時。
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_schools_municipality_code ON schools(municipality_code);

-- 学校ごとの固定級(特別支援学級)。複数障害種別を持てるため学校とは別テーブルにする。
CREATE TABLE IF NOT EXISTS school_fixed_classes (
  -- 固定級IDと所属学校ID。
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  -- 対象障害種別、学級名、学級数・定員。
  disability_type TEXT NOT NULL CHECK (disability_type IN ('intellectual','autism_emotional','hearing','language','visual','health_impairment','physical','other')),
  class_name TEXT,
  class_count INTEGER,
  capacity INTEGER,
  -- 確認状態、補足、固定級単位の出典、作成日時。
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','unconfirmed','phone_required')),
  note TEXT,
  sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_fixed_classes_school_id ON school_fixed_classes(school_id);

-- 学校ごとの特別支援教室(通級相当)と拠点校方式の情報。
CREATE TABLE IF NOT EXISTS school_resource_rooms (
  -- 所属学校ID、特別支援教室の設置有無・拠点校かどうか。
  school_id TEXT PRIMARY KEY REFERENCES schools(id),
  has_resource_room INTEGER NOT NULL CHECK (has_resource_room IN (0,1)),
  is_hub_school INTEGER NOT NULL DEFAULT 0 CHECK (is_hub_school IN (0,1)),
  -- 拠点校名、教室グループ名、運用方式、作成日時。
  hub_school_name TEXT,
  group_name TEXT,
  operation_mode TEXT CHECK (operation_mode IN ('itinerant_teacher','student_travels_to_hub')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 自治体から検討する高校進学先と通学条件。
CREATE TABLE IF NOT EXISTS high_school_pathways (
  -- 安定ID、比較元自治体、学校名、進学先種別。municipality は表示用、検索キーは
  -- municipality_code(migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  pathway_type TEXT NOT NULL CHECK (pathway_type IN ('challenge_school','encourage_school','correspondence_support_school','palette_school','community_active_school','creative_school','other')),
  -- 所在都道府県・住所・最寄駅、通学時間・評価・注記。
  prefecture TEXT,
  address TEXT,
  url TEXT,
  phone TEXT,
  nearest_station TEXT,
  estimated_commute_minutes INTEGER,
  commute_rating TEXT CHECK (commute_rating IN ('excellent','good','marginal')),
  commute_note TEXT,
  -- 出典JSONと作成日時。
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_high_school_pathways_municipality ON high_school_pathways(municipality);
CREATE INDEX IF NOT EXISTS idx_high_school_pathways_municipality_code ON high_school_pathways(municipality_code);

-- 固定級の学級編制に関する調査判定と根拠。
CREATE TABLE IF NOT EXISTS class_organizations (
  -- 安定ID、自治体、学校段階、学級編制の判定と根拠。municipality は表示用、検索キーは
  -- municipality_code(migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high')),
  judgement TEXT NOT NULL CHECK (judgement IN ('separate','combined','mixed','unconfirmed','not_applicable')),
  rationale TEXT NOT NULL,
  -- 任意の出典JSONと作成日時。
  sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_class_organizations_municipality ON class_organizations(municipality);
CREATE INDEX IF NOT EXISTS idx_class_organizations_municipality_code ON class_organizations(municipality_code);

-- 特別支援学校と通学区域情報。障害種別・対象学部はJSON配列で保持する。
CREATE TABLE IF NOT EXISTS special_needs_schools (
  -- 安定ID、比較元自治体、学校名。municipality は表示用、検索キーは municipality_code
  -- (migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  -- 対象障害種別・学部のJSON配列、住所、自治体内かどうか、通学区域注記。
  disability_types_json TEXT NOT NULL,
  levels_json TEXT NOT NULL,
  address TEXT,
  is_in_municipality INTEGER NOT NULL DEFAULT 1 CHECK (is_in_municipality IN (0,1)),
  zoning_note TEXT,
  -- 出典JSONと作成日時。
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_special_needs_schools_municipality ON special_needs_schools(municipality);
CREATE INDEX IF NOT EXISTS idx_special_needs_schools_municipality_code ON special_needs_schools(municipality_code);

-- 自治体調査の基準日・人口等と、画面注記に用いる補足情報。
CREATE TABLE IF NOT EXISTS municipality_survey_meta (
  -- 全国地方公共団体コード(主キー、migration 0028で municipality から移行)、
  -- 自治体名(表示用、非キー化)、調査日、人口・世帯数。
  municipality_code TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  survey_date TEXT NOT NULL,
  population INTEGER,
  households INTEGER,
  -- 代表駅、ハザード、指定校変更、調査上の限界をそれぞれJSONで保持する。
  representative_stations_json TEXT,
  hazard_map_json TEXT,
  school_boundary_flexibility_json TEXT,
  limitations_json TEXT,
  -- licenseAudit(schoolClassData/consultationWindowData/zoningData/highSchoolDataの4ステータス)。
  -- 内部の調査経緯を含む note は含めず、フロントエンドのステータス表示に必要な4値のみ保持する
  -- (migration 0029)。
  license_audit_json TEXT,
  -- 作成・更新日時。
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS school_registry (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  school_code TEXT,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('elementary','junior_high','high','special_needs','other')),
  municipality TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_school_registry_municipality ON school_registry(municipality);
CREATE INDEX IF NOT EXISTS idx_school_registry_school_code ON school_registry(school_code);
CREATE INDEX IF NOT EXISTS idx_school_registry_source_id ON school_registry(source_id);

-- ライフステージ×目的別の想定ルート。1つの調査データ上のルート(lifestagesは配列)は、
-- 検索時に municipality/lifestage/purpose_id で一意に引けるよう、対象ライフステージごとに1行へ展開して持つ。
CREATE TABLE IF NOT EXISTS support_pathways (
  -- 安定ID、比較元自治体、対象ライフステージ。municipality は表示用、検索キーは
  -- municipality_code(migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  lifestage TEXT NOT NULL CHECK (lifestage IN ('preschool','elementary-junior-high','high-school','university-vocational','working-adult')),
  -- UI上の目的選択肢のIDと表示ラベル。
  purpose_id TEXT NOT NULL,
  purpose_label TEXT NOT NULL,
  -- 確認状態、ルート全体の出典JSON、作成・更新日時。
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','unconfirmed','phone_required')),
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_pathways_lookup ON support_pathways(municipality, lifestage, purpose_id);
CREATE INDEX IF NOT EXISTS idx_support_pathways_lookup_code ON support_pathways(municipality_code, lifestage, purpose_id);

-- 想定ルートごとの順序付きステップ。1ルートが複数ステップを持てるため別テーブルにする。
CREATE TABLE IF NOT EXISTS support_pathway_steps (
  -- ステップID、所属ルートID、表示順序。
  id TEXT PRIMARY KEY,
  pathway_id TEXT NOT NULL REFERENCES support_pathways(id),
  step_order INTEGER NOT NULL,
  -- 表示文言、窓口名、問い合わせ先。
  title TEXT NOT NULL,
  actor TEXT,
  contact TEXT,
  -- 任意ステップかどうか、補足、ステップ単位の出典JSON、作成日時。
  is_conditional INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sources_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_support_pathway_steps_pathway_id ON support_pathway_steps(pathway_id);

-- 支援検索結果画面「1分でわかるガイド」の自治体固有補足(手動調査データ由来)。
CREATE TABLE IF NOT EXISTS results_guide_notes (
  -- 安定ID、比較元自治体、対象タブ。municipality は表示用、検索キーは municipality_code
  -- (migration 0028)。
  id TEXT PRIMARY KEY,
  municipality TEXT NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  tab TEXT NOT NULL CHECK (tab IN ('相談窓口','学校情報','福祉ガイド')),
  -- 本文JSON(段落配列)、出典JSON、作成・更新日時。
  body_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_results_guide_notes_lookup ON results_guide_notes(municipality, tab);
CREATE INDEX IF NOT EXISTS idx_results_guide_notes_lookup_code ON results_guide_notes(municipality_code, tab);

-- 掲載情報の誤り報告(TICKET-0064)。ユーザーが施設カードから送信し、開発者が wrangler CLI で
-- 手動レビューする(専用の管理UIは持たない設計)。
CREATE TABLE IF NOT EXISTS facility_reports (
  -- 受付ID(サーバー生成 UUID)。
  id TEXT PRIMARY KEY,
  -- 送信時点の施設ID。再取込でIDが変わり得るため参照整合は張らず、下のスナップショットを正とする。
  facility_id TEXT NOT NULL,
  -- 検索・突合用に非正規化した施設名・自治体(スナップショット)。
  facility_name TEXT NOT NULL,
  municipality TEXT NOT NULL,
  -- 送信時点で配信していた施設情報全体のスナップショット(JSON)。
  facility_snapshot_json TEXT NOT NULL,
  -- 報告種別(単一選択)。
  report_category TEXT NOT NULL CHECK (report_category IN
    ('phone','address','content','closure','link','unclear','other')),
  -- closure の場合のみ: 現在の状況。
  closure_status TEXT CHECK (closure_status IN
    ('closed','moved','renamed','merged','unknown-mismatch')),
  -- 正しいと思われる内容(任意、最大200字)。
  corrected_value TEXT,
  -- 補足・情報源など自由記述(任意、最大500字)。
  detail_text TEXT,
  -- 運用トリアージ状態。開発者が wrangler CLI で UPDATE する。
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- status が done/dismissed に更新された日時(migration 0027)。自由記述の保持期限
  -- (90日、report-retention.ts)の起算点。status='new' の間は NULL。
  status_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_facility_reports_status ON facility_reports(status);
CREATE INDEX IF NOT EXISTS idx_facility_reports_created_at ON facility_reports(created_at);

-- 掲載情報の誤り報告の送信レート制限カウンタ(TICKET-0064)。AI機能の ai_rate_limits とは
-- 別テーブルとし、報告スパム対策と AI 利用枠が競合しないようにする。
CREATE TABLE IF NOT EXISTS report_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_report_rate_limits_window_start ON report_rate_limits(window_start);

-- 掲載情報の訂正・更新報告を施設以外(想定ルート・学校情報・結果の見方ガイド)へ拡張したもの
-- (migration 0025)。facility_reports(TICKET-0064)とは意図的に別テーブルとし、対象種別ごとに
-- スナップショットの形が大きく異なる点を吸収する。専用の管理UIは持たず、開発者が wrangler CLI
-- で手動レビューする点は facility_reports と同じ。レート制限は report_rate_limits を共用する。
CREATE TABLE IF NOT EXISTS content_reports (
  -- 受付ID(サーバー生成 UUID)。
  id TEXT PRIMARY KEY,
  -- 報告対象の種別。
  target_type TEXT NOT NULL CHECK (target_type IN ('pathway','school','guide_note','guide_generic')),
  -- 送信時点の対象ID(support_pathways.id / schools.id / results_guide_notes.id)。
  -- guide_generic(D1行を持たない汎用ガイド)のみ NULL。参照整合は張らず snapshot を正とする。
  target_id TEXT,
  -- 検索・突合用に非正規化した対象の表示名(purpose_label / 学校名 / ガイド見出し)。
  target_label TEXT NOT NULL,
  municipality TEXT NOT NULL,
  -- pathway・guide のみ: 対象のライフステージ(schools は lifestage 非依存のため NULL)。
  lifestage TEXT CHECK (lifestage IN ('preschool','elementary-junior-high','high-school','university-vocational','working-adult')),
  -- guide_note / guide_generic のみ: 対象タブ。
  tab TEXT CHECK (tab IN ('相談窓口','学校情報','福祉ガイド','発達障害支援資料','支援制度')),
  -- 送信時点で配信していた対象情報全体のスナップショット(JSON)。サーバーが D1/ソースコードから再構築する。
  target_snapshot_json TEXT NOT NULL,
  -- 報告種別(単一選択)。
  report_category TEXT NOT NULL CHECK (report_category IN
    ('phone','address','contact','content','fixed-class','resource-room','school-status','link','outdated','unclear','other')),
  -- 正しいと思われる内容(任意、最大200字)。
  corrected_value TEXT,
  -- 補足・情報源など自由記述(任意、最大500字)。
  detail_text TEXT,
  -- 運用トリアージ状態。開発者が wrangler CLI で UPDATE する。
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- status が done/dismissed に更新された日時(migration 0027)。自由記述の保持期限
  -- (90日、report-retention.ts)の起算点。status='new' の間は NULL。
  status_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at);

-- クローズドベータのパスワードゲート(/api/beta-gate)専用のレート制限(migration 0026)。
-- report_rate_limits / ai_rate_limits とは意図的に別テーブルとする(パスワード総当たり対策)。
CREATE TABLE IF NOT EXISTS beta_gate_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_beta_gate_rate_limits_window_start ON beta_gate_rate_limits(window_start);

-- 支援先一覧画面「このページで、次に何をすればよいか分かりましたか?」フィードバック(migration 0031)。
-- プライバシー最小主義(個人を特定できる情報を一切保存しない、NFR-31〜33)を厳守するため、
-- 3択評価・内訳は行レベル記録を一切持たず「日付×選択肢」の純粋な集計カウンタのみとする
-- (usage_counts と同方針)。コメントのみ「送信された自由記述文そのもの」を保持する必要があるため
-- 行レベルで保持するが、created_date は日付(YYYY-MM-DD)のみとし、IP・User-Agent・詳細な
-- タイムスタンプ等の付随情報は一切保存しない。

-- 3択評価(「分かった」「少し分かった」「まだ分からない」)の日付×画面×選択肢の集計カウンタ。
-- 行レベル記録は持たない(誰が・いつ・何回押したかは復元できない)。
CREATE TABLE IF NOT EXISTS feedback_rating_counts (
  -- 集計日(ISO 8601 の日付部分のみ、UTC、例: '2026-08-19')。時刻は保持しない。
  date TEXT NOT NULL,
  -- 評価元の画面。今後の画面追加に備え、支援先一覧(support-results)と結果準備画面
  -- (result-prepare)の2値で開始する。
  source TEXT NOT NULL CHECK (source IN ('support-results', 'result-prepare')),
  -- 3択評価。
  rating TEXT NOT NULL CHECK (rating IN ('clear', 'partial', 'unclear')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, source, rating)
);

-- rating='unclear' を選んだ場合の内訳(単一選択・任意)の日付×選択肢の集計カウンタ。
-- feedback_rating_counts とは意図的に別テーブルにする(内訳は画面(source)非依存の理由の
-- 集計であり、source別に持つ必要がないため)。行レベル記録は持たない。
CREATE TABLE IF NOT EXISTS feedback_unclear_reason_counts (
  date TEXT NOT NULL,
  -- 「まだ分からない」の理由。
  reason TEXT NOT NULL CHECK (reason IN ('facility-fit', 'first-step', 'scheme-diff', 'info-gap', 'other')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, reason)
);

-- 任意の一言コメント(公開許可付き)。このテーブルのみ、送信された自由記述文そのものを
-- 行レベルで保持する(3択評価・内訳とは異なり集計値に還元できないため)。個人を特定できる
-- 情報(IP・User-Agent・詳細なタイムスタンプ等)は一切含めず、created_date も日付
-- (YYYY-MM-DD)のみを保持する。
CREATE TABLE IF NOT EXISTS feedback_comments (
  -- 受付ID(サーバー生成UUID)。
  id TEXT PRIMARY KEY,
  -- 送信日(ISO 8601 の日付部分のみ、UTC)。時刻は保持しない。
  created_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('support-results', 'result-prepare')),
  -- コメント本文(トリム後1〜500字、送信者側で検証済みだが列側には長さ制約を付けない
  -- ・SQLite の TEXT には文字数上限を課す標準的な CHECK 手段がないため、検証は
  -- zod スキーマ側(FeedbackRequestSchema)の責務とする)。
  comment_text TEXT NOT NULL,
  -- 送信者が「このコメントを公開してよい」に同意したかどうか(0/1)。同意が無い場合、
  -- published を 1 にしてはならない(運用ルール、DBの制約では表現しない)。
  publish_consent INTEGER NOT NULL DEFAULT 0 CHECK (publish_consent IN (0, 1)),
  -- 公開フラグ(0/1)。開発者が内容を確認したうえで wrangler d1 execute で手動更新する
  -- (facility_reports.status と同じく専用の管理UIは持たない)。既定は未公開(0)。
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  -- レビュー済みフラグ(0/1、migration 0032)。レビューした結果「掲載しない」と判断した
  -- 場合に立てる。published(=/outcomes に表示してよいか)とは独立した列で、これが無いと
  -- 「まだ見ていない」と「見たが公開しないと決めた」の両方が published=0 のまま区別できず、
  -- 日次Slackダイジェストが見送り済みの同一コメントを毎日通知し続けてしまう。
  dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_created_date ON feedback_comments(created_date);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_published ON feedback_comments(published);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_dismissed ON feedback_comments(dismissed);

-- フィードバック送信(POST /api/feedback)専用のレート制限カウンタ。ai_rate_limits /
-- report_rate_limits / beta_gate_rate_limits / track_rate_limits とは意図的に別テーブルとする。
-- IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  client_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_window_start ON feedback_rate_limits(window_start);
