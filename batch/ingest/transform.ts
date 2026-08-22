// オープンデータ(CSV)→ facility レコードへの正規化ロジック(純関数、vitest でテスト可能)。
//
// ネットワーク・D1・R2 いずれにも依存しない。CKAN から取得した CSV テキストを
// `db/schema.sql` の `facilities` テーブルにそのまま UPSERT できる形へ変換する。
// 参考: db/schema.sql(facilities のカラム定義・CHECK 制約)

import {
  BROAD_AREA_MUNICIPALITY_CODE,
  municipalityToCode,
  TOKYO_MUNICIPALITY_CODE_BY_NAME,
} from "../../app/src/features/support/constants/municipality-codes";

/** db/schema.sql の facilities.category_type CHECK 制約に対応する4分類(FR-028)。 */
export type FacilityCategoryType = "相談窓口" | "支援制度" | "福祉ガイド" | "発達障害支援資料";

/** db/schema.sql の facilities.age_range CHECK 制約に対応する対象年齢区分。 */
export type AgeRange = "child" | "adult" | "both";

/**
 * 対象ライフステージ範囲(migration 0016)。LIFESTAGE_VALUES 序数の [min, max]。
 * 取込時はデータセット/サブタイプ単位の確定情報からのみ与える(fixedAgeRange と同じ ground-truth 方針)。
 */
export type LifestageRange = readonly [number, number];

// ============================================================
// CSV パース(RFC4180 相当の簡易実装)
// ============================================================

/**
 * CSV テキストを行×列の文字列配列にパースする。
 *
 * ダブルクォートで囲まれたフィールド内のカンマ・改行・エスケープされた `""` に対応する。
 * 外部ライブラリに依存しない最小実装(このデータ取込用途では十分な範囲)。
 */
export function parseCsv(text: string): string[][] {
  // 先頭の BOM(Excel からのエクスポートで付与されがち)を除去する。
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r") {
      // \r\n は次の \n 側でまとめて改行処理する。単独 \r のみの場合はここで改行扱いにする。
      if (input[i + 1] !== "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      }
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  // 最終行(末尾に改行がない場合)を回収する。
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 完全な空行(末尾の余剰改行等)は除外する。
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** ヘッダー行付き CSV テキストを `{ ヘッダー名: 値 }` のレコード配列に変換する。 */
export function csvRowsToRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const trimmedHeader = header.map((h) => h.trim());
  return body
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      trimmedHeader.forEach((key, index) => {
        record[key] = (row[index] ?? "").trim();
      });
      return record;
    });
}

// ============================================================
// 区市町村抽出
// ============================================================

/** 東京都 23区・26市・5町・8村(全62自治体)。長い名称を先に判定し部分一致の誤検出を避ける。 */
const TOKYO_MUNICIPALITIES = Object.keys(TOKYO_MUNICIPALITY_CODE_BY_NAME).sort((a, b) => b.length - a.length);

/**
 * 住所・区市町村欄・施設名等の候補文字列から東京都の区市町村名を抽出する。
 * どの候補にも該当が無い場合は、都全域窓口のフォールバック値 '東京都' を返す
 * (db/schema.sql の municipality コメント、FR-022 / MVP-3)。
 *
 * 候補は優先順(通常: 区市町村欄 → 住所 → 施設名)に渡す。区市町村欄が明示的に
 * '東京都'(広域指定)である場合は、住所欄がたまたま特定区の所在地(事務局所在地等)を
 * 含んでいても上書きしない(例: 広域窓口の事務局が新宿区にあっても municipality は
 * '東京都' のまま扱う)。
 */
export function extractMunicipality(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (trimmed === "東京都") {
      return "東京都";
    }
    for (const municipality of TOKYO_MUNICIPALITIES) {
      if (candidate.includes(municipality)) {
        return municipality;
      }
    }
  }
  return "東京都";
}

// ============================================================
// 対象年齢区分の推定
// ============================================================

