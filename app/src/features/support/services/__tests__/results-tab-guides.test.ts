import { describe, expect, it } from "vitest";

import { BANNED_WORDS } from "@/lib/copy/banned-words";
import { getResultsTabGuide } from "@/features/support/services/results-tab-guides";
import type { ResultsTab } from "@/features/support/constants/results-tabs";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";

const REGISTERED_TABS: ResultsTab[] = ["学校情報", "福祉ガイド", "相談窓口"];
const UNREGISTERED_TABS: ResultsTab[] = ["支援制度", "発達障害支援資料"];

/** ライフステージ別の登録済み(タブが存在する)組み合わせ。 */
const REGISTERED_COMBINATIONS: { lifestage: Lifestage; tabs: ResultsTab[] }[] = [
  { lifestage: "elementary-junior-high", tabs: ["学校情報", "福祉ガイド", "相談窓口"] },
  { lifestage: "preschool", tabs: ["福祉ガイド", "相談窓口"] },
  { lifestage: "high-school", tabs: ["学校情報", "福祉ガイド", "相談窓口"] },
  { lifestage: "university-vocational", tabs: ["福祉ガイド", "相談窓口"] },
  { lifestage: "working-adult", tabs: ["福祉ガイド", "相談窓口"] },
];

const ALL_LIFESTAGES: Lifestage[] = [
  "preschool",
  "elementary-junior-high",
  "high-school",
  "university-vocational",
  "working-adult",
];

/** preschool/university-vocational/working-adult では「学校情報」タブは未登録。 */
const UNREGISTERED_SCHOOL_INFO_LIFESTAGES: Lifestage[] = ["preschool", "university-vocational", "working-adult"];

/**
 * 禁止語スキャンから除外する部分文字列。
 * いずれも第三者である医師への言及であり、本人への断定表現ではないため許容する。
 */
const ALLOWED_SUBSTRINGS = ["診断書", "医師の発達障害の診断"];

/** テキストから許容済み部分文字列を除去してから禁止語チェックにかけるための前処理。 */
function stripAllowedSubstrings(text: string): string {
  return ALLOWED_SUBSTRINGS.reduce((acc, allowed) => acc.split(allowed).join(""), text);
}

/**
 * 出典方針(results-tab-guides.ts 冒頭コメント)の機械検査に使う、
 * 「自治体・年度により変わりうる具体的な数値・年度」のパターン。
 * heading・body・keyPoints のみを対象とし、sources の label(文書の正式名称。
 * 例:「令和7年4月版」)は文書名そのものであるため対象外とする。
 */
/** 半角・全角の数字をどちらも拾う文字クラス(全角数字 U+FF10-FF19 対応)。 */
const DIGIT_CLASS = "0-9０-９";

const VOLATILE_FACT_PATTERNS: { name: string; pattern: RegExp }[] = [
  // 金額: 「0円」「4,600円」「37,200円」等。数字を伴わない「円滑」等は許容する。
  { name: "金額(◯円)", pattern: new RegExp(`[${DIGIT_CLASS}][${DIGIT_CLASS},、,]*\\s*円`) },
  // 割合: 「1割」「10%」等。数字を伴わない「役割」等は許容する。
  { name: "割合(◯割・◯%)", pattern: new RegExp(`[${DIGIT_CLASS}]+(?:[.。..][${DIGIT_CLASS}]+)?\\s*(?:割|%|%|パーセント)`) },
  // 期間: 「6か月」等。表記ゆれごと全面禁止(「毎月」「月額」は含まれないため許容される)。
  { name: "期間(◯か月)", pattern: /(?:か|ヶ|ヵ|カ|箇)月/ },
  // 対象年齢: 「0歳」「15歳以上」「18歳まで」等。
  { name: "対象年齢(◯歳)", pattern: new RegExp(`[${DIGIT_CLASS}]+\\s*歳`) },
  // 年度・元号年: 「令和3年度から」「令和7年4月」等。
  { name: "年度・元号年(令和◯年 等)", pattern: new RegExp(`(?:令和|平成|昭和)\\s*(?:[${DIGIT_CLASS}]+|元)\\s*年|[${DIGIT_CLASS}]+\\s*年度`) },
];

