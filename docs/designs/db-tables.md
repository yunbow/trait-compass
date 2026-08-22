# DB カラムテーブル定義

[`app/db/schema.sql`](../../app/db/schema.sql) の全テーブル・全カラムのリファレンス。「由来」列は、そのカラムが `app/db/schema.sql` の初期 `CREATE TABLE` に含まれるか(**初期schema**)、後続の `app/db/migrations/000N-*.sql` で追加されたか(**migration 000N**)を示す。`app/db/schema.sql` の `CREATE TABLE` 自体は最新形(migration 適用後の列を含む)であり、`app/db/migrations/` は「TICKET-0028等より前に schema.sql を適用済みの既存環境(本番D1等)に対する差分適用専用」であることに注意する(各migrationファイル冒頭コメント)。

このファイルと `app/db/schema.sql` の乖離は [`app/src/lib/__tests__/db-docs-sync.test.ts`](../../app/src/lib/__tests__/db-docs-sync.test.ts) が機械的に検査する(全カラムの掲載漏れ・存在しないカラムの誤記載の両方)。カラムを追加・削除した場合は本ファイルも同時に更新すること。

## 1. `datasets`

取込データセット単位のメタ情報。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | D1主キー。UUIDまたは取込元由来の安定キー | 初期schema |
| `ckan_package_id` | TEXT | NULL可 | - | - | CKANパッケージID。CKAN未登録・手動投入データ等は`NULL` | 初期schema |
| `title` | TEXT | NOT NULL | - | - | データセットタイトル | 初期schema |
| `source_org` | TEXT | NOT NULL | - | - | 提供元組織名 | 初期schema |
| `license` | TEXT | NOT NULL | - | - | ライセンス識別子(自由記述の区分コード。`licenseClassifier.ts`の分類対象) | 初期schema |
| `risk_level` | TEXT | NOT NULL | - | CHECK (`low`,`medium`,`high`) | リスク区分。low=全文表示可、medium/high=タイトル・要約+外部リンク(highは事実情報のみ) | 初期schema |
| `source_url` | TEXT | NULL可 | - | - | 取得元URL | 初期schema |
| `fetched_at` | TEXT | NOT NULL | - | - | 取得(fetch)日時。ISO 8601 | 初期schema |
| `freshness_note` | TEXT | NULL可 | - | - | 既知のデータ品質問題(CSV404・鮮度差・更新終了等)の注記 | 初期schema |
| `is_alive` | INTEGER | NOT NULL | `1` | CHECK (`0`,`1`) | 死活監視フラグ。1=直近のリンクチェックで生存確認済み、0=不達を検知 | 初期schema |
| `frozen` | INTEGER | NOT NULL | `0` | CHECK (`0`,`1`) | 更新終了フラグ。1=提供元での更新が終了し以降`fetched_at`が進まないことが既知 | 初期schema |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時(ISO 8601) | 初期schema |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時(ISO 8601) | 初期schema |

## 2. `facilities`

