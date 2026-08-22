// 取込対象データセットの定数定義(FR-031, FR-034)。
//
// ここに列挙したデータセットのみを IngestWorkflow が処理する。新しいデータセットを追加する
// 際は、CKAN の package_show で実在確認した上でこの配列に追記すること
// (実在未確認のデータセットを推測で追加しない)。

import type { AgeRange, CsvColumnMap, FacilityCategoryType, LifestageRange } from "./transform";

/**
 * 本実装が扱うリソース形式(CKAN の resource.format を正規化した値)。
 * "HTML" は TICKET-0049 で追加(hattatsu.go.jp 等、CKAN 非登録の HTML ベースの国データソース用)。
 * 現時点では `workers/ingest/workflow.ts` の自動取得ステップに HTML 用の fetch/正規化は
 * 接続していない(`html-knowledge-normalize.ts` の正規化コードは実装・テスト済みだが、
 * `ckanPackageId: null` のデータセットは常にメタ情報のみ記録するため、"HTML" を
 * `preferredFormats` に指定しても現状は使われない。作業ログ参照)。
 */
export type ResourceFormat = "CSV" | "XLSX" | "HTML";

export interface DatasetResourcePreference {
  /** 優先して使うフォーマット。先頭から順に CKAN のリソース一覧から探す。 */
  preferredFormats: ResourceFormat[];
  /**
   * 既知の理由(404 等)で取得を試みず即座にスキップするフォーマット(FR-034)。
   * 実在するリソースであってもここに含まれていれば preferredFormats 内の次候補へ進む。
   */
  knownBadFormats?: ResourceFormat[];
}

export interface DatasetConfig {
  /** D1 `datasets.id`。取込 Worker が決定的に UPSERT するための安定キー。 */
  id: string;
  /** CKAN パッケージ ID(package_show の `id`)。CKAN 未登録・登録終了のデータセットは null。 */
  ckanPackageId: string | null;
  title: string;
  sourceOrg: string;
  /** ライセンス識別子。src/features/data-ingest/services/licenseClassifier.ts の分類対象。 */
  license: string;
  resource: DatasetResourcePreference;
  /** CSV の文字エンコーディング。未指定時は従来どおり UTF-8 として扱う。 */
  encoding?: "utf-8" | "shift-jis";
  /** 単一自治体のデータセットで使用する自治体名。指定時は CSV 値から推測しない。 */
  fixedMunicipality?: string;
  /** CSV 正規化時の列名マッピング。CSV を正規化しないデータセット(frozen 等)では省略可。 */
  csvColumns?: CsvColumnMap;
  defaultCategoryType: FacilityCategoryType;
  /** csvColumns.subtypeColumn が未設定、または行の値が空の場合に使うデータセット単位のフォールバック値。 */
  defaultFacilitySubtype?: string;
  /** 指定時は inferAgeRange を無視し、全行の age_range をこの値で固定する。
   *  データセット全体が特定年齢層専用であることが確定している場合に使う
   *  (例: 保育施設・児童館・子ども家庭支援センターは 18 歳未満/子育て世帯専用)。fixedMunicipality の年齢版。 */
  fixedAgeRange?: AgeRange;
  /** 指定時、データセット単位の既定ライフステージ範囲(LIFESTAGE_VALUES 序数の [min, max])として
   *  全行の lifestage_min/max に適用する。行の facility_subtype が transform.ts の
   *  SUBTYPE_LIFESTAGE_RANGE に一致する場合はそちらが優先される。fixedAgeRange のライフステージ版。 */
  fixedLifestageRange?: LifestageRange;
  /** 指定時、行の contactMethods(csvColumns.contactMethods 由来)が空の場合にのみ使う既定値。
   *  データセット全体が単一の組織(例: 区役所)によって運営され、その組織が個別施設向けではない
   *  組織単位の問い合わせ窓口(メールフォーム等)を一つだけ持つと確認できている場合に使う。
   *  fixedAgeRange の連絡手段版。行の実データを上書きしない(常に行値を優先)。 */
  fixedContactMethods?: string;
  /** 指定時、行の url(csvColumns.url 由来)が空の場合にのみ使う既定値。fixedContactMethods と対になる
   *  ケースで使う: 個別施設向けの専用フォームではなく、単一組織が持つ問い合わせ先ページを
   *  「詳細を見る」ボタン(FacilityCard.tsx の facility.url レンダリング)として提示したい場合。
   *  fixedAgeRange/fixedContactMethods と同じ優先順位: 行の実データを上書きしない。 */
  fixedUrl?: string;
  /**
   * true の場合、ネットワーク取得を一切行わず、鮮度メタ(freshness_note)のみを記録する。
   * こどもDX レジストリのように更新が終了しているデータセットに使う(FR-034 AC-6)。
   */
  frozen?: boolean;
  /** 既知のデータ品質問題・鮮度に関する注記。dataset の freshness_note に必ず含める。 */
  freshnessNote?: string;
}

