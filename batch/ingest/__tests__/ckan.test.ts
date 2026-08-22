import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildPackageShowUrl,
  fetchCkanPackage,
  normalizeResourceFormat,
  selectIngestResource,
  type CkanResource,
} from "../ckan";
import type { DatasetResourcePreference } from "../datasets.config";

const CKAN_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "ckan-package-show.json"), "utf-8"),
);

describe("buildPackageShowUrl", () => {
  it("package_show の URL を組み立てる", () => {
    expect(buildPackageShowUrl("https://catalog.data.metro.tokyo.lg.jp", "t000054d0000000058")).toBe(
      "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show?id=t000054d0000000058",
    );
  });

  it("ベース URL 末尾のスラッシュを許容する", () => {
    expect(buildPackageShowUrl("https://example.org/", "abc")).toBe(
      "https://example.org/api/3/action/package_show?id=abc",
    );
  });

  it("パッケージ ID を URL エンコードする", () => {
    expect(buildPackageShowUrl("https://example.org", "a b/c")).toBe(
      "https://example.org/api/3/action/package_show?id=a%20b%2Fc",
    );
  });
});

describe("normalizeResourceFormat", () => {
  it("大文字小文字・前後空白を無視して CSV/XLSX を判定する", () => {
    expect(normalizeResourceFormat("csv")).toBe("CSV");
    expect(normalizeResourceFormat(" XLSX ")).toBe("XLSX");
  });

  it("未対応の形式は null を返す", () => {
    expect(normalizeResourceFormat("PDF")).toBeNull();
    expect(normalizeResourceFormat(undefined)).toBeNull();
    expect(normalizeResourceFormat(null)).toBeNull();
  });
});

describe("selectIngestResource", () => {
  const resources: CkanResource[] = CKAN_FIXTURE.result.resources;

  it("preferredFormats の先頭から順に見つかったリソースを選ぶ", () => {
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV", "XLSX"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource?.format).toBe("CSV");
    expect(selection.skippedKnownBad).toEqual([]);
  });

  it("FR-034: knownBadFormats に指定した形式は実在しても取得を試みずスキップし、次候補にフォールバックする", () => {
    // 都福祉局「発達障害 支援機関・医療機関の情報」: CSV は 404 のため既知不良として扱う。
    const pref: DatasetResourcePreference = { preferredFormats: ["XLSX", "CSV"], knownBadFormats: ["CSV"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource?.format).toBe("XLSX");
    expect(selection.resource?.id).toBe("res-xlsx-0001");
    expect(selection.skippedKnownBad).toEqual([]);
  });

  it("優先フォーマットの中に既知不良フォーマットしかなく他候補も無い場合、既知不良として記録しつつ resource は null になる", () => {
    const csvOnly: CkanResource[] = [resources[0]];
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV"], knownBadFormats: ["CSV"] };
    const selection = selectIngestResource(csvOnly, pref);
    expect(selection.resource).toBeNull();
    expect(selection.skippedKnownBad).toEqual(["CSV"]);
  });

  it("該当する形式のリソースが1つも無い場合は resource: null を返す", () => {
    const pref: DatasetResourcePreference = { preferredFormats: ["XLSX"] };
    const selection = selectIngestResource([], pref);
    expect(selection.resource).toBeNull();
    expect(selection.skippedKnownBad).toEqual([]);
  });
});

describe("fetchCkanPackage", () => {
  it("成功レスポンスを CkanPackage として返す(fetch はモック、ネットワーク不要)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(CKAN_FIXTURE), { status: 200 }),
    );
    const pkg = await fetchCkanPackage(
      "https://catalog.data.metro.tokyo.lg.jp",
      "t000054d0000000058",
      fetchMock as unknown as typeof fetch,
    );
    expect(pkg.id).toBe("t000054d0000000058");
    expect(pkg.license_id).toBe("cc-by-4.0");
    expect(pkg.resources).toHaveLength(2);
    // 都カタログは UA 空リクエストを 403 で拒否するため、User-Agent 付与が必須(実測確認済み)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show?id=t000054d0000000058",
      { headers: { "User-Agent": expect.stringContaining("trait-compass-ingest") } },
    );
  });

  it("HTTP エラー時は例外を投げる", async () => {
    const fetchMock = vi.fn(async () => new Response("Not Found", { status: 404 }));
    await expect(
      fetchCkanPackage("https://example.org", "missing-package", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/404/);
  });

  it("success: false のレスポンスは例外を投げる", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, error: { message: "Not found" } }), { status: 200 }),
    );
    await expect(
      fetchCkanPackage("https://example.org", "missing-package", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/Not found/);
  });
});

