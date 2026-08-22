import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * docs/designs/db-tables.md と db/schema.sql の乖離検知テスト。
 *
 * `taito-dummy-seed.test.ts`・`adult-benefit-cards-copy.test.ts` と同じ方針(SQL/Markdown を
 * テキストとして読み込み、正規表現ベースで整合性を検査する軽量な静的チェック。D1 は起動しない)。
 *
 * docs/designs/db-tables.md は「schema.sql の全テーブル・全カラムのリファレンス」を謳う文書
 * であるため、
 * - schema.sql に存在するカラムが文書に掲載されていない(掲載漏れ)
 * - 文書に存在しないカラムが書かれている(誤記載・削除済みカラムの残存)
 * のいずれも検知できるようにする。カラム名の集合が両者で完全一致することを検証する。
 */

const SCHEMA_FILE_PATH = join(process.cwd(), "db", "schema.sql");
const DOCS_FILE_PATH = join(process.cwd(), "..", "docs", "designs", "db-tables.md");

const TABLE_LEVEL_CONSTRAINT_KEYWORDS = ["PRIMARY KEY", "FOREIGN KEY", "UNIQUE", "CHECK"];

/** SQL の `--` 行コメントを除いた本文を返す。 */
function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/**
 * `CREATE TABLE IF NOT EXISTS <name> (...)` の `(...)` の中身(トップレベル)を、
 * 深さを考慮してカンマ分割する。CHECK(...) や REFERENCES foo(id) のようなネストした
 * 括弧内のカンマでは分割しない。
 */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** `db/schema.sql` から `{ テーブル名: カラム名[] }` を抽出する。 */
function extractSchemaTables(schemaSource: string): Record<string, string[]> {
  const body = stripSqlComments(schemaSource);
  const tables: Record<string, string[]> = {};

  const tableStartRe = /CREATE TABLE IF NOT EXISTS (\w+) \(/g;
  let match: RegExpExecArray | null;
  while ((match = tableStartRe.exec(body)) !== null) {
    const tableName = match[1];
    const openParenIdx = match.index + match[0].length - 1; // '(' の位置
    let depth = 0;
    let closeIdx = -1;
    for (let i = openParenIdx; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) {
      throw new Error(`${tableName} の CREATE TABLE 定義の終端が見つからない`);
    }
    const inner = body.slice(openParenIdx + 1, closeIdx);
    const items = splitTopLevel(inner);

    const columns = items
      .filter((item) => !TABLE_LEVEL_CONSTRAINT_KEYWORDS.some((kw) => item.toUpperCase().startsWith(kw)))
      .map((item) => {
        const colMatch = item.match(/^(\w+)/);
        if (!colMatch) {
          throw new Error(`${tableName} のカラム定義からカラム名を抽出できない: ${item}`);
        }
        return colMatch[1];
      });

    tables[tableName] = columns;
  }

  return tables;
}

/**
 * docs/designs/db-tables.md から `{ テーブル名: カラム名[] }` を抽出する。
 * `## N. \`table_name\`` を各テーブルのセクション区切りとし、セクション内で
 * `| \`col_name\` | ...` の形の行(バッククォート付き先頭セル)をカラム行とみなす。
 */
function extractDocsTables(docsSource: string): Record<string, string[]> {
  // すべての "## " 見出し(テーブル見出し以外の "## 5. インデックス" 等も含む)をセクション境界とする。
  // テーブル見出し("## N. `table_name`")だけを境界にすると、末尾のテーブルのセクションが
  // 後続の非テーブル見出し(インデックス節等)まで拡張され、インデックス名がカラムとして
  // 誤混入する(インデックス表の1列目もバッククォート付きのため)。
  const anyHeadingRe = /^##\s+.*$/gm;
  const sectionBoundaries: number[] = [];
  let boundaryMatch: RegExpExecArray | null;
  while ((boundaryMatch = anyHeadingRe.exec(docsSource)) !== null) {
    sectionBoundaries.push(boundaryMatch.index);
  }
  sectionBoundaries.push(docsSource.length);

  const tableHeadingRe = /^##\s+\d+\.\s+`(\w+)`\s*$/gm;
  const headings: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tableHeadingRe.exec(docsSource)) !== null) {
    headings.push({ name: match[1], index: match.index });
  }
  if (headings.length === 0) {
    throw new Error("docs/designs/db-tables.md からテーブル見出し(## N. `table_name`)が見つからない");
  }

  const tables: Record<string, string[]> = {};
  for (const heading of headings) {
    const start = heading.index;
    const end = sectionBoundaries.find((b) => b > start) ?? docsSource.length;
    const section = docsSource.slice(start, end);

    const colRe = /^\|\s*`(\w+)`\s*\|/gm;
    const columns: string[] = [];
    let colMatch: RegExpExecArray | null;
    while ((colMatch = colRe.exec(section)) !== null) {
      columns.push(colMatch[1]);
    }
    tables[heading.name] = columns;
  }

  return tables;
}

describe("docs/designs/db-tables.md と db/schema.sql のカラム整合性", () => {
  const schemaSource = readFileSync(SCHEMA_FILE_PATH, "utf8");
  const docsSource = readFileSync(DOCS_FILE_PATH, "utf8");

  const schemaTables = extractSchemaTables(schemaSource);
  const docsTables = extractDocsTables(docsSource);

  it("schema.sql に検索・手動調査テーブルが定義されている(テスト前提の確認)", () => {
    expect(Object.keys(schemaTables).sort()).toEqual(
      ["datasets", "facilities", "facility_tags", "usage_counts", "ai_rate_limits", "schools", "school_fixed_classes", "school_resource_rooms", "high_school_pathways", "class_organizations", "special_needs_schools", "municipality_survey_meta", "school_registry", "support_pathways", "support_pathway_steps", "results_guide_notes", "facility_reports", "report_rate_limits", "content_reports", "beta_gate_rate_limits", "track_rate_limits", "feedback_rating_counts", "feedback_unclear_reason_counts", "feedback_comments", "feedback_rate_limits"].sort(),
    );
  });

  it("docs/designs/db-tables.md が schema.sql と同じテーブル集合を掲載している", () => {
    expect(Object.keys(docsTables).sort()).toEqual(Object.keys(schemaTables).sort());
  });

  it.each(Object.keys(schemaTables))("%s: schema.sql の全カラムが文書に記載されている(掲載漏れ無し)", (table) => {
    const schemaCols = schemaTables[table];
    const docCols = new Set(docsTables[table] ?? []);
    const missing = schemaCols.filter((col) => !docCols.has(col));
    expect(missing).toEqual([]);
  });

  it.each(Object.keys(schemaTables))("%s: 文書に schema.sql 側に存在しないカラムが書かれていない(誤記載無し)", (table) => {
    const schemaCols = new Set(schemaTables[table]);
    const docCols = docsTables[table] ?? [];
    const extraneous = docCols.filter((col) => !schemaCols.has(col));
    expect(extraneous).toEqual([]);
  });

  it.each(Object.keys(schemaTables))("%s: 文書のカラム列挙に重複が無い", (table) => {
    const docCols = docsTables[table] ?? [];
    expect(new Set(docCols).size).toBe(docCols.length);
  });
});
