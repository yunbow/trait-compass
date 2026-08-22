// enrich-school-addresses.mjs の純関数部分のテスト。
// main() は直接実行時だけ起動するため、CSV や YAML を書き換えずに import できる。
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { decodeCsvBuffer, parseCsv } from "../ingest-open-data.mjs";
import {
  MEXT_SOURCE,
  applyAddressEdits,
  buildMextAddressIndex,
  matchSchool,
  normalizeSchoolName,
} from "../enrich-school-addresses.mjs";

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("文科省学校コード CSV", () => {
  it("Shift_JIS の引用・改行を含むヘッダーを読み、B1/C1 のみ索引化する", async () => {
    const buffer = await readFile(join(fixturesDirectory, "mext-school-code-sample.csv"));
    const rows = parseCsv(decodeCsvBuffer(buffer));
    const index = buildMextAddressIndex(rows);
    expect(rows[0][0]).toBe("学校コード\n(確認用)");
    expect(index.get("台東区立上野小学校")).toEqual([{ address: "東京都台東区東上野3-19-4", level: "elementary" }]);
    expect(index.has("対象外学校")).toBe(false);
  });
});

describe("学校名照合", () => {
  const index = buildMextAddressIndex([
    ["header"],
    ["", "B1(小学校)", "", "", "", "台東区立上野小学校", "東京都台東区東上野3-19-4"],
    ["", "C1(中学校)", "", "", "", "台東区立上野中学校", "東京都台東区上野7-1-1"],
    ["", "B1(小学校)", "", "", "", "台東区立金曾木小学校", "東京都台東区根岸4-16-22"],
  ]);

  it("完全一致・異体字一致だけを許可する", () => {
    expect(normalizeSchoolName("金曾木小学校")).toBe("金曽木小学校");
    expect(matchSchool(index, "台東区", { name: "上野小学校" }, "elementary")?.address).toBe("東京都台東区東上野3-19-4");
    expect(matchSchool(index, "台東区", { name: "金曽木小学校" }, "elementary")?.address).toBe("東京都台東区根岸4-16-22");
  });

  it("校種違いと未一致を拒否する", () => {
    expect(matchSchool(index, "台東区", { name: "上野中学校" }, "elementary")).toBeNull();
    expect(matchSchool(index, "台東区", { name: "存在しない小学校" }, "elementary")).toBeNull();
  });
});

describe("applyAddressEdits", () => {
  const yaml = `# 手作業のコメント\nmunicipalityName: 台東区\nelementarySchools:\n  - name: 上野小学校\n    level: elementary\n    areaHint: 東上野\n    sources:\n      - label: 既存出典\n        url: https://example.test\n        confirmedOn: "2026-07-01"\n  - name: 住所済み小学校\n    level: elementary\n    address: 東京都台東区1-1\njuniorHighSchools:\n  - name: 上野中学校\n    level: junior_high\n    areaHint: 上野\n`;

  it("既存書式を保ち、住所と sources を必要な学校だけへ追加する", () => {
    const result = applyAddressEdits(yaml, [
      { name: "上野小学校", level: "elementary", address: "東京都台東区東上野3-19-4", source: MEXT_SOURCE },
      { name: "住所済み小学校", level: "elementary", address: "変更しない", source: MEXT_SOURCE },
      { name: "上野中学校", level: "junior_high", address: "東京都台東区上野7-1-1", source: MEXT_SOURCE },
    ]);
    expect(result).toContain("    areaHint: 東上野\n    address: 東京都台東区東上野3-19-4\n    sources:");
    expect(result).toContain("        confirmedOn: \"2026-07-01\"\n      - label: 文部科学省 学校コード一覧(CSV)");
    expect(result).toContain("    areaHint: 上野\n    address: 東京都台東区上野7-1-1\n    sources:\n      - label: 文部科学省");
    expect(result).toContain("# 手作業のコメント\nmunicipalityName: 台東区");
    expect(result).toContain("    address: 東京都台東区1-1");
  });

  it("sources のエイリアスを対象校だけ展開し、アンカー定義はスキップする", () => {
    const anchoredYaml = `municipalityName: テスト区\nelementarySchools:\n  - name: 定義元小学校\n    level: elementary\n    sources: &sharedSources\n      - label: 既存出典\n        url: https://example.test\n        confirmedOn: "2026-07-01"\n  - name: エイリアス小学校\n    level: elementary\n    sources: *sharedSources\n  - name: 通常小学校\n    level: elementary\n    sources:\n      - label: 個別出典\n        url: https://individual.example.test\n        confirmedOn: "2026-07-02"\njuniorHighSchools: []\n`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = applyAddressEdits(anchoredYaml, [
      { name: "定義元小学校", level: "elementary", address: "東京都テスト区1-1", source: MEXT_SOURCE },
      { name: "エイリアス小学校", level: "elementary", address: "東京都テスト区2-2", source: MEXT_SOURCE },
      { name: "通常小学校", level: "elementary", address: "東京都テスト区3-3", source: MEXT_SOURCE },
    ], "テスト区");

    expect(result).toContain("    sources: &sharedSources");
    expect(result).not.toContain("定義元小学校\n    level: elementary\n    address:");
    expect(result).toContain("エイリアス小学校\n    level: elementary\n    address: 東京都テスト区2-2\n    sources:\n      - label: 既存出典");
    expect(result).toContain("通常小学校\n    level: elementary\n    address: 東京都テスト区3-3\n    sources:\n      - label: 個別出典");
    expect(result.match(/エイリアス小学校[\s\S]*?通常小学校/)?.[0]).not.toContain("*sharedSources");
    expect(warn).toHaveBeenCalledWith("スキップ(アンカー定義のため): テスト区 elementary 「定義元小学校」");
    warn.mockRestore();
  });
});
