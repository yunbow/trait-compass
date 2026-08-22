// カテゴリ→相談分野タグ変換(TICKET-0013, FR-023)。
//
// アンケートは10カテゴリのスコアを算出するが(src/features/survey/services/scoring.ts)、
// 支援情報検索(FR-024)へそのまま渡すと「診断名・症状ラベル」を露出しかねない
// (NFR-51: 「診断」「判定」表現の排除、個別疾病名を断定しない)。
// そこで、相談窓口が実務で使う生活語彙の「相談分野タグ」に一度集約してから検索条件として使う。
//
// db/schema.sql の facility_tags.tag は自由文字列だが、タグでの突合を成立させるため、
// facility_tags へ投入する値は本ファイルの SUPPORT_TAGS と完全一致させる。

import { CATEGORY_KEYS } from "@/features/survey/schema/question";
import type { CategoryKey } from "@/features/survey/schema/question";
import type { CategoryScores } from "@/features/survey/services/scoring";

/**
 * 相談分野タグ。10カテゴリを4〜6個に集約する。
 * 診断・症状を想起させる語彙(「診断」「障害」「症状」「多動」「判定」等)は使わず、
 * 生活場面で使う呼称に統一する(FR-023, NFR-51)。
 */
export const SUPPORT_TAGS = [
  "対人・コミュニケーション",
  "こころ・感情",
  "不注意・段取り",
  "感覚",
  "学習・からだ",
  "こだわり",
] as const;

export type SupportTag = (typeof SUPPORT_TAGS)[number];

/**
 * 10カテゴリ → 相談分野タグの対応表(FR-023)。
 * - communication / social-reading / kindness-misread: 対人関係・やり取りの相談 → 「対人・コミュニケーション」
 * - emotion-regulation: 気持ちの波・落ち込みの相談 → 「こころ・感情」
 * - impulse-memory / executive-function: 忘れ物・段取り・衝動性の相談 → 「不注意・段取り」
 * - sensory: 感覚の過敏・鈍麻の相談 → 「感覚」
 * - motor / learning: 運動・学習でのつまずきの相談 → 「学習・からだ」
 * - restricted-repetitive: こだわり・切り替えの相談 → 「こだわり」
 */
const CATEGORY_TO_TAG: Record<CategoryKey, SupportTag> = {
  communication: "対人・コミュニケーション",
  "social-reading": "対人・コミュニケーション",
  "kindness-misread": "対人・コミュニケーション",
  "emotion-regulation": "こころ・感情",
  "impulse-memory": "不注意・段取り",
  "executive-function": "不注意・段取り",
  sensory: "感覚",
  motor: "学習・からだ",
  learning: "学習・からだ",
  "restricted-repetitive": "こだわり",
};

/** CATEGORY_TO_TAG が CATEGORY_KEYS を過不足なく網羅しているかを実行時に保証する(AC-1)。 */
for (const category of CATEGORY_KEYS) {
  if (!(category in CATEGORY_TO_TAG)) {
    throw new Error(`category-tag-mapping: カテゴリ "${category}" のタグ対応が未定義です`);
  }
}

/**
 * カテゴリ別スコアを相談分野タグへ変換する純関数(AC-2, NFR-72)。
 * スコアが `threshold`(既定40)以上のカテゴリのみを対象にスコア降順で走査し、
 * 対応するタグを重複なく返す。
 * - `null`(未回答により未算出、AC-4)・閾値未満のカテゴリは除外する。
 * - 全カテゴリが対象外の場合は空配列を返す(呼び出し側は `SUPPORT_TAGS` で「全般」フォールバック可能)。
 * - 出力に診断名・症状ラベルは含まれない(AC-3, タグ自体が生活語彙のみで構成されているため)。
 */
export function mapScoresToTags(categoryScores: CategoryScores, threshold = 40): SupportTag[] {
  const eligible = (Object.entries(categoryScores) as Array<[CategoryKey, number | null]>)
    .filter((entry): entry is [CategoryKey, number] => entry[1] !== null && entry[1] >= threshold)
    .sort((a, b) => b[1] - a[1]);

  const tags: SupportTag[] = [];
  for (const [category] of eligible) {
    const tag = CATEGORY_TO_TAG[category];
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}