const CHILD_PATTERN = /18歳未満|未就学|児童|子ども|こども|小児/;
const ADULT_PATTERN = /18歳以上|成人(?!式)|大人/;

/**
 * 「対象」欄・備考等の自由記述テキストから対象年齢区分を推定する(FR-021)。
 * 子ども・成人いずれの言及も無い場合(記載なし・全年齢等)は 'both' にフォールバックする。
 */
export function inferAgeRange(...texts: Array<string | null | undefined>): AgeRange {
  const joined = texts.filter((t): t is string => Boolean(t)).join(" ");
  const hasChild = CHILD_PATTERN.test(joined);
  const hasAdult = ADULT_PATTERN.test(joined);
  if (hasChild && hasAdult) return "both";
  if (hasChild) return "child";
  if (hasAdult) return "adult";
  return "both";
}

// ============================================================
// 医療機関判定
// ============================================================

const MEDICAL_PATTERN = /病院|医院|クリニック|診療所|診療科|医療機関/;

/**
 * 分類欄・施設名・備考等から医療機関かどうかを判定する(FR-025)。
 * true の場合、取込 Worker 側で is_medical=1 として記録し、検索クエリ側で除外対象にする。
 */
export function isMedicalFacility(...texts: Array<string | null | undefined>): boolean {
  const joined = texts.filter((t): t is string => Boolean(t)).join(" ");
  return MEDICAL_PATTERN.test(joined);
}

// ============================================================
// 対象領域外施設判定
// ============================================================

/**
 * アプリの対象領域(発達障害の相談支援)から外れる施設サブタイプ(「大分類」)の値。
 * 初出は台東区「福祉施設」CSV(ds-taito-fukushi-shisetsu)の高齢者専用3分類。
 * データセットを問わず、解決済みサブタイプがこの集合に一致する行は is_out_of_scope=1 として
 * 記録し、検索クエリ側で除外する(is_medical と同じ機構。migration 0011)。
 * 「区民事務所」(住民票等の証明書発行窓口)・「地区センター」(集会室貸出施設)は
 * 台東区「区役所」CSV(ds-taito-kuyakusho)由来。いずれも相談機能を持たない定型的な
 * 自治体施設類型の名称であり、サブタイプ完全一致であれば他データセットで別の意味に
 * 解決される衝突リスクは実質無い(「区役所」本体は多部門庁舎のため除外しない。migration 0014)。
 */
const OUT_OF_SCOPE_SUBTYPES: ReadonlySet<string> = new Set([
  "地域包括支援センター・ケアマネジメントセンター",
  "特別養護老人ホーム・高齢者在宅サービスセンター",
  "老人福祉センター・老人福祉館",
  "区民事務所",
  "地区センター",
]);

/**
 * 施設名・説明文から高齢者専用施設を検出するキーワード(MEDICAL_PATTERN と同方式)。
 * サブタイプが汎用値(例: 台東区 CSV の「大分類=福祉施設」「大分類=保健施設」)で判別できない
 * 行を補完する(初出: ケアハウス松が谷。migration 0012)。「老人保健施設」(介護老人保健施設。
 * 法令上高齢者専用)は migration 0013 で追加(初出: 老人保健施設千束)。
 * 単独の「高齢者」は、高齢者・障害者複合施設等の誤除外リスクがあるため含めない。
 * 「口腔ケア」等の一般的なサービス記述語も、障害者歯科等の誤除外リスクがあるため含めず、
 * 個別施設は OUT_OF_SCOPE_EXACT_NAMES で扱う。
 */
const OUT_OF_SCOPE_NAME_PATTERN = /ケアハウス|老人ホーム|老人福祉|老人保健施設|地域包括支援センター/;