相談窓口・支援制度・福祉ガイド・発達障害支援資料の実体。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | D1主キー | 初期schema |
| `dataset_id` | TEXT | NOT NULL | - | FOREIGN KEY → `datasets(id)` | 所属データセット | 初期schema |
| `name` | TEXT | NOT NULL | - | - | 施設・制度名 | 初期schema |
| `category_type` | TEXT | NOT NULL | - | CHECK (`相談窓口`,`支援制度`,`福祉ガイド`,`発達障害支援資料`) | 4分類タブ区分(FR-028) | 初期schema |
| `municipality` | TEXT | NOT NULL | - | - | 区市町村名のフルネーム文字列。広域窓口は`'東京都'`(正規化テーブルなし、FR-022)。表示用の列で、検索・削除・UPSERTのキーは`municipality_code` | 初期schema |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁)。広域窓口(`municipality`=`'東京都'`)は規約値`'13000'`。`''`は未バックフィルのセンチネル | migration 0028 |
| `address` | TEXT | NULL可 | - | - | 住所 | 初期schema |
| `phone` | TEXT | NULL可 | - | - | 電話番号 | 初期schema |
| `url` | TEXT | NULL可 | - | - | 案内ページURL | 初期schema |
| `age_range` | TEXT | NOT NULL | - | CHECK (`child`,`adult`,`both`) | 対象年齢区分。`both`は18歳未満/18歳以上どちらの導線からも表示(FR-021) | 初期schema |
| `lifestage_min` | INTEGER | NULL可 | - | CHECK (0〜4またはNULL) | 対象ライフステージ範囲の下限。`age_range`を上書きせず、その内側でさらに絞り込む任意の細分。序数は`lifestage-mapping.ts`の`LIFESTAGE_VALUES`順(未就学児=0…社会人=4)。両方NULLは「細分なし」= 従来どおり`age_range`のみで判定 | migration 0016 |
| `lifestage_max` | INTEGER | NULL可 | - | CHECK (0〜4またはNULL、かつテーブルレベルCHECKで`lifestage_min`と両方NULL/両方非NULL・`min<=max`を強制) | 対象ライフステージ範囲の上限 | migration 0016 |
| `service_category` | TEXT | NULL可 | - | CHECK (`児童発達支援`,`放課後等デイサービス`,`保育所等訪問支援`,`居宅訪問型児童発達支援`,`障害児相談支援`,`自立訓練`,`就労移行支援`,`就労定着支援`) | 国制度上のサービス分類。WAM NET由来の1事業所1サービス行に1値を保持し、相談分野タグ(`facility_tags`)とは混在させない | migration 0008 |
| `facility_subtype` | TEXT | NULL可 | - | - | CSVの「大分類」列由来の行単位の施設サブタイプ(`category_type`より細かい機関種別)。`datasets.config.ts`の`csvColumns.subtypeColumn`が設定されたデータセット(台東区6件)で行ごとに取得し、列が空・未設定の場合のみ`defaultFacilitySubtype`へフォールバックする。語彙はデータセット追加のたびに増える開放集合のためCHECKでは制約しない(`facility_tags.tag`と同方針)。対象外のデータセットは`NULL`のままで、カード上のバッジ(`FacilityCard`)は値がある場合のみ表示 | migration 0009, 0010で行単位化・CHECK廃止 |
| `is_medical` | INTEGER | NOT NULL | `0` | CHECK (`0`,`1`) | 医療機関除外フラグ。1の場合、取込Worker・検索クエリの双方で除外(FR-025) | 初期schema |
| `is_out_of_scope` | INTEGER | NOT NULL | `0` | CHECK (`0`,`1`) | 対象領域外除外フラグ。1の場合、発達障害の相談支援というアプリの対象領域から外れる施設(初出: 台東区「福祉施設」CSVの高齢者専用3分類)として、取込Worker・検索クエリの双方で除外。判定は`transform.ts`の`OUT_OF_SCOPE_SUBTYPES`(解決済み`facility_subtype`の完全一致、データセット非依存) | migration 0011 |
| `description` | TEXT | NULL可 | - | - | 説明文 | 初期schema |
| `lat` | REAL | NULL可 | - | - | 緯度。取込Workerのgeocodeステップ(GEOCODING_ENABLED=true時のみ)がaddressから解決。既定NULL(住所無し・機能無効・失敗のいずれか) | migration 0002 |
| `lng` | REAL | NULL可 | - | - | 経度。`lat`と同じ経路・既定値 | migration 0002 |
| `no_diagnosis_ok` | INTEGER | NOT NULL | `0` | CHECK (`0`,`1`) | 「診断がなくても相談できる」フラグ。自動取込では判定不可な性質情報のため既定0、手動シードでのみ1を投入。risk_levelによる表示出し分け(FR-027)の対象外 | migration 0003 |
| `contact_methods` | TEXT | NULL可 | - | - | 電話以外の連絡手段(メール・フォーム・来所予約等)の自由記述テキスト。値が空の場合はNULL(「連絡手段なし」と誤読させない) | migration 0004 |
| `raw_json` | TEXT | NULL可 | - | - | 取込元(CKANリソース/XLSX行等)の生データ。再取込・デバッグ用 | 初期schema |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | 初期schema |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時 | 初期schema |

## 3. `facility_tags`

facilities × 相談分野タグの中間テーブル。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `facility_id` | TEXT | NOT NULL | - | FOREIGN KEY → `facilities(id)`、複合PRIMARY KEYの一部 | 対象施設 | 初期schema |
| `tag` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | 相談分野タグ。スキーマ上は自由文字列だが運用上`SUPPORT_TAGS`の6値のみを投入 | 初期schema |

テーブル制約: `PRIMARY KEY (facility_id, tag)`(複合主キー、同一施設への同一タグの重複投入を防ぐ)。

## 4. `usage_counts`

プライバシー配慮の集計型アナリティクス。他テーブルとのFK関係を持たない独立テーブル。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `date` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | 到達日(ISO 8601の日付部分のみ、UTC。時刻は保持しない) | 初期schema |
| `screen` | TEXT | NOT NULL | - | CHECK (`top`,`survey`,`result`,`support-results`,`result-prepare`,`result-summarize`,`result-recommend`)、複合PRIMARY KEYの一部 | 到達画面。POST /api/track のzodスキーマと同じ7値の closed union | 初期schema |
| `count` | INTEGER | NOT NULL | `0` | - | 到達回数の集計値 | 初期schema |

テーブル制約: `PRIMARY KEY (date, screen)`(日付×画面の一意性)。IP・User-Agent・日付単位より詳細なタイムスタンプ・その他ペイロードは一切保存しない(NFR-31〜33)。

## 5. `ai_rate_limits`

AI 機能の原価防衛用固定ウィンドウ回数制限カウンタ(TICKET-0035)。IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `client_key` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | IP・window_start・salt の SHA-256 ハッシュ | migration 0021 |
| `window_start` | INTEGER | NOT NULL | - | 複合PRIMARY KEYの一部 | 固定ウィンドウ開始時刻(Unix秒) | migration 0021 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該ウィンドウの AI API 呼び出し回数 | migration 0021 |

インデックス: `idx_ai_rate_limits_window_start`(期限切れ行の削除)。

## 6. `schools`

