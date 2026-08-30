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

import { captureFacilityIdsBeforeApply, buildRemoteEmbedGuidance, finishLocalEmbedRefresh } from "./lib/embed-refresh.mjs";
import { idFor } from "./ingest-manual-survey.mjs";
import {
  BROAD_AREA_MUNICIPALITY_CODE,
  municipalityToCode,
  TOKYO_MUNICIPALITY_CODE_BY_NAME,
} from "./municipality-codes.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcesPath = join(projectRoot, "data", "open-data", "sources.yaml");
const wranglerPath = join(projectRoot, "node_modules", ".bin", "wrangler");
// `wrangler d1 execute <database-name>` は cwd から wrangler.toml/wrangler.jsonc を探索するが、
// batch/ にはそれらが無い(wrangler.ingest.toml のみ)ため既定探索では見つからない(batch/ から
// 素の `wrangler d1 execute trait-compass --local` を叩くと "Couldn't find a D1 DB with the
// name or binding 'trait-compass'" で失敗することを実機確認済み)。report-review.mjs /
// ingest-manual-survey.mjs と同じく database_name="trait-compass" を宣言している
// wrangler.ingest.toml を明示的に指定する。
const wranglerConfigPath = join(projectRoot, "batch", "wrangler.ingest.toml");
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

/** facility 1行分の UPSERT(ON CONFLICT DO UPDATE)文を組み立てる。 */
function insertFacilityUpsert(row) {
  const columns = [
    "id", "dataset_id", "name", "category_type", "municipality", "municipality_code", "address",
    "phone", "url", "lat", "lng", "age_range", "service_category", "facility_subtype", "lifestage_min", "lifestage_max", "is_medical", "description", "raw_json",
  ];
  const values = [
    row.id, row.dataset_id, row.name, row.category_type, row.municipality, row.municipality_code ?? toMunicipalityCode(row.municipality), row.address,
    row.phone, row.url, row.lat, row.lng, row.age_range, row.service_category, row.facility_subtype, row.lifestage_min ?? null, row.lifestage_max ?? null, row.is_medical, row.description,
    typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json),
  ];
  const updateClauses = columns
    .filter((column) => column !== "id")
    .map((column) => {
      // 緯度経度は db.ts の upsertFacilities(TICKET-0011作業ログ)と同じ理由で COALESCE する:
      // 座標列を持たない source の再取込や、本番CKAN取込Workerのジオコーディングステップ
      // (FR-02A、dataset_id を問わず address はあるが lat 未設定の facilities 全件が対象)が
      // 後から設定した lat/lng を、このスクリプトの再実行(通常 lat/lng は NULL)で
      // 上書き消去しないようにするため。
      if (column === "lat") return "lat = COALESCE(excluded.lat, lat)";
      if (column === "lng") return "lng = COALESCE(excluded.lng, lng)";
      return `${column} = excluded.${column}`;
    });
  updateClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");

  return `INSERT INTO facilities (${columns.join(", ")}) VALUES (${values.map(value).join(", ")}) ON CONFLICT(id) DO UPDATE SET ${updateClauses.join(", ")};`;
}

/**
 * source の再投入に必要な SQL 文の配列を作る。
 *
 * 2026-08是正(外部コードレビュー指摘 項目4): facilities 本体は従来「DELETE FROM facilities
 * WHERE dataset_id=X」→「N件INSERT」構成だった。このデータセットのSQLは1,000文単位で
 * チャンク分割され、チャンクごとに別々の wrangler d1 execute 呼び出し(それぞれ独立した
 * トランザクション)として実行されうる(executeSqlChunks参照)ため、後半チャンクの失敗で
 * 「既存データは消えたが新データは一部しか入っていない」部分投入状態になり得た
 * (facility_tags 側は migration 0035 で対応済みだったが facilities 本体は未対応だった)。
 *
 * facilities.id は idFor() による内容ハッシュのため、内容が変わらなければ再取込でも同じ id に
 * なる決定性を利用し、「UPSERT(ON CONFLICT DO UPDATE)+ 事後差分クリーンアップ」方式に変更する。
 * 1. 各行を UPSERT する(冪等。チャンク境界で中断しても、再実行するだけで同じ内容が
 *    再度書き込まれるだけであり、何度re-runしても収束する)。
 * 2. 「配信元で削除され今回のバッチに含まれなくなった facility」の削除(後始末)は、UPSERTとは
 *    別の独立したステップ(`buildOrphanCleanupSql`、main() 参照)で、このsourceの全チャンクが
 *    成功した場合にのみ実行する。今回のバッチの facility id 一覧は `open_data_batch_ids`
 *    (永続マーカーテーブル、migration 0037)へ実際のUPSERTより先に(このSQLの冒頭で)
 *    マーキングする。UPSERT自体がチャンク境界で中断しても、マーキングは既に完了しており、
 *    後始末は「全チャンク成功後の独立した最終ステップ」としてのみ実行されるため、
 *    UPSERTが中断された場合に後始末が誤って実行されることはない
 *    (再実行時は冒頭の DELETE で前回の残骸をクリアしてからマーキングし直す)。
 * 3. metadataOnly(ライセンス未許可等)の場合はマーキングを一切行わない。これにより、
 *    後始末ステップは「今回のバッチに含まれるfacility=0件」として、この dataset_id に
 *    紐づく既存の facilities を全件削除する(ライセンス状態が許可→不許可に変わった場合に
 *    表示を止める、という従来の DELETE ALL 相当の挙動を保つ)。
 *
 * facility_tags については、UPSERT方式では内容不変(=idが変わらない)facilityのタグは
 * 一切触れられないため、旧方式(facility_tags_backup への退避・復元、migration 0035)は
 * このsource向けには不要になった。実際に削除される(=配信元で消えた)facilityのタグは、
 * db.ts の deleteStaleFacilities と同じく退避せずそのまま削除する(復元する意味の対応関係が
 * 無くなった以上、退避を続ける理由がない。facility_tags_backup テーブル自体の要否は
 * 別途の判断・報告を参照)。
 */
