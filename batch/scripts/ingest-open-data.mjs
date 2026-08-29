#!/usr/bin/env node
/**
 * data/open-data/ にキャッシュした原本データを正規化し、D1 に投入する。
 *
 * ライセンスが未許可の source と集計・検索UIだけの source は datasets のメタ情報だけを
 * 記録する。投入可能な CSV は source ごとに必要な形式へ正規化してから投入する。
 */
import { spawnSync } from "node:child_process";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import YAML from "yaml";

import { idFor } from "./ingest-manual-survey.mjs";
import {
  BROAD_AREA_MUNICIPALITY_CODE,
  municipalityToCode,
  TOKYO_MUNICIPALITY_CODE_BY_NAME,
} from "./municipality-codes.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcesPath = join(projectRoot, "data", "open-data", "sources.yaml");
const wranglerPath = join(projectRoot, "node_modules", ".bin", "wrangler");
const insertChunkSize = 1_000;
export const HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH = 500;

const tokyoMunicipalities = Object.keys(TOKYO_MUNICIPALITY_CODE_BY_NAME).sort(
  (left, right) => right.length - left.length,
);

/** SQL リテラルとして安全に扱える値へ変換する。 */
function value(input) {
  if (input === undefined || input === null || input === "") return "NULL";
  if (typeof input === "number") return String(input);
  return `'${String(input).replaceAll("'", "''")}'`;
}

