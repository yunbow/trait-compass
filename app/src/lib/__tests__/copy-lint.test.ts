import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { FacilityResultsView } from "@/features/support/components/FacilityResultsView";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { CategoryType } from "@/features/support/constants/category-types";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";
import { BANNED_WORDS } from "@/lib/copy/banned-words";

/**
 * 非診断表現の静的チェック(TICKET-0017, NFR-51)。
 *
 * `src/**\/*.tsx` の JSX テキストリテラル(タグの間に直接書かれた表示文字列)から
 * 禁止語(診断/判定/あなたは○○です型/罹患/重症度)を検出する。単純な文字列走査ベースの
 * チェックであり、AST は使わない(禁止語の定義は `@/lib/copy/banned-words.ts` を参照)。
 *
 * 質問データ(questions.json)は仕様由来のため対象外(TICKET-0017 の指示どおり)。
 * `__tests__` 配下・`*.test.tsx`/`*.spec.tsx` は UI の表示文言ではないため対象外。
 *
 * 本ファイル自体は `.ts`(JSX 非使用)のため、render 系のアサーションは
 * `React.createElement` で組み立てる。
 */

const SRC_DIR = join(process.cwd(), "src");

/**
 * 「診断ではありません」のような否定文脈は禁止語を含んでいても違反として扱わない
 * (TICKET-0017 の許容リスト)。ここに列挙した文言は `DisclaimerNotice` の正文
 * そのものであり、恣意的な追加を防ぐため完全一致のみで許可する
 * (部分一致にすると本来の禁止語チェックが骨抜きになるため)。
 */
const ALLOWED_TEXTS = new Set<string>([
  "これは医学的な診断ではありません。",
  "診断や治療が必要かどうかは、医療機関や専門の相談窓口にご確認ください。",
  "これは医学的な診断ではありません。傾向を知るための、日常の困りごとチェックの目安です。",
  // TICKET-0050 AC-5: 「診断がなくても相談できる」フラグ(FacilityCard の noDiagnosisOk バッジ)。
  // 「診断不要です」という断定表現ではなく、窓口側の一般的な受付方針を示す非断定表現
  // (「〜できるとされています」)に留め、個別ケースでの相談可否を保証しない旨を明記した文言。
  "診断がなくても相談できるとされています。個別の相談可否は窓口へご確認ください。",
]);

function isTargetFile(path: string): boolean {
  if (!path.endsWith(".tsx")) return false;
  if (path.includes("__tests__")) return false;
  if (path.endsWith(".test.tsx") || path.endsWith(".spec.tsx")) return false;
  return true;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (isTargetFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** 行頭が `//` の1行コメント、および `/* ... *\/` ブロックコメント(JSDoc含む)を除去する。 */
function stripComments(source: string): string {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlockComments
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n");
}

/** JSX 式(`{expr}`)を除去する。ネストにも対応するため、変化が無くなるまで繰り返す。 */
function stripJsxExpressions(source: string): string {
  let previous: string;
  let result = source;
  do {
    previous = result;
    result = result.replace(/\{[^{}]*\}/g, "");
  } while (result !== previous);
  return result;
}

/** タグの間(`>` と `<` の間)に直接書かれたテキストノードを抽出する。 */
function extractJsxTextLiterals(source: string): string[] {
  const cleaned = stripJsxExpressions(stripComments(source));
  const matches = [...cleaned.matchAll(/>([^<]+)</g)];
  return matches.map((m) => m[1].trim()).filter((text) => text.length > 0);
}

interface Violation {
  file: string;
  text: string;
  word: string;
}

function findViolations(): Violation[] {
  const files = walk(SRC_DIR);
  const violations: Violation[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const texts = extractJsxTextLiterals(source);

    for (const text of texts) {
      if (ALLOWED_TEXTS.has(text)) continue;

      for (const word of BANNED_WORDS) {
        if (text.includes(word)) {
          violations.push({ file: relative(process.cwd(), file), text, word });
        }
      }
    }
  }

  return violations;
}

describe("copy-lint: 非診断表現の静的チェック(NFR-51)", () => {
  it("src/**/*.tsx の JSX テキストリテラルに禁止語(診断/判定/あなたは○○です型/罹患/重症度)が無い", () => {
    const violations = findViolations();

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.file}: 「${v.text}」に禁止語「${v.word}」が含まれています`)
        .join("\n");
      throw new Error(
        `copy-lint: 禁止語を含むUI文言が見つかりました。禁止語の定義は app/src/lib/copy/banned-words.ts を確認してください。\n${detail}`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("抽出ロジック自体が禁止語を検出できる(回帰防止のためのセルフテスト)", () => {
    const source = '<p className="x">あなたはASDと診断されました</p>';
    const texts = extractJsxTextLiterals(source);

    expect(texts).toContain("あなたはASDと診断されました");
  });

  it("否定文脈の許容リストに載っている正文は違反として検出しない", () => {
    const source = "<p>これは医学的な診断ではありません。</p>";
    const texts = extractJsxTextLiterals(source);

    expect(texts).toEqual(["これは医学的な診断ではありません。"]);
    expect(ALLOWED_TEXTS.has(texts[0])).toBe(true);
  });
});

describe("非診断免責の表示(TICKET-0017 AC-3): トップ・結果・支援結果", () => {
  it("トップ画面に非診断の免責文言が表示される", async () => {
    // Home はサーバーコンポーネント(フック未使用)のため、関数として直接呼び出して
    // 得られる要素をそのまま render() に渡せる(JSX 非使用の .ts ファイルのための書き方)。
    // requireBetaGateUnlocked() の呼び出しにより async になったため await する。
    render(await Home());

    expect(screen.getByText("これは医学的な診断ではありません。")).toBeTruthy();
  });

  it("支援情報案内(結果一覧)画面に非診断の免責文言が表示される", () => {
    const facilitiesByCategory = Object.fromEntries(
      CATEGORY_TYPES.map((type) => [type, [] as FacilityDisplayData[]]),
    ) as Record<CategoryType, FacilityDisplayData[]>;
    const tabs = CATEGORY_TYPES.map((type) => ({ type, href: "#", count: 0 }));

    // FacilityResultsView は表示切り替え(ViewModeToggle)の状態を持つクライアント
    // コンポーネント(useState 使用)のため、他の項目のように関数として直接呼び出すと
    // フックのルール違反になる。React.createElement 経由で通常のレンダーパスに乗せる。
    render(
      createElement(FacilityResultsView, {
        activeTab: "相談窓口",
        facilitiesByCategory,
        tabs,
        isFallback: false,
        fallbackMessage: null,
        hasUnhealthyDatasets: false,
        backHref: "/support",
        prepareHref: "/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA",
        recommendHref: "/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA",
        municipality: "世田谷区",
      }),
    );

    expect(screen.getByText("これは医学的な診断ではありません。")).toBeTruthy();
  });

  it("DisclaimerNotice の full 表示には設問の出典明記(NFR-53)が含まれる", () => {
    render(DisclaimerNotice({}));

    expect(screen.getByText(/設問は本プロジェクトで独自に作成したものであり/)).toBeTruthy();
  });

  it("DisclaimerNotice の compact 表示は一文で非診断を明記する", () => {
    render(DisclaimerNotice({ variant: "compact" }));

    expect(
      screen.getByText("これは医学的な診断ではありません。傾向を知るための、日常の困りごとチェックの目安です。"),
    ).toBeTruthy();
  });
});
