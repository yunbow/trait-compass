import type { TraitKey } from "@/features/survey/schema/question";

/**
 * 特性 key → 表示ラベル。
 * 「診断」「判定」等の断定語を含まない、特性名の説明表記のみ。
 * 名称は国の発達障害情報・支援センター(発達障害情報・支援センター Web サイト)等の
 * 公的情報で使われる表記に合わせる(2026-08時点)。
 */
export const TRAIT_LABELS: Record<TraitKey, string> = {
  ASD: "ASD(自閉スペクトラム症)",
  ADHD: "ADHD(注意欠如・多動症)",
  LD: "LD(学習障害／限局性学習症)",
  DCD: "DCD(発達性協調運動症)",
};