/** INSERT 文を組み立てる。 */
function insert(table, columns, row) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${row.map(value).join(", ")});`;
}

/** ローカル取込を許可できるライセンスかを判定する。 */
export function classifyLocalLicense(license) {
  const normalized = (license ?? "").trim().toLowerCase();
  const allowedLicenses = [
    "cc-by-4.0",
    "cc-by",
    "government-standard-terms-2.0",
    "government-standard-terms-1.0",
    "pdl-1.0",
  ];

  if (allowedLicenses.includes(normalized)) {
    return { allowed: true, riskLevel: "low" };
  }

  const unspecifiedLicenses = ["", "notspecified", "none", "no-license", "unknown"];
  return {
    allowed: false,
    riskLevel: unspecifiedLicenses.includes(normalized) ? "high" : "medium",
  };
}

/** RFC 4180 のダブルクォートを扱う最小限の CSV パーサー。 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSV のダブルクォートが閉じていません。");
  }
  if (row.length > 0 || field) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** UTF-8 を優先し、失敗した場合は Shift_JIS として CSV をデコードする。 */
export function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("shift_jis")
      .decode(buffer)
      .replace(/^\uFEFF/, "");
  }
}

/** 座標文字列を有限な数値へ変換し、指定範囲外は null にする。 */
export function parseCoordinate(text, minimum = -180, maximum = 180) {
  if (typeof text !== "string" || text.trim() === "") return null;
  const coordinate = Number(text);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

/** 候補のいずれかに一致する必須列の番号を得る。 */
export function findColumn(header, candidates) {
  const column = header.map((name) => name.trim()).findIndex((name) => candidates.includes(name));
  if (column < 0) {
    throw new Error(`必須列がありません。候補: ${candidates.join(" / ")}。実際のヘッダー: ${header.join(" | ")}`);
  }
  return column;
}

/** 候補のいずれかに一致する任意列の番号を得る。 */
function findOptionalColumn(header, candidates) {
  return header.map((name) => name.trim()).findIndex((name) => candidates.includes(name));
}

/** 住所から東京都内の区市町村を切り出す。 */
export function extractTokyoMunicipality(address, allowTokyoFallback = true) {
  const municipality = tokyoMunicipalities.find((name) => (address ?? "").includes(name));
  return municipality ?? (allowTokyoFallback ? "東京都" : null);
}

/** 区市町村名(62区市町村または'東京都')から municipality_code を得る。
 *  対応表に一致しない場合(名称なし・対応外自治体等)は広域コードへフォールバックする。 */
function toMunicipalityCode(municipality) {
  return municipalityToCode(municipality ?? "") ?? BROAD_AREA_MUNICIPALITY_CODE;
}

/** 公開データの学校種別コードを school_registry の level に変換する。 */
export function mapSchoolTypeToLevel(schoolType) {
  if (schoolType === "B1") return "elementary";
  if (schoolType === "C1") return "junior_high";
  if (["D1", "D2"].includes(schoolType)) return "high";
  if (schoolType === "E1") return "special_needs";
  return "other";
}

/** ヘッダーと行から、原本を追跡可能な JSON を作る。 */
function rawRow(header, row) {
  return Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""]));
}

/** WAM NET の障害福祉サービス CSV を東京都の施設行へ正規化する。 */
export function normalizeWamNetCsv(text, serviceName, serviceCategory, ageRange, lifestageMin, lifestageMax, datasetId, fetchedAt) {
  const [header, ...csvRows] = parseCsv(text);
  const municipalityCodeColumn = findColumn(header, ["都道府県コード又は市区町村コード"]);
  const nameColumn = findColumn(header, ["事業所の名称", "事業所名称"]);
  const municipalityAddressColumn = findOptionalColumn(header, ["事業所住所（市区町村）"]);
  const streetAddressColumn = findOptionalColumn(header, ["事業所住所（番地以降）"]);
  const phoneColumn = findOptionalColumn(header, ["事業所電話番号"]);
  const urlColumn = findOptionalColumn(header, ["事業所URL"]);
  const latColumn = findOptionalColumn(header, ["事業所緯度"]);
  const lngColumn = findOptionalColumn(header, ["事業所経度"]);

  const candidateRows = csvRows
    .filter((row) => (row[municipalityCodeColumn] ?? "").startsWith("13"))
    .map((row) => {
      const address = [
        municipalityAddressColumn < 0 ? null : row[municipalityAddressColumn],
        streetAddressColumn < 0 ? null : row[streetAddressColumn],
      ].filter(Boolean).join("") || null;
      const name = row[nameColumn].trim();
      const municipality = extractTokyoMunicipality(address);

      return {
        id: idFor(datasetId, serviceName, name, address ?? ""),
        dataset_id: datasetId,
        name,
        category_type: "福祉ガイド",
        municipality,
        municipality_code: toMunicipalityCode(municipality),
        address,
        phone: phoneColumn < 0 ? null : row[phoneColumn] || null,
        url: urlColumn < 0 ? null : row[urlColumn] || null,
        lat: latColumn < 0 ? null : parseCoordinate(row[latColumn], -90, 90),
        lng: lngColumn < 0 ? null : parseCoordinate(row[lngColumn]),
        age_range: ageRange,
        service_category: serviceCategory,
        facility_subtype: serviceCategory,
        lifestage_min: lifestageMin,
        lifestage_max: lifestageMax,
        is_medical: 0,
        description: serviceName,
        raw_json: rawRow(header, row),
        fetched_at: fetchedAt,
      };
    });

  // 原本 CSV 内の重複行(同一事業所が複数行に渡って掲載されている等)により id が
  // 衝突すると、facilities.id の PRIMARY KEY 制約に反して投入時に失敗するため、
  // 先勝ちで重複 id をスキップする。
  const seenIds = new Set();
  return candidateRows.filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });
}

/** 医療情報ネットの病院施設 CSV を東京都の施設行へ正規化する。 */
export function normalizeIryoJohoNetCsv(text, datasetId, fetchedAt) {
  const [header, ...csvRows] = parseCsv(text);
  const nameColumn = findColumn(header, ["正式名称", "施設名称", "名称", "医療機関名称"]);
  const addressColumn = findColumn(header, ["所在地", "住所", "医療機関所在地", "所在地住所"]);
  const urlColumn = findOptionalColumn(header, ["案内用ホームページアドレス"]);
  const latColumn = findOptionalColumn(header, ["所在地座標（緯度）"]);
  const lngColumn = findOptionalColumn(header, ["所在地座標（経度）"]);

  return csvRows
    .filter((row) => (row[addressColumn] ?? "").startsWith("東京都"))
    .map((row) => {
      const municipality = extractTokyoMunicipality(row[addressColumn]);
      return {
      id: idFor(datasetId, row[nameColumn], row[addressColumn]),
      dataset_id: datasetId,
      name: row[nameColumn],
      category_type: "福祉ガイド",
      municipality,
      municipality_code: toMunicipalityCode(municipality),
      address: row[addressColumn],
      url: urlColumn < 0 ? null : row[urlColumn] || null,
      lat: latColumn < 0 ? null : parseCoordinate(row[latColumn], -90, 90),
      lng: lngColumn < 0 ? null : parseCoordinate(row[lngColumn]),
      age_range: "both",
      is_medical: 1,
      description: null,
      raw_json: rawRow(header, row),
      fetched_at: fetchedAt,
      };
    });
}

/** HTML解説ページを「発達障害支援資料」の facility レコードへ正規化する。 */
export function normalizeHattatsuHtmlSections(pages, datasetId, fetchedAt) {
  return pages
    .filter((page) => page.title.trim().length > 0 && page.text.trim().length > 0)
    .map((page) => {
      const title = page.title.trim();
      const text = page.text.trim();
      const description = text.length > HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH
        ? `${text.slice(0, HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH)}…`
        : text;

      return {
        id: idFor(datasetId, page.url),
        dataset_id: datasetId,
        name: title,
        category_type: "発達障害支援資料",
        municipality: "東京都",
        municipality_code: BROAD_AREA_MUNICIPALITY_CODE,
        address: null,
        phone: null,
        url: page.url,
        age_range: "both",
        service_category: null,
        is_medical: 0,
        description,
        raw_json: JSON.stringify({ url: page.url, title, text }),
        fetched_at: fetchedAt,
      };
    });
}

/** 練馬区の教育機関一覧を school_registry の行へ正規化する。 */
export function normalizeNerimaCatalogCsv(text, sourceId, fetchedAt) {
  return normalizeSchoolCsv(
    text,
    sourceId,
    fetchedAt,
    ["教育機関_学校コード"],
    ["教育機関_名称", "教育機関_学校名"],
    ["教育機関_学校種"],
    ["教育機関_所在地", "教育機関_住所"],
  );
}

/** 文部科学省の学校コード一覧を東京都の school_registry 行へ正規化する。 */
export function normalizeMextSchoolCodeCsv(text, sourceId, fetchedAt) {
  return normalizeSchoolCsv(
    text,
    sourceId,
    fetchedAt,
    ["学校コード"],
    ["学校名", "学校の名称", "名称"],
    ["学校種", "学校種別", "学校種コード"],
    ["学校所在地", "所在地", "住所"],
    true,
    1,
  );
}

/** 共通の学校 CSV を school_registry の行へ正規化する。 */
function normalizeSchoolCsv(text, sourceId, fetchedAt, codeCandidates, nameCandidates, typeCandidates, addressCandidates, onlyTokyo = false, skipLines = 0) {
  const [header, ...csvRows] = parseCsv(text).slice(skipLines);
  const codeColumn = findColumn(header, codeCandidates);
  const nameColumn = findColumn(header, nameCandidates);
  const typeColumn = findOptionalColumn(header, typeCandidates);
  const addressColumn = findOptionalColumn(header, addressCandidates);
  const prefectureColumn = findOptionalColumn(header, ["都道府県番号", "都道府県コード", "都道府県名"]);

  return csvRows
    .filter((row) => !onlyTokyo || ["13", "東京都"].includes((row[prefectureColumn] ?? "").trim()))
    .map((row) => {
      const address = addressColumn < 0 ? null : row[addressColumn] || null;
      const schoolCode = row[codeColumn] || null;
      const name = row[nameColumn];

      return {
        id: idFor(sourceId, schoolCode ?? `${name}|${address ?? ""}`),
        source_id: sourceId,
        school_code: schoolCode,
        name,
        level: mapSchoolTypeToLevel(row[typeColumn] ?? ""),
        municipality: extractTokyoMunicipality(address, false),
        address,
        raw_json: rawRow(header, row),
        fetched_at: fetchedAt,
      };
    });
}

/** SQL 文を指定数ごとに分割し、各ファイル用にトランザクションを付ける。 */
export function splitSqlIntoChunks(sqlStatements, chunkSize = insertChunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("SQL のチャンクサイズは1以上の整数で指定してください。");
  }

  const chunks = [];
  for (let index = 0; index < sqlStatements.length; index += chunkSize) {
    const statements = sqlStatements.slice(index, index + chunkSize);
    // D1リモートは明示的な BEGIN TRANSACTION/SAVEPOINT を許可しない
    // (`state.storage.transaction()` を使うようエラーで案内される。--fileの内容は
    // wrangler d1 execute が1バッチとして送るため、明示トランザクション文は不要)。
    chunks.push(["PRAGMA foreign_keys = ON;", ...statements].join("\n"));
  }
  return chunks;
}

/** source の再投入に必要な DELETE と INSERT 文の配列を作る。 */
export function buildSqlForSource(source, rows, fetchedAt) {
  const datasetId = source.dataset_id ?? `ds-${source.id}`;
  const license = classifyLocalLicense(source.license);
  const metadataOnly = !license.allowed || source.ingest_target === "none";
  // 2026-08是正(外部コードレビュー指摘、相談タグ再取込ずれ対応): facility_tags は
  // consultation-desk-tags*.sql による手動キュレーションのみが投入経路であり、本スクリプトは
  // 一切関知しない(data-governance.md参照)。削除前にステージングテーブルへ退避し、
  // 再投入後に同じ id で復活した施設へのみ復元する(ingest-manual-survey.mjs と同じ方針)。
  // D1 は CREATE TEMP TABLE を許可しない(実機確認済み、SQLITE_AUTH)ため、通常の
  // CREATE TABLE ... AS SELECT + 末尾 DROP TABLE を使う(自己修復のため冒頭に
  // DROP TABLE IF EXISTS も置く)。
  const statements = [
    `DROP TABLE IF EXISTS _facility_tags_backup;`,
    `CREATE TABLE _facility_tags_backup AS SELECT facility_id, tag FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = ${value(datasetId)});`,
    `DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = ${value(datasetId)});`,
    `DELETE FROM facilities WHERE dataset_id = ${value(datasetId)};`,
  ];

  if (source.ingest_target === "school_registry") {
    statements.push(`DELETE FROM school_registry WHERE source_id = ${value(source.id)};`);
  }

  statements.push(
    `DELETE FROM datasets WHERE id = ${value(datasetId)};`,
    insert("datasets", [
      "id", "ckan_package_id", "title", "source_org", "license", "risk_level",
      "source_url", "fetched_at", "freshness_note", "is_alive", "frozen",
    ], [
      datasetId,
      source.ckan_package_id,
      source.title,
      source.sourceOrg,
      source.license,
      license.riskLevel,
      source.url,
      fetchedAt,
      metadataOnly ? "license-hold またはメタ情報のみ記録" : null,
      1,
      0,
    ]),
  );

  if (!metadataOnly && source.ingest_target === "facilities") {
    for (const row of rows) {
      statements.push(insert("facilities", [
        "id", "dataset_id", "name", "category_type", "municipality", "municipality_code", "address",
        "phone", "url", "lat", "lng", "age_range", "service_category", "facility_subtype", "lifestage_min", "lifestage_max", "is_medical", "description", "raw_json",
      ], [
        row.id, row.dataset_id, row.name, row.category_type, row.municipality, row.municipality_code ?? toMunicipalityCode(row.municipality), row.address,
        row.phone, row.url, row.lat, row.lng, row.age_range, row.service_category, row.facility_subtype, row.lifestage_min ?? null, row.lifestage_max ?? null, row.is_medical, row.description,
        typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json),
      ]));
    }
  }

  if (!metadataOnly && source.ingest_target === "school_registry") {
    for (const row of rows) {
      statements.push(insert("school_registry", [
        "id", "source_id", "school_code", "name", "level", "municipality", "address",
        "raw_json", "fetched_at",
      ], [
        row.id, row.source_id, row.school_code, row.name, row.level, row.municipality,
        row.address, JSON.stringify(row.raw_json), row.fetched_at,
      ]));
    }
  }

  // facility_tags の復元(上記の退避と対応): 削除前と同じ id で再投入された施設のみ対象
  // (WHERE で facilities に現存する id に絞る)。id が変わった・施設自体が投入対象外になった
  // (metadataOnly・license-hold等)分の退避行は復元されずそのまま破棄される(意図的)。
  statements.push(
    `INSERT INTO facility_tags (facility_id, tag) SELECT facility_id, tag FROM _facility_tags_backup WHERE facility_id IN (SELECT id FROM facilities);`,
    `DROP TABLE _facility_tags_backup;`,
  );

  return statements;
}

/** fetch-meta.json を読み、未取得の場合は実行順を案内する。 */
async function readFetchMeta(sourceId) {
  const metaPath = join(projectRoot, "data", "open-data", sourceId, "fetch-meta.json");

  try {
    return JSON.parse(await readFile(metaPath, "utf8"));
  } catch {
    throw new Error(`${sourceId}: fetch-meta.json がありません。先に fetch-open-data.mjs を実行してください。`);
  }
}

/** 指定ディレクトリ直下の CSV を1件だけ特定する。 */
async function findOnlyCsvFile(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error(`${directory} がありません。先に fetch-open-data.mjs を実行してください。`);
  }

  const csvFiles = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".csv")
    .map((entry) => join(directory, entry.name));
  if (csvFiles.length !== 1) {
    throw new Error(`${directory} の CSV は1件である必要があります（${csvFiles.length}件）。先に fetch-open-data.mjs を実行してください。`);
  }
  return csvFiles[0];
}

/** キャッシュした CSV を読み、source ごとの正規化関数を実行する。 */
async function loadNormalizedRows(source, fetchedAt) {
  const sourceDirectory = join(projectRoot, "data", "open-data", source.id);
  const datasetId = source.dataset_id ?? `ds-${source.id}`;

  if (source.id === "wam-net-disability-services") {
    const wamNetServices = [
      // 児童発達支援 = 未就学児(0〜6)向けの療育 → [0,0]
      { fileId: "63", serviceName: "児童発達支援", serviceCategory: "児童発達支援", ageRange: "child", lifestageMin: 0, lifestageMax: 0 },
      // 放課後等デイサービス = 就学児(小・中・高)→ [1,2]
      { fileId: "65", serviceName: "放課後等デイサービス", serviceCategory: "放課後等デイサービス", ageRange: "child", lifestageMin: 1, lifestageMax: 2 },
      // 以下は age_range の粗い区分内で全区分にまたがるため細分しない(null = 従来どおり)
      { fileId: "67", serviceName: "保育所等訪問支援", serviceCategory: "保育所等訪問支援", ageRange: "child", lifestageMin: null, lifestageMax: null },
      { fileId: "66", serviceName: "居宅訪問型児童発達支援", serviceCategory: "居宅訪問型児童発達支援", ageRange: "child", lifestageMin: null, lifestageMax: null },
      { fileId: "70", serviceName: "障害児相談支援", serviceCategory: "障害児相談支援", ageRange: "child", lifestageMin: null, lifestageMax: null },
      { fileId: "41", serviceName: "自立訓練(機能訓練)", serviceCategory: "自立訓練", ageRange: "adult", lifestageMin: null, lifestageMax: null },
      { fileId: "42", serviceName: "自立訓練(生活訓練)", serviceCategory: "自立訓練", ageRange: "adult", lifestageMin: null, lifestageMax: null },
      { fileId: "60", serviceName: "就労移行支援", serviceCategory: "就労移行支援", ageRange: "adult", lifestageMin: null, lifestageMax: null },
      { fileId: "62", serviceName: "就労定着支援", serviceCategory: "就労定着支援", ageRange: "adult", lifestageMin: null, lifestageMax: null },
    ];
    const rowsByService = await Promise.all(wamNetServices.map(async ({ fileId, serviceName, serviceCategory, ageRange, lifestageMin, lifestageMax }) => {
      const directory = join(sourceDirectory, "extracted", `sfkopendata_202603_${fileId}`);
      const filePath = await findOnlyCsvFile(directory);
      const text = decodeCsvBuffer(await readFile(filePath));
      return normalizeWamNetCsv(text, serviceName, serviceCategory, ageRange, lifestageMin, lifestageMax, datasetId, fetchedAt);
    }));
    return rowsByService.flat();
  }

  if (source.id === "iryo-joho-net") {
    const directory = join(sourceDirectory, "extracted", "01-1_hospital_facility_info_20251201");
    const filePath = await findOnlyCsvFile(directory);
    const text = decodeCsvBuffer(await readFile(filePath));
    return normalizeIryoJohoNetCsv(text, datasetId, fetchedAt);
  }

  if (source.id === "tokyo-education-institutions-catalog") {
    const filePath = join(sourceDirectory, "131202_educational_institution.csv");
    const text = await readCachedCsv(filePath);
    return normalizeNerimaCatalogCsv(text, source.id, fetchedAt);
  }

  if (source.id === "mext-school-code-list") {
    const filePath = join(sourceDirectory, "mext-school-code-east.csv");
    const text = await readCachedCsv(filePath);
    return normalizeMextSchoolCodeCsv(text, source.id, fetchedAt);
  }

  if (source.id === "hattatsu-shien-center") {
    const pages = await Promise.all((source.files ?? []).map(async (file) => {
      const filePath = join(sourceDirectory, file.filename);
      const html = await readCachedHtml(filePath);
      const document = new JSDOM(html).window.document;
      return {
        url: file.url,
        title: document.querySelector("div.pageHeader_ttl > h1")?.textContent ?? "",
        text: document.querySelector("div#primary article")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    }));
    return normalizeHattatsuHtmlSections(pages, datasetId, fetchedAt);
  }

  // 集計データ、利用許諾保留、HTML検索UIは datasets のメタ情報だけを投入する。
  return [];
}

/** 直接保存した CSV を読み、未取得なら実行順を案内する。 */
async function readCachedCsv(filePath) {
  try {
    return decodeCsvBuffer(await readFile(filePath));
  } catch {
    throw new Error(`${filePath} がありません。先に fetch-open-data.mjs を実行してください。`);
  }
}

/** キャッシュした HTML を読み、未取得なら実行順を案内する。 */
async function readCachedHtml(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new Error(`${filePath} がありません。先に fetch-open-data.mjs を実行してください。`);
  }
}

/** 一時 SQL ファイルを D1 に順次適用する。 */
async function executeSqlChunks(sqlChunks, target) {
  const temporaryFiles = [];

  try {
    for (const [index, sql] of sqlChunks.entries()) {
      const temporaryFile = join(
        tmpdir(),
        `trait-compass-open-data-${process.pid}-${Date.now()}-${index}.sql`,
      );
      temporaryFiles.push(temporaryFile);
      await writeFile(temporaryFile, sql, "utf8");

      const result = spawnSync(wranglerPath, [
        "d1", "execute", "trait-compass", target, `--file=${temporaryFile}`,
      ], { stdio: "inherit" });
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        return;
      }
    }
  } finally {
    await Promise.all(temporaryFiles.map((file) => unlink(file).catch(() => {})));
  }
}

async function main() {
  const [requestedSourceId, ...flags] = process.argv.slice(2);
  const validFlags = ["--local", "--remote"];
  const invalidArguments = !requestedSourceId
    || (!requestedSourceId.startsWith("--") && requestedSourceId !== "--all" && flags.length > 2)
    || (requestedSourceId.startsWith("--") && requestedSourceId !== "--all")
    || flags.some((flag) => !validFlags.includes(flag))
    || (flags.includes("--local") && flags.includes("--remote"));
  if (invalidArguments) {
    throw new Error("使い方: node scripts/data/ingest-open-data.mjs <source-id>|--all [--local|--remote]");
  }

  const sources = YAML.parse(await readFile(sourcesPath, "utf8"));
  const selectedSources = requestedSourceId === "--all"
    ? sources.filter((source) => !source.already_wired_in_ingest_worker)
    : sources.filter((source) => source.id === requestedSourceId);
  if (selectedSources.length === 0) {
    throw new Error(`sources.yaml に存在しない source-id: ${requestedSourceId}`);
  }

  const target = flags.includes("--remote") ? "--remote" : "--local";
  let hasSourceFailure = false;
  for (const source of selectedSources) {
    try {
      const meta = await readFetchMeta(source.id);
      const rows = await loadNormalizedRows(source, meta.fetchedAt);
      const sqlStatements = buildSqlForSource(source, rows, meta.fetchedAt);
      const sqlChunks = splitSqlIntoChunks(sqlStatements, insertChunkSize);

      if (!classifyLocalLicense(source.license).allowed || source.ingest_target === "none") {
        console.log(`license-hold(またはメタのみ): ${source.id}`);
      }
      await executeSqlChunks(sqlChunks, target);
    } catch (error) {
      hasSourceFailure = true;
      console.error(`${source.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (hasSourceFailure) {
    process.exitCode = 1;
  }
}

// テストから import した際に CLI 実行の副作用を起こさないよう、直接実行時だけ起動する。
const isDirectlyExecuted = process.argv[1]
  && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
