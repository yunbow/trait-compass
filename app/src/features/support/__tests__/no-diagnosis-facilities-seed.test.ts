import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * db/seed/no-diagnosis-facilities.sql(サポステ2施設の実データ手動シード、TICKET-0050)に
 * 対する機械チェック(consultation-desk-tags-seed.test.ts と同じ方針: SQL ファイルのテキストを
 * 直接検証する)。
 *
 * 2026-08是正(外部レビューP1)の回帰ガードとして追加する。本ファイルは以下2点をあわせて
 * 検証する:
 * - サポステ2施設(fac-manual-saposute-shinjuku / fac-manual-saposute-setagaya)の
 *   lifestage_min/lifestage_max が対象年齢「15〜49歳」に対応する 2(高校生)〜4(社会人)で
 *   投入されていること(facility-search.ts の lifestageFilterClause による安全側除外が
 *   正しく効くための前提)。
 * - datasets/facilities の INSERT が冪等であること(2026-08-29是正: 既存環境での再実行が
 *   UNIQUE 制約違反で失敗していた問題への対応。datasets は INSERT OR IGNORE、facilities は
 *   ON CONFLICT(id) DO UPDATE)。
 * - 旧ダミー行クリーンアップの DELETE が facility_tags → facilities の順(子→親)であること
 *   (schema.sql の FK 制約違反を避けるため)。
 */

const SEED_FILE_NAME = "no-diagnosis-facilities.sql";
const SAPOSUTE_FACILITY_IDS = ["fac-manual-saposute-shinjuku", "fac-manual-saposute-setagaya"];

function readSeedSource(): string {
  return readFileSync(join(process.cwd(), "db", "seed", SEED_FILE_NAME), "utf8");
}

/** SQL コメント行(`--` 始まり)を除去した本文。 */
function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/** 文字列全体から、深さ0(トップレベル)の丸カッコで囲まれた各グループを取り出す。 */
function splitTopLevelParenGroups(text: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        groups.push(current);
        continue;
      }
    }
    if (depth >= 1) current += char;
  }
  return groups;
}

/** 1行分の VALUES タプル文字列を、丸カッコ・クォートの深さを考慮してカンマ分割する。 */
function splitTupleColumns(tuple: string): string[] {
  const columns: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = "";
  for (const char of tuple) {
    if (char === "'") {
      inQuote = !inQuote;
      current += char;
      continue;
    }
    if (!inQuote) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        columns.push(current.trim());
        current = "";
        continue;
      }
    }
    current += char;
  }
  columns.push(current.trim());
  return columns;
}

/**
 * `INSERT INTO facilities (col1, col2, ...) VALUES (...), (...) ON CONFLICT ...` から、
 * 列名 → 値(文字列のまま)の Map を行ごとに組み立てる。
 */
function parseFacilityRows(body: string): Map<string, string>[] {
  const insertMatch = body.match(/INSERT INTO facilities\s*\(([\s\S]*?)\)\s*VALUES/);
  if (!insertMatch) throw new Error("INSERT INTO facilities の列リストが見つかりませんでした");
  const columnNames = insertMatch[1]
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column.length > 0);

  // "VALUES" は上流の `INSERT OR IGNORE INTO datasets (...) VALUES (...)` にも出現するため、
  // `insertMatch` の直後(facilities の INSERT 文の位置)から検索を始める。
  const afterInsert = body.slice(insertMatch.index! + insertMatch[0].length);
  const valuesSectionMatch = afterInsert.match(/^([\s\S]*?)\s*ON CONFLICT\(id\) DO UPDATE SET/);
  if (!valuesSectionMatch) throw new Error("facilities の VALUES 節が見つかりませんでした");

  const tuples = splitTopLevelParenGroups(valuesSectionMatch[1]);
  return tuples.map((tuple) => {
    const values = splitTupleColumns(tuple);
    const row = new Map<string, string>();
    columnNames.forEach((column, index) => {
      row.set(column, values[index]);
    });
    return row;
  });
}

describe("no-diagnosis-facilities.sql の facilities 手動シード", () => {
  const rawSource = readSeedSource();
  const body = stripComments(rawSource);
  const rows = parseFacilityRows(body);

  it("サポステ2施設(fac-manual-saposute-shinjuku / fac-manual-saposute-setagaya)を投入している", () => {
    const ids = rows.map((row) => row.get("id")?.replace(/'/g, ""));
    expect(new Set(ids)).toEqual(new Set(SAPOSUTE_FACILITY_IDS));
  });

  it.each(SAPOSUTE_FACILITY_IDS)(
    "%s は lifestage_min=2(高校生)・lifestage_max=4(社会人)で投入されている(対象「15〜49歳」に対応、2026-08是正の安全側除外の前提)",
    (facilityId) => {
      const row = rows.find((r) => r.get("id")?.replace(/'/g, "") === facilityId);
      expect(row).toBeDefined();
      expect(row?.get("lifestage_min")).toBe("2");
      expect(row?.get("lifestage_max")).toBe("4");
    },
  );

  it("datasets の INSERT は INSERT OR IGNORE で冪等化されている(2026-08-29是正)", () => {
    expect(rawSource).toContain("INSERT OR IGNORE INTO datasets (");
  });

  it("facilities の INSERT は ON CONFLICT(id) DO UPDATE で冪等化されている(2026-08-29是正)", () => {
    expect(rawSource).toContain("INSERT INTO facilities (");
    expect(rawSource).toContain("ON CONFLICT(id) DO UPDATE SET");
  });

  it("facilities の ON CONFLICT DO UPDATE は lifestage_min/lifestage_max も更新対象に含む(再実行での追従漏れ防止)", () => {
    const updateSectionMatch = rawSource.match(/ON CONFLICT\(id\) DO UPDATE SET([\s\S]*?);/);
    expect(updateSectionMatch).not.toBeNull();
    const updateSection = updateSectionMatch?.[1] ?? "";
    expect(updateSection).toContain("lifestage_min = excluded.lifestage_min");
    expect(updateSection).toContain("lifestage_max = excluded.lifestage_max");
  });

  it("旧ダミー行クリーンアップの DELETE は facility_tags → facilities の順(子→親、FK制約違反回避)である", () => {
    const facilityTagsDeleteIndex = rawSource.indexOf("DELETE FROM facility_tags WHERE facility_id IN");
    const facilitiesDeleteIndex = rawSource.indexOf("DELETE FROM facilities WHERE id IN");
    expect(facilityTagsDeleteIndex).toBeGreaterThan(-1);
    expect(facilitiesDeleteIndex).toBeGreaterThan(-1);
    expect(facilityTagsDeleteIndex).toBeLessThan(facilitiesDeleteIndex);
  });

  it("DELETE 対象は都立精神保健福祉センター3施設(投入対象から除外済み)である", () => {
    const expectedIds = ["fac-manual-mhwc-taito", "fac-manual-mhwc-chubu", "fac-manual-mhwc-tama"];
    for (const id of expectedIds) {
      expect(rawSource).toContain(`'${id}'`);
    }
  });
});