手動調査した小学校・中学校の基本情報。`batch/scripts/ingest-manual-survey.mjs` が `data/manual/municipalities/*.yaml` の `elementarySchools`/`juniorHighSchools` から投入する。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 安定した学校ID(`idFor(municipalityCode, level, name)` のハッシュ由来。再取込しても同一IDになる) | migration 0006 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(`facilities.municipality` と同じフルネーム文字列運用)。表示用の列で、検索キーは`municipality_code` | migration 0006 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `level` | TEXT | NOT NULL | - | CHECK (`elementary`,`junior_high`) | 小学校/中学校 | migration 0006 |
| `name` | TEXT | NOT NULL | - | - | 学校名 | migration 0006 |
| `area_hint` | TEXT | NULL可 | - | - | 地図・一覧補助のエリア目安(正式住所ではない) | migration 0006 |
| `address` | TEXT | NULL可 | - | - | 正式住所(判明分のみ) | migration 0006 |
| `url` | TEXT | NULL可 | - | - | 公式ホームページURL | migration 0006 |
| `phone` | TEXT | NULL可 | - | - | 電話番号 | migration 0020 |
| `lat` | REAL | NULL可 | - | - | 緯度。原則手入力しない(住所からの自動ジオコーディング想定、現状は未整備で常にNULL) | migration 0006 |
| `lng` | REAL | NULL可 | - | - | 経度。`lat`と同じ運用 | migration 0006 |
| `district_note` | TEXT | NULL可 | - | - | 学区・拠点校/巡回体制等の注記 | migration 0006 |
| `sources_json` | TEXT | NOT NULL | - | - | 出典JSON配列(YAML `sources`、`SourceRefSchema`) | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時 | migration 0006 |

## 7. `school_fixed_classes`

学校ごとの固定級(特別支援学級)。1校が障害種別ごとに複数件持ちうるため `schools` に対して1対多。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 固定級ID | migration 0006 |
| `school_id` | TEXT | NOT NULL | - | FOREIGN KEY → `schools(id)` | 所属学校 | migration 0006 |
| `disability_type` | TEXT | NOT NULL | - | CHECK (`intellectual`,`autism_emotional`,`hearing`,`language`,`visual`,`health_impairment`,`physical`,`other`) | 障害種別(8種) | migration 0006 |
| `class_name` | TEXT | NULL可 | - | - | 学級名(例: たけのこ学級) | migration 0006 |
| `class_count` | INTEGER | NULL可 | - | - | 学級数 | migration 0006 |
| `capacity` | INTEGER | NULL可 | - | - | 定員 | migration 0006 |
| `status` | TEXT | NOT NULL | `confirmed` | CHECK (`confirmed`,`unconfirmed`,`phone_required`) | 確認状態(「見つからない=ない」と判定しないための3値) | migration 0006 |
| `note` | TEXT | NULL可 | - | - | 注記 | migration 0006 |
| `sources_json` | TEXT | NULL可 | - | - | 出典JSON配列 | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |

インデックス: `idx_school_fixed_classes_school_id`(§12参照)。

## 8. `school_resource_rooms`

学校ごとの特別支援教室(通級相当)・拠点校情報。1校につき最大1行(`schools` と1対0または1対1)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `school_id` | TEXT | NOT NULL | - | PRIMARY KEY, FOREIGN KEY → `schools(id)` | 学校ID(1校1行) | migration 0006 |
| `has_resource_room` | INTEGER | NOT NULL | - | CHECK (`0`,`1`) | 特別支援教室の設置有無 | migration 0006 |
| `is_hub_school` | INTEGER | NOT NULL | `0` | CHECK (`0`,`1`) | 拠点校か(1=拠点校、0=巡回対象校) | migration 0006 |
| `hub_school_name` | TEXT | NULL可 | - | - | 巡回対象校の場合の拠点校名 | migration 0006 |
| `group_name` | TEXT | NULL可 | - | - | 教室グループ名(例: すずかけ教室) | migration 0006 |
| `operation_mode` | TEXT | NULL可 | - | CHECK (`itinerant_teacher`,`student_travels_to_hub`) | 運用方式(巡回教員が来校/児童生徒が拠点校へ通う) | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |

## 9. `high_school_pathways`

高校進学先(チャレンジスクール・エンカレッジスクール等)と通学条件。`schools` へのFKは持たず、`municipality` 文字列でのみ紐づく(進学先は区市町村立小中学校の在籍と直接の親子関係を持たないため)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 進学先ID | migration 0006 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用。検索キーは`municipality_code`) | migration 0006 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `name` | TEXT | NOT NULL | - | - | 学校名 | migration 0006 |
| `pathway_type` | TEXT | NOT NULL | - | CHECK (`challenge_school`,`encourage_school`,`correspondence_support_school`,`palette_school`,`community_active_school`,`creative_school`,`other`) | 進学先種別(7種) | migration 0006 |
| `prefecture` | TEXT | NULL可 | - | - | 所在都道府県 | migration 0006 |
| `address` | TEXT | NULL可 | - | - | 住所 | migration 0006 |
| `nearest_station` | TEXT | NULL可 | - | - | 最寄駅 | migration 0006 |
| `estimated_commute_minutes` | INTEGER | NULL可 | - | - | 概算通学時間(分) | migration 0006 |
| `commute_rating` | TEXT | NULL可 | - | CHECK (`excellent`,`good`,`marginal`) | 通学評価(◎/○/参考枠の3段階) | migration 0006 |
| `commute_note` | TEXT | NULL可 | - | - | 通学注記 | migration 0006 |
| `url` | TEXT | NULL可 | - | - | 公式ホームページURL | migration 0020 |
| `phone` | TEXT | NULL可 | - | - | 電話番号 | migration 0020 |
| `sources_json` | TEXT | NOT NULL | - | - | 出典JSON配列 | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |

