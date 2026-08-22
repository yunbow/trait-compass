import type { CategoryKey } from "@/features/survey/schema/question";

/**
 * カテゴリ key → 日本語表示ラベル(features/survey/schema/question.ts の CATEGORY_KEYS に対応)。
 * 進捗バー(ProgressBar)・カテゴリ変わり目トランジション(CategoryTransition)から共通利用する。
 */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  communication: "会話・伝え方",
  "social-reading": "場の空気・人の気持ち",
  "emotion-regulation": "感情の調整",
  "impulse-memory": "衝動・記憶",
  "executive-function": "段取り・実行",
  "kindness-misread": "善意が誤解される",
  sensory: "感覚",
  motor: "運動・不器用さ",
  learning: "学習・読み書き計算",
  "restricted-repetitive": "こだわり・反復",
};
