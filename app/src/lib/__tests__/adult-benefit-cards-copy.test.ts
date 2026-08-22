import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BANNED_WORDS } from "@/lib/copy/banned-words";

/**
 * 成人向け静的制度カード(TICKET-0052)の SQL シードファイルに対する非断定表現チェック
 * (copy-lint 相当、実装方針4)。
 *
 * `src/lib/__tests__/copy-lint.test.ts` は `src/**\/*.tsx` の JSX テキストリテラルのみを
 * 走査対象としており、D1 へ投入する SQL シードファイル(`db/seed/*.sql`)の文言はスキャン
 * 対象に含まれない。制度カードの文言は静的な JSX ではなく D1 のシードデータであるため、
 * 本ファイルで `db/seed/adult-benefit-cards.sql` のテキストを直接読み込んで検証する
 * (禁止語の不使用・非断定表現の使用の両方を機械チェックする)。
 */

const SEED_FILE_PATH = join(process.cwd(), "db", "seed", "adult-benefit-cards.sql");

/** SQL コメント行(`-- ...`)を除いた本文を返す(禁止語チェックがコメント中の説明文に誤反応しないようにする)。 */
function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/** `INSERT INTO facilities` の各行が投入する制度名(name 列)。テストの対象一覧として使う。 */
const EXPECTED_PROGRAM_NAMES = [
  "精神障害者保健福祉手帳",
  "自立支援医療(精神通院医療)",
  "障害年金",
  "就労移行支援",
  "就労継続支援A型",
  "就労継続支援B型",
];

describe("adult-benefit-cards.sql の非断定表現チェック(TICKET-0052 AC-3, copy-lint相当)", () => {
  const rawSource = readFileSync(SEED_FILE_PATH, "utf8");
  const body = stripSqlComments(rawSource);

  it("禁止語(診断/判定/あなたは/罹患/重症度)を含まない", () => {
    const violations = BANNED_WORDS.filter((word) => body.includes(word));
    expect(violations).toEqual([]);
  });

  it("6件の制度カードすべてが投入されている", () => {
    for (const name of EXPECTED_PROGRAM_NAMES) {
      expect(body).toContain(name);
    }
  });

  it("非断定表現(「可能性があります」または「場合があります」)が6件分以上使われている(AC-3)", () => {
    const assertiveMatches = [...body.matchAll(/可能性があります|場合があります/g)];
    expect(assertiveMatches.length).toBeGreaterThanOrEqual(EXPECTED_PROGRAM_NAMES.length);
  });

  it("category_type='支援制度'・age_range='adult' として投入している(AC-4)", () => {
    expect(body).toContain("'支援制度'");
    expect(body).toContain("'adult'");
  });

  it("各カードに出典表記(「出典:」)を含む(AC-5)", () => {
    const sourceMatches = [...body.matchAll(/出典:/g)];
    expect(sourceMatches.length).toBeGreaterThanOrEqual(EXPECTED_PROGRAM_NAMES.length);
  });

  it("各カードに最終確認日を含む(AC-6)", () => {
    const dateMatches = [...body.matchAll(/最終確認日: 2026-07-13/g)];
    expect(dateMatches.length).toBeGreaterThanOrEqual(EXPECTED_PROGRAM_NAMES.length);
  });
});