インデックス: `idx_high_school_pathways_municipality`(§12参照)。

## 10. `class_organizations`

固定級の学級編制(別学級/合同編制等)に関する調査判定。学校単位ではなく自治体×学校段階(小学校/中学校)単位の判定であるため `schools` へのFKは持たない。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 判定ID | migration 0006 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用。検索キーは`municipality_code`) | migration 0006 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `level` | TEXT | NOT NULL | - | CHECK (`elementary`,`junior_high`) | 学校段階 | migration 0006 |
| `judgement` | TEXT | NOT NULL | - | CHECK (`separate`,`combined`,`mixed`,`unconfirmed`,`not_applicable`) | 判定(別学級/合同/混在/未確認/該当校なしの5値) | migration 0006 |
| `rationale` | TEXT | NOT NULL | - | - | 判定根拠 | migration 0006 |
| `sources_json` | TEXT | NULL可 | - | - | 出典JSON配列 | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |

インデックス: `idx_class_organizations_municipality`(§12参照)。

## 11. `special_needs_schools`

特別支援学校と通学区域情報。`high_school_pathways`/`class_organizations` と同様、`municipality` 文字列でのみ紐づく独立テーブル。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 学校ID | migration 0006 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用。削除キーは`municipality_code`) | migration 0006 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `name` | TEXT | NOT NULL | - | - | 学校名 | migration 0006 |
| `disability_types_json` | TEXT | NOT NULL | - | - | 対象障害種別のJSON配列(1件以上) | migration 0006 |
| `levels_json` | TEXT | NOT NULL | - | - | 対象学部(小/中/高/専攻科)のJSON配列 | migration 0006 |
| `address` | TEXT | NULL可 | - | - | 住所 | migration 0006 |
| `is_in_municipality` | INTEGER | NOT NULL | `1` | CHECK (`0`,`1`) | 対象自治体内に所在するか(0=区域外の学校) | migration 0006 |
| `zoning_note` | TEXT | NULL可 | - | - | 通学区域注記 | migration 0006 |
| `sources_json` | TEXT | NOT NULL | - | - | 出典JSON配列 | migration 0006 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |

インデックス: `idx_special_needs_schools_municipality`(§12参照)。

## 12. `municipality_survey_meta`

自治体調査の基準日・人口等と、学校情報画面の注記に用いる補足情報。自治体1件につき1行(`ON CONFLICT(municipality_code) DO UPDATE` で再取込時にUPSERTされる、`batch/scripts/ingest-manual-survey.mjs`)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `municipality_code` | TEXT | NOT NULL | - | PRIMARY KEY | JIS X 0402 全国地方公共団体コード(5桁、UPSERTキー) | migration 0006、0028でPRIMARY KEYへ移行 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用、0028で非キー化) | migration 0006 |
| `survey_date` | TEXT | NOT NULL | - | - | 調査日(`YYYY-MM-DD`) | migration 0006 |
| `population` | INTEGER | NULL可 | - | - | 人口 | migration 0006 |
| `households` | INTEGER | NULL可 | - | - | 世帯数 | migration 0006 |
| `representative_stations_json` | TEXT | NULL可 | - | - | 代表駅のJSON配列 | migration 0006 |
| `hazard_map_json` | TEXT | NULL可 | - | - | 浸水・津波・地震ハザード情報JSON(`HazardMapSchema`) | migration 0006 |
| `school_boundary_flexibility_json` | TEXT | NULL可 | - | - | 指定校変更・区域外就学の柔軟性JSON(`SchoolBoundaryFlexibilitySchema`) | migration 0006 |
| `limitations_json` | TEXT | NULL可 | - | - | 調査上の限界・未確認事項のJSON配列(パース失敗時は `fetchSchoolInfo` が空配列にフォールバックする) | migration 0006 |
| `license_audit_json` | TEXT | NULL可 | - | - | licenseAuditの4ステータス値(`schoolClassData`/`consultationWindowData`/`zoningData`/`highSchoolData`)のJSON。`auditedOn`/`note`は含まない。`includeX`系フラグに関わらず常に投入され、フロントエンドの非掲載理由バナー(`LicenseAuditNotice`)に使う | migration 0029 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0006 |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時(UPSERT時に `excluded.*` で更新) | migration 0006 |

## 13. `school_registry`

`data/open-data/` 由来の学校一覧(オープンデータ)を保持する突合用テーブル(`batch/scripts/ingest-open-data.mjs` が投入)。`schools` 系7テーブル(手動調査、municipality単位でDELETE→INSERTする洗い替え)とは意図的に外部キーで結ばず疎結合とする。突合は将来のスクリプトが `name`+`municipality` または `school_code` で行う想定。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 安定ID(`idFor(source_id, school_code または name+address)` のハッシュ由来) | migration 0007 |
| `source_id` | TEXT | NOT NULL | - | - | `data/open-data/sources.yaml` の `id`(例: `mext-school-code-list`) | migration 0007 |
| `school_code` | TEXT | NULL可 | - | - | MEXT学校コード。提供元に無い場合はNULL | migration 0007 |
| `name` | TEXT | NOT NULL | - | - | 学校名 | migration 0007 |
| `level` | TEXT | NOT NULL | - | CHECK (`elementary`,`junior_high`,`high`,`special_needs`,`other`) | 学校段階。提供元の学校種コード(B1等)から変換し、未知の種別は`other` | migration 0007 |
| `municipality` | TEXT | NULL可 | - | - | 東京都62区市町村名。住所から抽出できない場合はNULL(`facilities`と異なり広域フォールバックはしない) | migration 0007 |
| `address` | TEXT | NULL可 | - | - | 住所 | migration 0007 |
| `lat` | REAL | NULL可 | - | - | 緯度。現状は未整備で常にNULL | migration 0007 |
| `lng` | REAL | NULL可 | - | - | 経度。`lat`と同じ運用 | migration 0007 |
| `raw_json` | TEXT | NULL可 | - | - | 取込元CSV行の生データ(ヘッダー名→値のJSONオブジェクト) | migration 0007 |
| `fetched_at` | TEXT | NOT NULL | - | - | 原本の取得日時(`data/open-data/<id>/fetch-meta.json` の `fetchedAt`、ISO 8601) | migration 0007 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0007 |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時 | migration 0007 |