/** 東京都オープンデータカタログ(CKAN)のベース URL(FR-031)。 */
export const CKAN_BASE_URL = "https://catalog.data.metro.tokyo.lg.jp";

/** 台東区が運営する施設(区立施設)向けの区共通問い合わせフォームURL。個別施設専用のフォームではない
 *  (2026-07 Web調査で確認: 台東区公式サイトに区全体向けの一般問い合わせフォームがあるのみ)。 */
const TAITO_WARD_GENERAL_INQUIRY_URL = "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html";

/** 上記URLを「詳細を見る」ボタンとして提示するため、本文からはURLを外した案内文。 */
const TAITO_WARD_GENERAL_INQUIRY_TEXT = "個別のメール窓口はありませんが、台東区ウェブサイトの「お問合せ・ご意見」ページからお問い合わせいただけます(施設宛の専用フォームではなく区の総合窓口です)。";

export const INGEST_DATASETS: DatasetConfig[] = [
  {
    id: "ds-tokyo-fukushi-shisetsu",
    // 実在確認済み(TICKET-0011 チケット記載)。CSV リソースは 404、XLSX のみ有効(FR-034)。
    ckanPackageId: "t000054d0000000058",
    title: "発達障害 支援機関・医療機関の情報",
    sourceOrg: "東京都福祉局",
    license: "cc-by-4.0",
    resource: {
      preferredFormats: ["XLSX", "CSV"],
      knownBadFormats: ["CSV"],
    },
    csvColumns: {
      name: "名称",
      address: "所在地",
      phone: "電話番号",
      url: "ホームページ",
      ageHint: "対象",
      municipality: "区市町村",
      medicalHint: "分類",
      description: "備考",
    },
    defaultCategoryType: "相談窓口",
    freshnessNote:
      "カタログとサイト本体(都福祉局サイト)とで鮮度差がある可能性がある。月次の目視差分チェック対象(NFR-62)。",
  },
  {
    id: "ds-kodomo-dx-registry",
    // CKAN カタログには登録されていない(こどもDX 独自レジストリ)ため package_show は行わない。
    ckanPackageId: null,
    title: "こどもDX障害福祉レジストリ",
    sourceOrg: "こどもDX",
    // 政府標準利用規約の特定版(F/G)であることまでは確認できていないため、既定の
    // 分類(区分H・中リスク)に倒し、個別確認が完了するまで全文投入しない(FR-033)。
    license: "government-standard",
    resource: { preferredFormats: ["CSV"] },
    defaultCategoryType: "発達障害支援資料",
    frozen: true,
    freshnessNote: "2025/8/20 で更新終了。以降のレコードは鮮度チェック対象外(FR-034 既知課題)。",
  },
  {
    id: "ds-hattatsu-shien-center",
    // 実在確認済み(TICKET-0049 作業ログ参照。2026-07-13 に WebFetch でトップページ
    // https://www.rehab.go.jp/ddis/ および利用規約ページ http://www.rehab.go.jp/agree
    // (301 リダイレクト先)、解説ページ例 https://www.rehab.go.jp/ddis/understand/whatsdd
    // の実在・ライセンス表記を直接確認した)。東京都オープンデータカタログ(CKAN)には
    // 登録されていない国データソースのため package_show は行わない(こどもDX と同じ扱い)。
    ckanPackageId: null,
    title: "発達障害情報・支援センター",
    sourceOrg: "国立障害者リハビリテーションセンター",
    // 実測確認したライセンス表記(2026-07-13時点、http://www.rehab.go.jp/agree):
    // 「公共データ利用規約(PDL1.0)」。政府標準利用規約(第2.0/1.0版)とは名称が異なるが、
    // 内閣官房が定める同種の政府オープンデータ標準ライセンスであり、CC BY 相当の低リスクとして
    // 扱う(licenseClassifier.ts に "pdl-1.0" として追加、区分F相当)。
    license: "pdl-1.0",
    // HTML ベースの解説サイトであり、CSV/XLSX のような構造化リソース配信は無い。
    resource: { preferredFormats: ["HTML"] },
    defaultCategoryType: "発達障害支援資料",
    freshnessNote:
      "CKAN 未登録の国データソース(HTML サイト)のため、既存の CKAN→R2→D1 自動取込パイプラインには" +
      "現時点で接続していない。ckanPackageId が null のため workers/ingest/workflow.ts は" +
      "メタ情報(datasets 行)のみを記録し、facilities への実データ投入は行わない" +
      "(TICKET-0049 作業ログ: 正規化コード自体は workers/ingest/html-knowledge-normalize.ts に" +
      "実装・フィクスチャでテスト済みだが、実データ取込の自動接続・実投入は未実施)。",
  },
  {
    id: "ds-taito-kuyakusho",
    ckanPackageId: "t131067d0000000223",
    title: "区役所・分庁舎・区民事務所・地区センター",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "相談窓口",
    defaultFacilitySubtype: "行政窓口",
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
  {
    id: "ds-taito-jidokan",
    ckanPackageId: "t131067d0000000224",
    title: "児童館・こどもクラブ",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "福祉ガイド",
    defaultFacilitySubtype: "児童館・こどもクラブ",
    fixedAgeRange: "child",
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
  {
    id: "ds-taito-hoiku-shisetsu",
    ckanPackageId: "t131067d0000000225",
    title: "保育施設",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "福祉ガイド",
    defaultFacilitySubtype: "保育施設",
    fixedAgeRange: "child",
    fixedLifestageRange: [0, 0], // 保育施設(0〜6歳): 未就学のみ
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
  {
    id: "ds-taito-kodomo-katei-shien",
    ckanPackageId: "t131067d0000000227",
    title: "子ども家庭支援センター",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "相談窓口",
    defaultFacilitySubtype: "子ども家庭支援",
    fixedAgeRange: "child",
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
  {
    id: "ds-taito-hoken-shisetsu",
    ckanPackageId: "t131067d0000000229",
    title: "保健施設",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "相談窓口",
    defaultFacilitySubtype: "保健施設",
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
  {
    id: "ds-taito-fukushi-shisetsu",
    ckanPackageId: "t131067d0000000231",
    title: "福祉施設",
    sourceOrg: "台東区",
    license: "cc-by-4.0",
    resource: { preferredFormats: ["CSV"] },
    encoding: "shift-jis",
    fixedMunicipality: "台東区",
    csvColumns: { name: "名称", address: "所在地", phone: "電話番号", ageHint: "名称", lngColumn: "X座標", latColumn: "Y座標", subtypeColumn: "大分類" },
    defaultCategoryType: "相談窓口",
    defaultFacilitySubtype: "福祉施設",
    fixedContactMethods: TAITO_WARD_GENERAL_INQUIRY_TEXT,
    fixedUrl: TAITO_WARD_GENERAL_INQUIRY_URL,
  },
];