/**
 * キーワードでは類型化できないが、個別調査で対象領域外と確認済みの施設の正式名称
 * (完全一致・TRIM 後)。「口腔ケア」のような一般的サービス記述語をキーワード化すると
 * 障害者歯科等を誤除外しうるため、カテゴリではなく施設単位で除外する第3レイヤ
 * (初出: 三ノ輪口腔ケアセンター、ds-taito-hoken-shisetsu。migration 0013)。
 * データセットは限定しない(同名別施設の衝突は実質無視できるため)。
 * migration 0014 で追加(いずれも ds-taito-fukushi-shisetsu):
 * - 社会福祉協議会: 台東区社協の総合事務所。「社会福祉協議会」をキーワード化すると
 *   WAM NET の「〇〇市社会福祉協議会…相談支援事業所」等の正規の障害相談窓口
 *   (無修飾の単独名は持たない)を誤除外するため、無修飾名の完全一致のみで除外する。
 * - 身体障害者生活ホーム「フロム千束」: 身体障害専用のグループホーム。「身体障害者」は
 *   三障害(身体・知的・精神)複合の相談支援施設名にも現れうるためキーワード化しない。
 */
const OUT_OF_SCOPE_EXACT_NAMES: ReadonlySet<string> = new Set([
  "三ノ輪口腔ケアセンター",
  "社会福祉協議会",
  "身体障害者生活ホーム「フロム千束」",
]);

/**
 * 対象領域外(高齢者専用施設等)かどうかを判定する。以下のいずれかで true:
 * 1) 解決済み facilitySubtype が OUT_OF_SCOPE_SUBTYPES に完全一致
 * 2) 名称(TRIM 後)が OUT_OF_SCOPE_EXACT_NAMES に完全一致
 * 3) 名称・説明文等の連結テキストが OUT_OF_SCOPE_NAME_PATTERN に一致
 */
export function isOutOfScopeFacility(
  facilitySubtype: string | null | undefined,
  name?: string | null,
  ...otherTexts: Array<string | null | undefined>
): boolean {
  if (facilitySubtype != null && OUT_OF_SCOPE_SUBTYPES.has(facilitySubtype)) return true;
  if (name != null && OUT_OF_SCOPE_EXACT_NAMES.has(name.trim())) return true;
  const joined = [name, ...otherTexts].filter((t): t is string => Boolean(t)).join(" ");
  return OUT_OF_SCOPE_NAME_PATTERN.test(joined);
}

/**
 * 解決済み facility_subtype 単位でのライフステージ範囲の上書き表(migration 0016)。
 * データセット全体では一律に決まらないが、サブタイプ値が確定情報を与える場合に使う。
 * 現状の唯一の初出は台東区「児童館・こどもクラブ」(ds-taito-jidokan)で、
 * 「こどもクラブ・学童保育所」= 放課後児童健全育成事業(学齢児)→ elementary-junior-high のみ [1,1]。
 * 「児童館」は一般来館施設(0〜18)で広範のため表に含めず、既定(データセットの fixedLifestageRange
 * = 未指定 = null)へフォールバックする。isOutOfScopeFacility と同じく解決済みサブタイプをキーにする。
 * キーはデータセット非依存の完全一致(サブタイプ語彙は開放集合だが、この値は他データセットで
 * 別意味に解決される衝突リスクが実質無い、OUT_OF_SCOPE_SUBTYPES と同方針)。
 */
const SUBTYPE_LIFESTAGE_RANGE: ReadonlyMap<string, LifestageRange> = new Map([
  ["こどもクラブ・学童保育所", [1, 1] as const],
]);

/**
 * 解決済み facilitySubtype と、データセット単位の既定範囲(fixedLifestageRange)から
 * 最終的なライフステージ範囲を決める純関数。サブタイプ表に一致すればそれを優先し、
 * 無ければデータセット既定を使い、いずれも無ければ [null, null](細分なし)。
 */