## 14. `support_pathways`

ライフステージ×目的別の想定ルート(目的別ナビゲーション機能、`data/manual/municipalities/*.yaml` の `supportPathways`)。1つの調査データ上のルート(`lifestages` は配列)は、`municipality`/`lifestage`/`purpose_id` で一意に引けるよう、対象ライフステージごとに1行へ展開して持つ(`batch/scripts/ingest-manual-survey.mjs`)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 安定ID(`idFor(municipalityCode, "support-pathway", lifestage, purposeId)`) | migration 0022 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用。検索キーは`municipality_code`) | migration 0022 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `lifestage` | TEXT | NOT NULL | - | CHECK (`preschool`,`elementary-junior-high`,`high-school`,`university-vocational`,`working-adult`) | 対象ライフステージ(5値) | migration 0022 |
| `purpose_id` | TEXT | NOT NULL | - | - | UI上の目的選択肢のID(`PURPOSE_OPTIONS_BY_LIFESTAGE`の`id`と対応) | migration 0022 |
| `purpose_label` | TEXT | NOT NULL | - | - | 目的選択肢の表示ラベル | migration 0022 |
| `status` | TEXT | NOT NULL | `'confirmed'` | CHECK (`confirmed`,`unconfirmed`,`phone_required`) | 一次情報での確認状態 | migration 0022 |
| `sources_json` | TEXT | NOT NULL | - | - | ルート全体の出典JSON配列 | migration 0022 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0022 |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時 | migration 0022 |

インデックス: `idx_support_pathways_lookup`(§17参照)。

## 15. `support_pathway_steps`

想定ルート(`support_pathways`)ごとの順序付きステップ。1ルートが複数ステップを持てるため別テーブルにする。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 安定ID(`idFor(pathwayId, "step", stepIndex)`) | migration 0022 |
| `pathway_id` | TEXT | NOT NULL | - | REFERENCES `support_pathways(id)` | 所属する想定ルートのID | migration 0022 |
| `step_order` | INTEGER | NOT NULL | - | - | 表示順序 | migration 0022 |
| `title` | TEXT | NOT NULL | - | - | 表示文言 | migration 0022 |
| `actor` | TEXT | NULL可 | - | - | 窓口名 | migration 0022 |
| `contact` | TEXT | NULL可 | - | - | 問い合わせ先(電話番号等) | migration 0022 |
| `is_conditional` | INTEGER | NOT NULL | `0` | - | 「必要に応じて」等、任意ステップかどうか(0/1) | migration 0022 |
| `note` | TEXT | NULL可 | - | - | 補足 | migration 0022 |
| `sources_json` | TEXT | NULL可 | - | - | ステップ単位の出典JSON配列(ルート全体の出典と異なる場合のみ) | migration 0022 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0022 |

インデックス: `idx_support_pathway_steps_pathway_id`(§17参照)。

## 16. `results_guide_notes`