describe("getResultsTabGuide", () => {
  describe("後方互換(lifestage省略時はelementary-junior-highにフォールバック)", () => {
    it.each(REGISTERED_TABS)("%s タブでは heading/body/sources を返す", (tab) => {
      const guide = getResultsTabGuide(tab);

      expect(guide).not.toBeNull();
      expect(guide?.heading).toBeTruthy();
      expect(guide?.body.length).toBeGreaterThan(0);
      expect(guide?.sources.length).toBeGreaterThan(0);
    });

    it.each(UNREGISTERED_TABS)("%s タブでは null を返す", (tab) => {
      expect(getResultsTabGuide(tab)).toBeNull();
    });
  });

  describe("ライフステージ別の登録済み組み合わせ", () => {
    for (const { lifestage, tabs } of REGISTERED_COMBINATIONS) {
      it.each(tabs)(`${lifestage} × %s タブでは heading を持つガイドを返す`, (tab) => {
        const guide = getResultsTabGuide(tab, lifestage);

        expect(guide).not.toBeNull();
        expect(guide?.heading).toBeTruthy();
        expect(guide?.body.length).toBeGreaterThan(0);
        expect(guide?.sources.length).toBeGreaterThan(0);
      });
    }
  });

  describe("未登録の組み合わせ", () => {
    it.each(UNREGISTERED_SCHOOL_INFO_LIFESTAGES)("%s × 学校情報 タブでは null を返す", (lifestage) => {
      expect(getResultsTabGuide("学校情報", lifestage)).toBeNull();
    });

    for (const lifestage of ALL_LIFESTAGES) {
      it.each(UNREGISTERED_TABS)(`${lifestage} × %s タブでは null を返す`, (tab) => {
        expect(getResultsTabGuide(tab, lifestage)).toBeNull();
      });
    }
  });

  describe("フォールバック確認", () => {
    it("lifestage省略・null・elementary-junior-high明示のいずれも同じ内容を返す", () => {
      const omitted = getResultsTabGuide("相談窓口");
      const withNull = getResultsTabGuide("相談窓口", null);
      const withExplicit = getResultsTabGuide("相談窓口", "elementary-junior-high");

      expect(omitted).toEqual(withNull);
      expect(withNull).toEqual(withExplicit);
    });

    it("university-vocational と working-adult は同一内容を返す", () => {
      const universityVocational = getResultsTabGuide("相談窓口", "university-vocational");
      const workingAdult = getResultsTabGuide("相談窓口", "working-adult");

      expect(universityVocational).toEqual(workingAdult);
    });
  });

  describe("数値・年度パターンスキャン(出典方針の回帰テスト)", () => {
    for (const { lifestage, tabs } of REGISTERED_COMBINATIONS) {
      it.each(tabs)(
        `${lifestage} × %s タブの heading・body・keyPoints に自治体・年度依存の数値表現(円額・割合・◯か月・◯歳・年度)を含まない`,
        (tab) => {
          const guide = getResultsTabGuide(tab, lifestage);
          expect(guide).not.toBeNull();
          const texts = [
            guide!.heading,
            ...guide!.body,
            ...guide!.keyPoints.map((point) => point.label),
            ...guide!.keyPoints.map((point) => point.value),
          ];

          for (const text of texts) {
            for (const { name, pattern } of VOLATILE_FACT_PATTERNS) {
              expect(
                pattern.test(text),
                `「${text}」が ${name} パターン(${pattern})に一致しました。具体値は書かず「自治体窓口で確認」への誘導に置き換えてください(results-tab-guides.ts 冒頭コメント参照)。`,
              ).toBe(false);
            }
          }
        },
      );
    }
  });

  describe("禁止語スキャン", () => {
    for (const { lifestage, tabs } of REGISTERED_COMBINATIONS) {
      it.each(tabs)(`${lifestage} × %s タブの heading・body・keyPoints に禁止語(診断/判定/あなたは/罹患/重症度)を含まない`, (tab) => {
        const guide = getResultsTabGuide(tab, lifestage);
        expect(guide).not.toBeNull();
        const texts = [
          guide!.heading,
          ...guide!.body,
          ...guide!.keyPoints.map((point) => point.label),
          ...guide!.keyPoints.map((point) => point.value),
        ];

        for (const text of texts) {
          const stripped = stripAllowedSubstrings(text);
          for (const word of BANNED_WORDS) {
            expect(stripped).not.toContain(word);
          }
        }
      });
    }
  });
});
