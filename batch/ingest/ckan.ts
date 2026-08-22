// 東京都オープンデータカタログ(CKAN API)クライアント(FR-031)。
//
// Web 画面(catalog.data.metro.tokyo.lg.jp の HTML)は非ブラウザ GET で 403 になるため、
// 正規ルートである CKAN Action API(`/api/3/action/package_show`)のみを使う。

import type { DatasetResourcePreference, ResourceFormat } from "./datasets.config";

// 都カタログは User-Agent が空のリクエストを 403 で拒否する(workerd の fetch は
// 既定で User-Agent を送らないため必須)。curl では 200 / UA 空では 403 を実測確認済み。
export const INGEST_USER_AGENT = "trait-compass-ingest/0.1 (+https://github.com/yunbow)";

/** User-Agent 必須の外部データ取得用 fetch ヘルパー。 */
export function fetchWithUserAgent(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(url, { headers: { "User-Agent": INGEST_USER_AGENT } });
}

export interface CkanResource {
  id: string;
  name?: string;
  /** CKAN の `format` は "CSV" / "XLSX" 等(大文字小文字は揺れることがある)。 */
  format?: string;
  url: string;
  last_modified?: string | null;
}

export interface CkanOrganization {
  title?: string;
  name?: string;
}

export interface CkanPackage {
  id: string;
  name: string;
  title: string;
  license_id?: string;
  license_title?: string;
  organization?: CkanOrganization;
  resources: CkanResource[];
}

interface CkanPackageShowResponse {
  help?: string;
  success: boolean;
  result?: CkanPackage;
  error?: { message?: string; __type?: string };
}

/** `package_show` の URL を組み立てる(純関数、ネットワークアクセスなし)。 */
export function buildPackageShowUrl(baseUrl: string, packageId: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/api/3/action/package_show?id=${encodeURIComponent(packageId)}`;
}

/**
 * CKAN `package_show` を叩き、データセットのメタ情報(リソース一覧含む)を取得する。
 * ネットワークアクセスを伴うため、Workflows の `step.do` 内から呼び出す想定
 * (リトライ・タイムアウトは呼び出し側の step 設定に委ねる)。
 */
export async function fetchCkanPackage(
  baseUrl: string,
  packageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CkanPackage> {
  const res = await fetchWithUserAgent(buildPackageShowUrl(baseUrl, packageId), fetchImpl);
  if (!res.ok) {
    throw new Error(`CKAN package_show failed: ${res.status} ${res.statusText} (package=${packageId})`);
  }
  const body = (await res.json()) as CkanPackageShowResponse;
  if (!body.success || !body.result) {
    throw new Error(
      `CKAN package_show returned an error (package=${packageId}): ${body.error?.message ?? "unknown error"}`,
    );
  }
  return body.result;
}

export interface ResourceSelection {
  /** 選定されたリソース。優先フォーマット全てが利用不可(または既知に不良)の場合は null。 */
  resource: CkanResource | null;
  /** 既知の不良フォーマット(FR-034、例: 都福祉局データセットの CSV 404)として取得を試みずスキップしたフォーマット。 */
  skippedKnownBad: ResourceFormat[];
}

/**
 * CKAN のリソース一覧から、設定された優先順位(`preferredFormats`)に従って使用する
 * リソースを選ぶ純関数(ネットワークアクセスなし、vitest でテスト可能)。
 *
 * `knownBadFormats` に含まれるフォーマットは、実在するリソースであっても取得を試みず
 * スキップする(例: 都福祉局「発達障害 支援機関・医療機関の情報」の CSV リソースは
 * 404 であることが判明済みのため、無駄なリクエストを送らず XLSX に直接フォールバックする。FR-034)。
 */
export function selectIngestResource(
  resources: readonly CkanResource[],
  preference: DatasetResourcePreference,
): ResourceSelection {
  const knownBad = new Set(preference.knownBadFormats ?? []);
  const skippedKnownBad: ResourceFormat[] = [];

  for (const format of preference.preferredFormats) {
    if (knownBad.has(format)) {
      skippedKnownBad.push(format);
      continue;
    }
    const found = resources.find((r) => normalizeResourceFormat(r.format) === format);
    if (found) {
      return { resource: found, skippedKnownBad };
    }
  }

  // 台東区「子ども家庭支援センター」のように CKAN の format が PDF と誤登録されて
  // いても、実 URL が CSV/XLSX なら取り込めるようにする。正しい format の判定を常に優先し、
  // 全優先形式で見つからなかった場合にだけ URL 拡張子へフォールバックする。
  for (const format of preference.preferredFormats) {
    if (knownBad.has(format)) continue;
    const found = resources.find((r) => normalizeResourceFormat(r.format, r.url) === format);
    if (found) {
      return { resource: found, skippedKnownBad };
    }
  }

  return { resource: null, skippedKnownBad };
}

/** CKAN リソースの `format` 文字列を本実装で扱う `ResourceFormat` に正規化する。未知の形式は null。 */
export function normalizeResourceFormat(
  format: string | undefined | null,
  resourceUrl?: string,
): ResourceFormat | null {
  const normalized = (format ?? "").trim().toUpperCase();
  if (normalized === "CSV" || normalized === "XLSX") {
    return normalized;
  }
  // CKAN メタデータの format 誤登録時のみ、実リソース URL の拡張子を補助情報として使う。
  // resourceUrl が渡されない既存呼び出しでは従来どおり format だけで判定する。
  const pathname = resourceUrl?.split(/[?#]/, 1)[0] ?? "";
  if (/\.csv$/i.test(pathname)) return "CSV";
  if (/\.xlsx$/i.test(pathname)) return "XLSX";
  return null;
}
