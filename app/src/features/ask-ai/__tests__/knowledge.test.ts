import { describe, expect, it } from "vitest";

import { buildSourcePriorityCaseSql, KNOWLEDGE_SOURCE_PRIORITY } from "@/features/ask-ai/services/knowledge";

describe("buildSourcePriorityCaseSql", () => {
  it("優先リストが空でない場合、優先データソースが上位(0)、それ以外が下位(1)になる CASE 式を組み立てる", () => {
    const sql = buildSourcePriorityCaseSql(["国立障害者リハビリテーションセンター"]);
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN d.source_org = ? THEN 0");
    expect(sql).toContain("ELSE 1 END");
  });

  it("優先リストの件数分だけ WHEN 句を持つ(複数ソース対応)", () => {
    const sql = buildSourcePriorityCaseSql(["組織A", "組織B"]);
    expect(sql.match(/WHEN d\.source_org = \? THEN 0/g)).toHaveLength(2);
  });

  it("優先リストが空の場合は常に同順位(定数式)を返す", () => {
    expect(buildSourcePriorityCaseSql([])).toBe("0");
  });

  it("値自体は SQL 文字列へ直接埋め込まず、プレースホルダー(?)のみを使う(SQLインジェクション対策)", () => {
    const sql = buildSourcePriorityCaseSql(["'; DROP TABLE datasets; --"]);
    expect(sql).not.toContain("DROP TABLE");
  });

  it("KNOWLEDGE_SOURCE_PRIORITY は hattatsu.go.jp(国立障害者リハビリテーションセンター)を含む(TICKET-0049)", () => {
    expect(KNOWLEDGE_SOURCE_PRIORITY).toContain("国立障害者リハビリテーションセンター");
  });
});