export function buildSqlForSource(source, rows, fetchedAt) {
  const datasetId = source.dataset_id ?? `ds-${source.id}`;
  const license = classifyLocalLicense(source.license);
  const metadataOnly = !license.allowed || source.ingest_target === "none";
  const includeFacilities = !metadataOnly && source.ingest_target === "facilities";

  const statements = [];

  if (source.ingest_target === "facilities") {
    // 前回実行の残骸(中断・ライセンス状態変更等)を除去してから、今回のバッチを先に
    // マーキングする(実際のUPSERTより前に行うことの理由は関数コメント参照)。
    statements.push(`DELETE FROM open_data_batch_ids WHERE dataset_id = ${value(datasetId)};`);
    if (includeFacilities) {
      for (const row of rows) {
        statements.push(`INSERT OR IGNORE INTO open_data_batch_ids (dataset_id, facility_id) VALUES (${value(datasetId)}, ${value(row.id)});`);
      }
    }
  }

  if (source.ingest_target === "school_registry") {
    statements.push(`DELETE FROM school_registry WHERE source_id = ${value(source.id)};`);
  }

  // 2026-08是正(外部コードレビュー指摘 項目4の実機検証で判明): facilities.dataset_id は
  // `REFERENCES datasets(id)` の外部キー制約を持つ。facilities 本体を UPSERT 方式に変更した
  // ことで、この dataset_id を参照する facilities 行が(2回目以降の実行では)常に既に存在する
  // ようになったため、旧来の「DELETE FROM datasets → 再INSERT」パターンのまま残すと、
  // 削除文の実行時点で PRAGMA foreign_keys = ON により
  // `FOREIGN KEY constraint failed` で失敗する(実機のローカルD1で再現・確認済み)。
  // db.ts の upsertDataset と同じ ON CONFLICT DO UPDATE 方式に変更し、datasets 行を
  // 一度も削除しないようにする。
  const datasetColumns = ["id", "ckan_package_id", "title", "source_org", "license", "risk_level", "source_url", "fetched_at", "freshness_note", "is_alive", "frozen"];
  const datasetValues = [
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
  ];
  const datasetUpdateClauses = datasetColumns.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
  datasetUpdateClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  statements.push(
    `INSERT INTO datasets (${datasetColumns.join(", ")}) VALUES (${datasetValues.map(value).join(", ")}) ON CONFLICT(id) DO UPDATE SET ${datasetUpdateClauses.join(", ")};`,
  );

  if (includeFacilities) {
    for (const row of rows) {
      statements.push(insertFacilityUpsert(row));
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

  return statements;
}

/**
 * このsourceの全UPSERTチャンクが成功した後にのみ実行する、facilities の後始末
 * (配信元で削除され今回のバッチ(`open_data_batch_ids`)に含まれなくなった facility の削除)
 * SQLを組み立てる(外部コードレビュー指摘 項目4)。
 *
 * 単一の文字列(1回の wrangler d1 execute --file 呼び出し = 1トランザクション)として返す。
 * 複数チャンクに分割すると、途中で中断した場合に
 * 「pending_vector_deletionsだけ記録されてfacilities/facility_tagsの削除が伴わない」
 * (=まだ存在するfacilityのベクトルを次回誤ってVectorizeから削除してしまう)逆方向の不整合が
 * 起こり得るため、原子性を保つために意図的に1回の実行にまとめる。
 *
 * 削除対象は「dataset_id が一致し、かつ open_data_batch_ids に today's batch として
 * マーキングされていない facility」。削除前に pending_vector_deletions(outbox、migration
 * 0036)へ記録し(Vectorize削除同期、外部コードレビュー指摘 項目1)、facility_tags →
 * facilities の順で削除した後、当該 dataset_id のマーカーをクリアして次回実行に備える。
 */
export function buildOrphanCleanupSql(datasetId) {
  const notInBatch = `id NOT IN (SELECT facility_id FROM open_data_batch_ids WHERE dataset_id = ${value(datasetId)})`;
  return [
    "PRAGMA foreign_keys = ON;",
    `INSERT OR IGNORE INTO pending_vector_deletions (facility_id, deleted_at) SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM facilities WHERE dataset_id = ${value(datasetId)} AND ${notInBatch};`,
    `DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = ${value(datasetId)} AND ${notInBatch});`,
    `DELETE FROM facilities WHERE dataset_id = ${value(datasetId)} AND ${notInBatch};`,
    `DELETE FROM open_data_batch_ids WHERE dataset_id = ${value(datasetId)};`,
  ].join("\n");
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

/**
 * 一時 SQL ファイルを D1 に順次適用する。
 *
 * 戻り値は全チャンクが成功したかどうかの真偽値(2026-08是正: 従来は `process.exitCode` の
 * 設定のみで呼び出し元に成否を伝えていたが、`process.exitCode` はプロセス全体で一度設定される
 * と次に明示的に上書きされるまで残り続けるため、複数 source をループ処理する main() で
 * 「直前の source が失敗した」ことと「今回の source 自体が失敗した」ことを区別できなかった。
 * facilities の後始末(`buildOrphanCleanupSql`)を「このsourceのUPSERTが実際に成功した場合に
 * 限り実行する」ためには source ごとの正確な成否が必要なため、戻り値で明示的に返す)。
 * `process.exitCode` の設定自体は既存の呼び出し元(main() 末尾の hasSourceFailure 判定)との
 * 互換のため維持する。
 */
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
        "d1", "execute", "trait-compass", target, "-c", wranglerConfigPath, `--file=${temporaryFile}`,
      ], { stdio: "inherit" });
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        return false;
      }
    }
    return true;
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
  // 埋め込みリフレッシュ(--localのみ)用に、対象データセット全件のIDをSQL適用前に確定しておく
  // (facilities本体はUPSERT方式(2026-08是正、外部コードレビュー指摘 項目4)だが、ローカル
  // Qdrant向けの削除同期(embed-refresh.mjs)は依然として事前/事後のfacility_id差分で
  // 判定するため、ループ開始前に一括取得する)。
  const datasetIds = selectedSources.map((source) => source.dataset_id ?? `ds-${source.id}`);
  const beforeFacilityIds = target === "--local" ? captureFacilityIdsBeforeApply({ datasetIds }) : [];

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
      const upsertSucceeded = await executeSqlChunks(sqlChunks, target);
      if (!upsertSucceeded) {
        hasSourceFailure = true;
        continue;
      }

      // 2026-08是正(外部コードレビュー指摘 項目4): facilities の後始末(配信元で削除された
      // facilityのクリーンアップ、buildOrphanCleanupSql)は、このsourceの全UPSERTチャンクが
      // 成功した場合にのみ実行する。単一ファイルとして実行する(executeSqlChunksへ長さ1の
      // 配列を渡す)ことで、後始末自体の原子性も担保する。
      if (source.ingest_target === "facilities") {
        const datasetId = source.dataset_id ?? `ds-${source.id}`;
        const cleanupSucceeded = await executeSqlChunks([buildOrphanCleanupSql(datasetId)], target);
        if (!cleanupSucceeded) hasSourceFailure = true;
      }
    } catch (error) {
      hasSourceFailure = true;
      console.error(`${source.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (hasSourceFailure) {
    process.exitCode = 1;
    return;
  }

  // 埋め込みリフレッシュは全 source の SQL 適用が成功した場合のみ行う(埋め込み自体の失敗で
  // このスクリプトの exit code を汚さないよう、finishLocalEmbedRefresh 内部で例外を握りつぶす)。
  if (target === "--local") {
    await finishLocalEmbedRefresh({ datasetIds, beforeIds: beforeFacilityIds });
  } else {
    console.log(buildRemoteEmbedGuidance());
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