export function resolveLifestageRange(
  facilitySubtype: string | null | undefined,
  fixedLifestageRange?: LifestageRange,
): { min: number | null; max: number | null } {
  if (facilitySubtype != null) {
    const bySubtype = SUBTYPE_LIFESTAGE_RANGE.get(facilitySubtype);
    if (bySubtype) return { min: bySubtype[0], max: bySubtype[1] };
  }
  if (fixedLifestageRange) return { min: fixedLifestageRange[0], max: fixedLifestageRange[1] };
  return { min: null, max: null };
}

// ============================================================
// 決定的 ID 生成
// ============================================================

/**
 * データセット ID + 施設を一意に特定できる文字列(名称+住所 等)から、決定的な facility ID を
 * 生成する(FNV-1a 32bit)。crypto API に依存せず同期的に計算できるため、再取込時も同じ入力から
 * 常に同じ ID が得られ、UPSERT が安定する(db/schema.sql の id 設計方針)。
 * 暗号学的な衝突耐性は要求しない用途(施設件数は高々数千件)であることを踏まえた選択。
 */
export function stableFacilityId(datasetId: string, seed: string): string {
  const input = `${datasetId}:${seed}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fac-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// ============================================================
// CSV 行 → facility レコード
// ============================================================

/** データセットごとの CSV 列名マッピング(必須は name のみ、他は任意)。 */
export interface CsvColumnMap {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  /** 対象年齢の手がかりになる列(例: 「対象」)。 */
  ageHint?: string;
  /** 区市町村が独立した列として存在する場合。 */
  municipality?: string;
  /** 医療機関判定の手がかりになる列(例: 「分類」)。 */
  medicalHint?: string;
  description?: string;
  /**
   * 電話以外の連絡手段(メール・フォーム・来所予約の有無等)の列(TICKET-0051)。
   * 実データ(都福祉局 XLSX リソース)側に対応する列名が確認できていないデータセットでは
   * 省略する(datasets.config.ts の作業ログ参照。実在未確認の列名を推測でマッピングしない)。
   */
  contactMethods?: string;
  /** 緯度を直接取得する列名。 */
  latColumn?: string;
  /** 経度を直接取得する列名。 */
  lngColumn?: string;
  /** 施設サブタイプを行単位で取得する列名(例: 台東区 CSV の「大分類」)。
   *  値が空の行は defaultFacilitySubtype へフォールバックする。 */
  subtypeColumn?: string;
}

export interface NormalizedFacility {
  id: string;
  datasetId: string;
  name: string;
  categoryType: FacilityCategoryType;
  municipality: string;
  /** municipality の名称に対応する全国地方公共団体コード(JISコード5桁、全国版移行 Phase 1)。
   *  municipality-codes.ts の62件対応表に一致しない場合(将来の他都道府県拡張時の未対応自治体等)
   *  は広域コード(BROAD_AREA_MUNICIPALITY_CODE)へフォールバックする。 */
  municipalityCode: string;
  address: string | null;
  phone: string | null;
  url: string | null;
  ageRange: AgeRange;
  isMedical: boolean;
  /** 対象領域外(高齢者専用施設等)除外フラグ。解決済み facilitySubtype から判定する(migration 0011)。 */
  isOutOfScope: boolean;
  description: string | null;
  /** 電話以外の連絡手段(TICKET-0051)。列のマッピングが無い、または値が空の場合は null。 */
  contactMethods: string | null;
  /** 行単位で columns.subtypeColumn から取得し、列未設定・空値時は defaultFacilitySubtype へフォールバックする。 */
  facilitySubtype: string | null;
  /** 対象ライフステージ序数の下限(migration 0016)。細分不要のデータセットでは null。 */
  lifestageMin: number | null;
  /** 対象ライフステージ序数の上限(migration 0016)。細分不要のデータセットでは null。 */
  lifestageMax: number | null;
  /** 取込元 CSV が持つ緯度。未設定または不正値の場合は null。 */
  lat: number | null;
  /** 取込元 CSV が持つ経度。未設定または不正値の場合は null。 */
  lng: number | null;
  /** 取込元の生データ(デバッグ・再取込確認用、db/schema.sql facilities.raw_json)。 */
  rawJson: string;
}

/**
 * CSV 1行分のレコードを facility レコードへ正規化する純関数。
 * 名称が空の行(見出し・注釈行の混入等)は null を返し、呼び出し側で除外する。
 */
export function normalizeCsvRow(
  row: Record<string, string>,
  columns: CsvColumnMap,
  datasetId: string,
  defaultCategoryType: FacilityCategoryType,
  fixedMunicipality?: string,
  defaultFacilitySubtype?: string,
  fixedAgeRange?: AgeRange,
  fixedLifestageRange?: LifestageRange,
  fixedContactMethods?: string,
  fixedUrl?: string,
): NormalizedFacility | null {
  const name = row[columns.name]?.trim();
  if (!name) return null;

  const address = columns.address ? row[columns.address]?.trim() || null : null;
  const phone = columns.phone ? row[columns.phone]?.trim() || null : null;
  const url = (columns.url ? row[columns.url]?.trim() || null : null) ?? fixedUrl ?? null;
  const description = columns.description ? row[columns.description]?.trim() || null : null;
  const contactMethods = (columns.contactMethods ? row[columns.contactMethods]?.trim() || null : null) ?? fixedContactMethods ?? null;
  const ageHint = columns.ageHint ? row[columns.ageHint] : undefined;
  const municipalityHint = columns.municipality ? row[columns.municipality] : undefined;
  const medicalHint = columns.medicalHint ? row[columns.medicalHint] : undefined;
  const lat = parseCoordinate(columns.latColumn ? row[columns.latColumn] : undefined);
  const lng = parseCoordinate(columns.lngColumn ? row[columns.lngColumn] : undefined);
  const rowSubtype = columns.subtypeColumn ? row[columns.subtypeColumn]?.trim() || null : null;
  const facilitySubtype = rowSubtype ?? defaultFacilitySubtype ?? null;
  const lifestageRange = resolveLifestageRange(facilitySubtype, fixedLifestageRange);
  const municipality = fixedMunicipality ?? extractMunicipality(municipalityHint, address, name);

  return {
    id: stableFacilityId(datasetId, `${name}|${address ?? ""}`),
    datasetId,
    name,
    categoryType: defaultCategoryType,
    municipality,
    municipalityCode: municipalityToCode(municipality) ?? BROAD_AREA_MUNICIPALITY_CODE,
    address,
    phone,
    url,
    ageRange: fixedAgeRange ?? inferAgeRange(ageHint, description),
    isMedical: isMedicalFacility(medicalHint, name, description),
    isOutOfScope: isOutOfScopeFacility(facilitySubtype, name, description),
    description,
    contactMethods,
    facilitySubtype,
    lifestageMin: lifestageRange.min,
    lifestageMax: lifestageRange.max,
    lat,
    lng,
    rawJson: JSON.stringify(row),
  };
}

/** CSV 座標値を数値化する。不正値は geocoding 対象に残すため null とする。 */
function parseCoordinate(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const coordinate = Number.parseFloat(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

/** CSV テキスト全体を facility レコード配列へ正規化する(見出し・空行・名称欠損行は除外)。 */
export function normalizeCsvText(
  text: string,
  columns: CsvColumnMap,
  datasetId: string,
  defaultCategoryType: FacilityCategoryType,
  fixedMunicipality?: string,
  defaultFacilitySubtype?: string,
  fixedAgeRange?: AgeRange,
  fixedLifestageRange?: LifestageRange,
  fixedContactMethods?: string,
  fixedUrl?: string,
): NormalizedFacility[] {
  return csvRowsToRecords(text)
    .map((row) => normalizeCsvRow(row, columns, datasetId, defaultCategoryType, fixedMunicipality, defaultFacilitySubtype, fixedAgeRange, fixedLifestageRange, fixedContactMethods, fixedUrl))
    .filter((facility): facility is NormalizedFacility => facility !== null);
}