支援検索結果画面「1分でわかるガイド」機能の自治体固有補足(`data/manual/municipalities/*.yaml` の `resultsGuideNotes`)。汎用本文(`src/features/support/services/results-tab-guides.ts`)を自治体単位で補う。`相談窓口`・`学校情報`・`福祉ガイド`の3タブのみ対象。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 安定ID(`idFor(municipalityCode, "results-guide-note", tab)`) | migration 0023 |
| `municipality` | TEXT | NOT NULL | - | - | 自治体名(表示用。検索キーは`municipality_code`) | migration 0023 |
| `municipality_code` | TEXT | NOT NULL | `''` | - | 全国地方公共団体コード(JISコード5桁) | migration 0028 |
| `tab` | TEXT | NOT NULL | - | CHECK (`相談窓口`,`学校情報`,`福祉ガイド`) | 対象タブ(3値) | migration 0023 |
| `body_json` | TEXT | NOT NULL | - | - | 自治体固有の補足本文(段落配列)のJSON | migration 0023 |
| `sources_json` | TEXT | NOT NULL | - | - | 出典JSON配列 | migration 0023 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 作成日時 | migration 0023 |
| `updated_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 更新日時 | migration 0023 |

インデックス: `idx_results_guide_notes_lookup`(§21参照)。

## 17. `facility_reports`

掲載情報の誤り報告(TICKET-0064)。利用者が施設カードから送信する、施設の掲載情報の誤り報告本体。専用の管理UIは持たず、開発者が `wrangler d1 execute` で手動レビューする。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 受付ID(サーバー生成UUID) | migration 0024 |
| `facility_id` | TEXT | NOT NULL | - | - | 送信時点の施設ID。再取込でIDが変わり得るため参照整合は張らない | migration 0024 |
| `facility_name` | TEXT | NOT NULL | - | - | 送信時点の施設名(スナップショット、検索・突合用に非正規化) | migration 0024 |
| `municipality` | TEXT | NOT NULL | - | - | 送信時点の自治体名(スナップショット) | migration 0024 |
| `facility_snapshot_json` | TEXT | NOT NULL | - | - | 送信時点で配信していた施設情報全体のスナップショットJSON | migration 0024 |
| `report_category` | TEXT | NOT NULL | - | CHECK (`phone`,`address`,`content`,`closure`,`link`,`unclear`,`other`) | 報告種別(単一選択) | migration 0024 |
| `closure_status` | TEXT | NULL可 | - | CHECK (`closed`,`moved`,`renamed`,`merged`,`unknown-mismatch`) | `report_category='closure'` の場合のみの現在の状況 | migration 0024 |
| `corrected_value` | TEXT | NULL可 | - | - | 正しいと思われる内容(任意、最大200字) | migration 0024 |
| `detail_text` | TEXT | NULL可 | - | - | 補足・情報源など自由記述(任意、最大500字) | migration 0024 |
| `status` | TEXT | NOT NULL | `'new'` | CHECK (`new`,`done`,`dismissed`) | 運用トリアージ状態。開発者が wrangler CLI で更新する | migration 0024 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 送信日時 | migration 0024 |
| `status_updated_at` | TEXT | NULL可 | - | - | status が done/dismissed に更新された日時。自由記述の保持期限(90日、report-retention.ts)の起算点。status='new' の間は NULL | migration 0027 |

インデックス: `idx_facility_reports_status`・`idx_facility_reports_created_at`(§21参照)。

## 18. `report_rate_limits`

掲載情報の誤り報告(TICKET-0064)専用の送信レート制限カウンタ。`ai_rate_limits`(§5)とは別テーブルとし、報告スパム対策とAI利用枠が競合しないようにする。IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `client_key` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | IP・window_start・salt の SHA-256 ハッシュ | migration 0024 |
| `window_start` | INTEGER | NOT NULL | - | 複合PRIMARY KEYの一部 | 固定ウィンドウ開始時刻(Unix秒) | migration 0024 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該ウィンドウの報告送信回数 | migration 0024 |

インデックス: `idx_report_rate_limits_window_start`(§21参照)。

## 19. `content_reports`

掲載情報の訂正・更新報告を施設以外(想定ルート・学校情報・結果の見方ガイド)へ拡張したもの(migration 0025)。`facility_reports`(§17)とは意図的に別テーブルとし、対象種別ごとにスナップショットの形が大きく異なる点を吸収する。専用の管理UIは持たず、開発者が `wrangler d1 execute` で手動レビューする。レート制限は `report_rate_limits`(§18)を共用する。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 受付ID(サーバー生成UUID) | migration 0025 |
| `target_type` | TEXT | NOT NULL | - | CHECK (`pathway`,`school`,`guide_note`,`guide_generic`) | 報告対象の種別 | migration 0025 |
| `target_id` | TEXT | NULL可 | - | - | 送信時点の対象ID(`support_pathways.id`/`schools.id`/`results_guide_notes.id`)。`guide_generic`(D1行を持たない汎用ガイド)のみ`NULL`。参照整合は張らない | migration 0025 |
| `target_label` | TEXT | NOT NULL | - | - | 検索・突合用に非正規化した対象の表示名(`purposeLabel`/学校名/ガイド見出し) | migration 0025 |
| `municipality` | TEXT | NOT NULL | - | - | 送信時点の自治体名(スナップショット) | migration 0025 |
| `lifestage` | TEXT | NULL可 | - | CHECK (`preschool`,`elementary-junior-high`,`high-school`,`university-vocational`,`working-adult`) | `pathway`・`guide`のみ:対象のライフステージ(`school`はライフステージ非依存のため`NULL`) | migration 0025 |
| `tab` | TEXT | NULL可 | - | CHECK (`相談窓口`,`学校情報`,`福祉ガイド`,`発達障害支援資料`,`支援制度`) | `guide_note`/`guide_generic`のみ:対象タブ | migration 0025 |
| `target_snapshot_json` | TEXT | NOT NULL | - | - | 送信時点で配信していた対象情報全体のスナップショットJSON。サーバーがD1/ソースコードから再構築する | migration 0025 |
| `report_category` | TEXT | NOT NULL | - | CHECK (`phone`,`address`,`contact`,`content`,`fixed-class`,`resource-room`,`school-status`,`link`,`outdated`,`unclear`,`other`) | 報告種別(単一選択) | migration 0025 |
| `corrected_value` | TEXT | NULL可 | - | - | 正しいと思われる内容(任意、最大200字) | migration 0025 |
| `detail_text` | TEXT | NULL可 | - | - | 補足・情報源など自由記述(任意、最大500字) | migration 0025 |
| `status` | TEXT | NOT NULL | `'new'` | CHECK (`new`,`done`,`dismissed`) | 運用トリアージ状態。開発者が wrangler CLI で更新する | migration 0025 |
| `created_at` | TEXT | NOT NULL | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | - | 送信日時 | migration 0025 |
| `status_updated_at` | TEXT | NULL可 | - | - | status が done/dismissed に更新された日時。自由記述の保持期限(90日、report-retention.ts)の起算点。status='new' の間は NULL | migration 0027 |

インデックス: `idx_content_reports_status`・`idx_content_reports_created_at`(§21参照)。

## 20. `beta_gate_rate_limits`

クローズドベータのパスワードゲート(`/api/beta-gate`)専用のレート制限カウンタ(パスワード総当たり対策、migration 0026)。`ai_rate_limits`(§5)・`report_rate_limits`(§18)とは別テーブル。IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `client_key` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | IP・window_start・salt の SHA-256 ハッシュ | migration 0026 |
| `window_start` | INTEGER | NOT NULL | - | 複合PRIMARY KEYの一部 | 固定ウィンドウ開始時刻(Unix秒) | migration 0026 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該ウィンドウのパスワード送信回数 | migration 0026 |

インデックス: `idx_beta_gate_rate_limits_window_start`(§21参照)。

## 21. インデックス

| インデックス名 | 対象 | 目的 |
| --- | --- | --- |
| `idx_facilities_municipality` | `facilities(municipality)` | 区市町村での絞り込み検索(FR-024)。名前キー時代のインデックスで、コードキー参照が完全化するPhase 2で削除予定(migration 0028) |
| `idx_facilities_municipality_code` | `facilities(municipality_code)` | 自治体コードでの絞り込み検索(migration 0028) |
| `idx_schools_municipality_code` | `schools(municipality_code)` | 自治体コード別の学校取得(migration 0028) |
| `idx_high_school_pathways_municipality_code` | `high_school_pathways(municipality_code)` | 自治体コード別の進学先取得(migration 0028) |
| `idx_class_organizations_municipality_code` | `class_organizations(municipality_code)` | 自治体コード別の学級編制取得(migration 0028) |
| `idx_special_needs_schools_municipality_code` | `special_needs_schools(municipality_code)` | 自治体コード別の特別支援学校取得(migration 0028) |
| `idx_support_pathways_lookup_code` | `support_pathways(municipality_code, lifestage, purpose_id)` | 目的選択時の想定ルート取得(コードキー、migration 0028) |
| `idx_results_guide_notes_lookup_code` | `results_guide_notes(municipality_code, tab)` | タブ表示時の自治体固有補足取得(コードキー、migration 0028) |
| `idx_facilities_category_type` | `facilities(category_type)` | タブ分類での絞り込み(FR-028) |
| `idx_facilities_is_medical` | `facilities(is_medical)` | 医療機関除外条件の絞り込み(FR-025) |
| `idx_facilities_is_out_of_scope` | `facilities(is_out_of_scope)` | 対象領域外施設除外条件の絞り込み(migration 0011) |
| `idx_facilities_dataset_id` | `facilities(dataset_id)` | `datasets`とのJOIN |
| `idx_facility_tags_tag` | `facility_tags(tag)` | タグでの絞り込み・突合 |
| `idx_facility_tags_facility_id` | `facility_tags(facility_id)` | `facilities`とのJOIN(タグ一覧取得) |
| `idx_school_fixed_classes_school_id` | `school_fixed_classes(school_id)` | 学校ごとの固定級取得 |
| `idx_high_school_pathways_municipality` | `high_school_pathways(municipality)` | 自治体別の進学先取得 |
| `idx_class_organizations_municipality` | `class_organizations(municipality)` | 自治体別の学級編制取得 |
| `idx_school_registry_municipality` | `school_registry(municipality)` | 自治体別のオープンデータ学校一覧取得 |
| `idx_school_registry_school_code` | `school_registry(school_code)` | 学校コードでの突合 |
| `idx_school_registry_source_id` | `school_registry(source_id)` | source単位の再取込時のDELETE絞り込み |
| `idx_special_needs_schools_municipality` | `special_needs_schools(municipality)` | 自治体別の特別支援学校取得 |
| `idx_support_pathways_lookup` | `support_pathways(municipality, lifestage, purpose_id)` | 目的選択時の想定ルート取得 |
| `idx_support_pathway_steps_pathway_id` | `support_pathway_steps(pathway_id)` | ルートごとのステップ一覧取得 |
| `idx_results_guide_notes_lookup` | `results_guide_notes(municipality, tab)` | タブ表示時の自治体固有補足取得 |
| `idx_facility_reports_status` | `facility_reports(status)` | 未対応(`status='new'`)報告の一覧取得(週次レビュー) |
| `idx_facility_reports_created_at` | `facility_reports(created_at)` | 報告一覧の新着順ソート |
| `idx_report_rate_limits_window_start` | `report_rate_limits(window_start)` | 期限切れウィンドウ行の削除 |
| `idx_track_rate_limits_window_start` | `track_rate_limits(window_start)` | 期限切れウィンドウ行の削除 |
| `idx_feedback_comments_created_date` | `feedback_comments(created_date)` | コメント一覧の日付ソート・絞り込み |
| `idx_feedback_comments_published` | `feedback_comments(published)` | 未公開コメントのレビュー対象抽出 |
| `idx_feedback_comments_dismissed` | `feedback_comments(dismissed)` | 未レビューコメントの日次ダイジェスト集計対象抽出 |
| `idx_feedback_rate_limits_window_start` | `feedback_rate_limits(window_start)` | 期限切れウィンドウ行の削除 |

## 22. `track_rate_limits`

利用計測(`POST /api/track`)専用のレート制限カウンタ(連続POSTによる`usage_counts`汚染対策、migration 0030、セキュリティレビュー指摘対応)。`ai_rate_limits`(§5)・`report_rate_limits`(§18)・`beta_gate_rate_limits`(§20)とは別テーブル。IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `client_key` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | IP・window_start・salt の SHA-256 ハッシュ | migration 0030 |
| `window_start` | INTEGER | NOT NULL | - | 複合PRIMARY KEYの一部 | 固定ウィンドウ開始時刻(Unix秒) | migration 0030 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該ウィンドウの計測POST回数 | migration 0030 |

インデックス: `idx_track_rate_limits_window_start`(§21参照)。

## 23. `feedback_rating_counts`

支援先一覧画面「このページで、次に何をすればよいか分かりましたか?」の3択評価(migration 0031)。プライバシー最小主義(NFR-31〜33)のため、行レベル記録は持たず「日付×画面×選択肢」の集計カウンタのみを保持する(`usage_counts` §4と同方針)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `date` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | 集計日(ISO 8601の日付部分のみ、UTC)。時刻は保持しない | migration 0031 |
| `source` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部、CHECK (`support-results`,`result-prepare`) | 評価元の画面 | migration 0031 |
| `rating` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部、CHECK (`clear`,`partial`,`unclear`) | 3択評価 | migration 0031 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該日・画面・選択肢の送信回数 | migration 0031 |

## 24. `feedback_unclear_reason_counts`

「まだ分からない」を選んだ場合の内訳(単一選択・任意)の集計カウンタ(migration 0031)。`feedback_rating_counts`(§23)とは意図的に別テーブルとし、内訳は画面(source)非依存の理由集計として持つ。行レベル記録は持たない。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `date` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | 集計日(ISO 8601の日付部分のみ、UTC)。時刻は保持しない | migration 0031 |
| `reason` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部、CHECK (`facility-fit`,`first-step`,`scheme-diff`,`info-gap`,`other`) | 「まだ分からない」の理由 | migration 0031 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該日・理由の送信回数 | migration 0031 |

## 25. `feedback_comments`

任意の一言コメント(公開許可付き、migration 0031)。3択評価・内訳とは異なり集計値に還元できないため、このテーブルのみ送信された自由記述文そのものを行レベルで保持する。個人を特定できる情報(IP・User-Agent・詳細なタイムスタンプ等)は一切含めず、`created_date` も日付(YYYY-MM-DD)のみを保持する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | TEXT | NOT NULL | - | PRIMARY KEY | 受付ID(サーバー生成UUID) | migration 0031 |
| `created_date` | TEXT | NOT NULL | - | - | 送信日(ISO 8601の日付部分のみ、UTC)。時刻は保持しない | migration 0031 |
| `source` | TEXT | NOT NULL | - | CHECK (`support-results`,`result-prepare`) | 評価元の画面 | migration 0031 |
| `comment_text` | TEXT | NOT NULL | - | - | コメント本文(トリム後1〜500字、文字数検証はzodスキーマ側の責務) | migration 0031 |
| `publish_consent` | INTEGER | NOT NULL | `0` | CHECK (0,1) | 送信者が「このコメントを公開してよい」に同意したか | migration 0031 |
| `published` | INTEGER | NOT NULL | `0` | CHECK (0,1) | 公開フラグ。開発者が内容を確認したうえで wrangler d1 execute で手動更新する | migration 0031 |
| `dismissed` | INTEGER | NOT NULL | `0` | CHECK (0,1) | レビュー済みフラグ。レビューした結果「掲載しない」と判断した場合に立てる。`published`とは独立した列で、これが無いと「まだ見ていない」と「見たが公開しないと決めた」の両方が`published=0`のまま区別できず、日次Slackダイジェストが見送り済みの同一コメントを毎日通知し続けてしまう | migration 0032 |

インデックス: `idx_feedback_comments_created_date`・`idx_feedback_comments_published`・`idx_feedback_comments_dismissed`(§21参照)。

## 26. `feedback_rate_limits`

フィードバック送信(`POST /api/feedback`)専用の送信レート制限カウンタ(migration 0031)。`ai_rate_limits`(§5)・`report_rate_limits`(§18)・`beta_gate_rate_limits`(§20)・`track_rate_limits`(§22)とは意図的に別テーブルとする。IP アドレスは保存せず、ウィンドウごとに異なる SHA-256 ハッシュのみを保存する(NFR-31〜33)。

| カラム名 | 型 | NULL可否 | デフォルト | 制約 | 意味 | 由来 |
| --- | --- | --- | --- | --- | --- | --- |
| `client_key` | TEXT | NOT NULL | - | 複合PRIMARY KEYの一部 | IP・window_start・salt の SHA-256 ハッシュ | migration 0031 |
| `window_start` | INTEGER | NOT NULL | - | 複合PRIMARY KEYの一部 | 固定ウィンドウ開始時刻(Unix秒) | migration 0031 |
| `count` | INTEGER | NOT NULL | `0` | - | 当該ウィンドウの送信回数 | migration 0031 |

インデックス: `idx_feedback_rate_limits_window_start`(§21参照)。