// ============================================================
// URL拡張子フォールバック(台東区「子ども家庭支援センター」の CKAN format 誤登録対応、TICKET-0011作業ログ 7564a94)
// ============================================================

describe("normalizeResourceFormat (URL拡張子フォールバック)", () => {
  it("format が不明でも URL が .csv で終わる場合は CSV と判定する", () => {
    expect(normalizeResourceFormat("PDF", "https://www.city.taito.lg.jp/opendata/sisetu_05.csv")).toBe("CSV");
    expect(normalizeResourceFormat(undefined, "https://example.org/data.csv")).toBe("CSV");
  });

  it("format が不明でも URL が .xlsx で終わる場合は XLSX と判定する", () => {
    expect(normalizeResourceFormat("PDF", "https://example.org/data.xlsx")).toBe("XLSX");
  });

  it("format が不明で URL も .csv/.xlsx 以外の場合は null を返す", () => {
    expect(normalizeResourceFormat("PDF", "https://example.org/data.pdf")).toBeNull();
    expect(normalizeResourceFormat(undefined, "https://example.org/page.html")).toBeNull();
  });

  it("クエリ文字列・フラグメントが付与された URL でも拡張子を正しく判定する", () => {
    expect(normalizeResourceFormat("PDF", "https://example.org/data.csv?download=1")).toBe("CSV");
    expect(normalizeResourceFormat("PDF", "https://example.org/data.xlsx#sheet1")).toBe("XLSX");
  });

  it("format が正式に CSV/XLSX と一致する場合は resourceUrl を見ずにそのまま判定する(既存回帰確認)", () => {
    expect(normalizeResourceFormat("CSV", "https://example.org/data.xlsx")).toBe("CSV");
  });

  it("resourceUrl を渡さない既存呼び出しでは従来どおり format のみで判定する(回帰確認)", () => {
    expect(normalizeResourceFormat("PDF")).toBeNull();
  });
});

describe("selectIngestResource (正式format優先・URL拡張子フォールバックの併用)", () => {
  it("正式な format 一致が見つかる場合、URL拡張子フォールバックより優先する", () => {
    // CSV(正式一致)と、format誤登録だが .xlsx な PDF リソースが両方存在する場合、
    // 優先フォーマット順(CSV→XLSX)どおり正式一致の CSV を選ぶ。
    const resources: CkanResource[] = [
      { id: "res-pdf-but-xlsx", format: "PDF", url: "https://example.org/data.xlsx" },
      { id: "res-csv", format: "CSV", url: "https://example.org/data.csv" },
    ];
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV", "XLSX"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource?.id).toBe("res-csv");
  });

  it("台東区「子ども家庭支援センター」相当: format が PDF 誤登録でも実体 URL が .csv ならフォールバックで選ぶ", () => {
    const resources: CkanResource[] = [
      { id: "res-mislabeled", format: "PDF", url: "https://www.city.taito.lg.jp/opendata/sisetu_05.csv" },
    ];
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource?.id).toBe("res-mislabeled");
  });

  it("正式一致・URL拡張子フォールバックのいずれにも合致しない場合は resource: null を返す", () => {
    const resources: CkanResource[] = [{ id: "res-pdf", format: "PDF", url: "https://example.org/data.pdf" }];
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV", "XLSX"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource).toBeNull();
  });

  it("URL拡張子フォールバックは全優先形式で正式一致が1件も無い場合にのみ使う(1周目を全て試してから2周目に入る)", () => {
    // preferredFormats=[CSV, XLSX]。正式一致は無いが、XLSX 側のみ URL 拡張子フォールバックで一致する。
    // CSV 側にフォールバック候補が無くても、XLSX 側のフォールバックまで到達できることを確認する。
    const resources: CkanResource[] = [{ id: "res-mislabeled-xlsx", format: "PDF", url: "https://example.org/data.xlsx" }];
    const pref: DatasetResourcePreference = { preferredFormats: ["CSV", "XLSX"] };
    const selection = selectIngestResource(resources, pref);
    expect(selection.resource?.id).toBe("res-mislabeled-xlsx");
  });
});
