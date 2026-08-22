import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";
import { SELF_UNDERSTANDING_MAP_URL } from "@/lib/assets/static-assets";

/**
 * TICKET-0031: 共有導線の入口体験強化(OGPメタデータ)のユニットテスト。
 *
 * - AC-1: openGraph(title/description/url/siteName/images/locale/type)と
 *   twitter(card=summary_large_image 等)の主要フィールドの内容確認
 * - AC-3/AC-4: カード文言に禁止語(`src/lib/copy/banned-words.ts` 参照)・煽り表現が
 *   混入していないことの確認(copy-lint.test.ts は JSX テキストリテラル対象のため、
 *   metadata オブジェクトの文字列はここで別途チェックする)
 *
 * カード文言は結果に非連動の固定文言であり、共有 URL(`#r=...`)ごとに変化しない
 * (フラグメントはサーバーへ送信されないため技術的にも不可能。チケット背景参照)。
 */

const EXPECTED_TITLE = "Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに";
const EXPECTED_PAGE_TITLE = "Trait Compass | 発達特性と支援情報";
const EXPECTED_DESCRIPTION =
  "発達特性と困りごとを整理し、支援への道しるべになる、ブラウザで完結する日常の困りごとチェック。診断ではなく、傾向を知るための目安を提供します。";

/**
 * 禁止語(copy-lint.test.ts の BANNED_WORDS と同一)。
 * これに加えて、AC-4 の煽り・優劣比較表現もチェックする。
 */
const BANNED_WORDS = ["診断", "判定", "あなたは", "罹患", "重症度"] as const;

/** 煽り・優劣比較を示唆する表現(不可侵制約、NFR-51)。 */
const SENSATIONAL_WORDS = ["隠れた", "わかってしまう", "暴く", "ランキング", "優劣", "上位", "偏差値"] as const;

/**
 * 否定文脈の許容パターン: 「診断ではなく」「診断ではありません」のように、
 * 非診断であることを明示する文脈での「診断」は禁止対象ではない
 * (禁止語リストの例外規定)。許容文脈を除去した上で禁止語を探す。
 */
function stripAllowedNegations(text: string): string {
  return text.replace(/診断ではなく/g, "").replace(/診断ではありません/g, "");
}

/** metadata から利用者の目に触れうる文言をすべて集める。 */
function collectUserFacingTexts(): string[] {
  const texts: string[] = [];

  if (typeof metadata.title === "string") texts.push(metadata.title);
  if (typeof metadata.description === "string") texts.push(metadata.description);

  const og = metadata.openGraph;
  if (og) {
    if (typeof og.title === "string") texts.push(og.title);
    if (typeof og.description === "string") texts.push(og.description);
    if (typeof og.siteName === "string") texts.push(og.siteName);
  }

  const tw = metadata.twitter;
  if (tw) {
    if (typeof tw.title === "string") texts.push(tw.title);
    if (typeof tw.description === "string") texts.push(tw.description);
  }

  return texts;
}

describe("layout metadata: OGP/Twitter Card(TICKET-0031)", () => {
  it("AC-1: openGraph の主要フィールド(title/description/url/siteName/locale/type)が設定されている", () => {
    const og = metadata.openGraph;
    expect(og).toBeDefined();
    expect(og?.title).toBe(EXPECTED_TITLE);
    expect(og?.description).toBe(EXPECTED_DESCRIPTION);
    expect(og?.url).toBe("/");
    expect(og?.siteName).toBe(EXPECTED_TITLE);
    expect(og?.locale).toBe("ja_JP");
    expect(og && "type" in og ? og.type : undefined).toBe("website");
  });

  it("AC-1/AC-2: openGraph.images に og:image(1200x630)が設定されている", () => {
    const images = metadata.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const list = images as Array<{ url: string; width?: number; height?: number }>;
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe(SELF_UNDERSTANDING_MAP_URL);
    expect(list[0].width).toBe(1200);
    expect(list[0].height).toBe(630);
  });

  it("AC-1: twitter カードが summary_large_image で、title/description/images が設定されている", () => {
    const tw = metadata.twitter;
    expect(tw).toBeDefined();
    expect(tw && "card" in tw ? tw.card : undefined).toBe("summary_large_image");
    expect(tw?.title).toBe(EXPECTED_TITLE);
    expect(tw?.description).toBe(EXPECTED_DESCRIPTION);
    expect(tw?.images).toEqual([SELF_UNDERSTANDING_MAP_URL]);
  });

  it("AC-1: metadataBase が設定されている(相対パスの og:image を絶対 URL 化するため)", () => {
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it("サイトのfaviconを設定している", () => {
    expect(metadata.icons).toEqual({ icon: "/icon.svg" });
  });

  it("description が既存の非診断トーンの文言と一致する(結果非連動の固定文言)", () => {
    expect(metadata.description).toBe(EXPECTED_DESCRIPTION);
  });

  it("<title> はタブ・検索結果向けの短縮版で、OGP/Twitter の title(EXPECTED_TITLE)とは分離している", () => {
    expect(metadata.title).toBe(EXPECTED_PAGE_TITLE);
    expect(metadata.title).not.toBe(EXPECTED_TITLE);
  });

  it("AC-3: カード文言に禁止語(診断/判定/あなたは○○です型/罹患/重症度)が混入していない", () => {
    const texts = collectUserFacingTexts();
    expect(texts.length).toBeGreaterThan(0);

    for (const text of texts) {
      const stripped = stripAllowedNegations(text);
      for (const word of BANNED_WORDS) {
        expect(stripped.includes(word), `「${text}」に禁止語「${word}」が含まれています`).toBe(false);
      }
    }
  });

  it("AC-4: カード文言に煽り表現・優劣比較を促す表現が混入していない", () => {
    const texts = collectUserFacingTexts();

    for (const text of texts) {
      for (const word of SENSATIONAL_WORDS) {
        expect(text.includes(word), `「${text}」に煽り・優劣比較表現「${word}」が含まれています`).toBe(false);
      }
    }
  });

  it("AC-3: 「診断ではなく」という非診断の否定文脈を description が継承している", () => {
    expect(metadata.description).toContain("診断ではなく");
    expect(metadata.openGraph?.description).toContain("診断ではなく");
    expect(metadata.twitter?.description).toContain("診断ではなく");
  });
});
