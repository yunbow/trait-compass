// ライフステージ→AgeGroup マッピング(TICKET-0044)。
//
// D1 の facilities/AgeGroup スキーマ(`AGE_GROUP_VALUES = ["child", "adult"]`、
// src/features/support/schema/age-group.ts)は「18歳未満/18歳以上」の2値のみで構成されて
// おり、区市町村データ側もこの粒度でしか年齢を持たない(スキーマ変更は本チケットの
// スコープ外)。そこで、「在住の方」導線では5区分(未就学児/小学生・中学生/高校生/
// 大学生・専門学校生/社会人)のライフステージ選択を利用者に提示しつつ、既存の D1 検索
// (`SupportInputForm.tsx` → `/support/results?age=...`)へは本ファイルの純関数でマッピング
// した child/adult の2値のみを渡す。db/schema.sql・AgeGroupSchema・AGE_GROUP_VALUES 等の
// 既存スキーマは変更しない(AC-3)。

import type { AgeGroup } from "@/features/support/schema/age-group";

export const LIFESTAGE_VALUES = [
  "preschool",
  "elementary-junior-high",
  "high-school",
  "university-vocational",
  "working-adult",
] as const;

export type Lifestage = (typeof LIFESTAGE_VALUES)[number];

/** 画面表示用ラベル。表示順もこのまま採用する(未就学児→社会人)。 */
export const LIFESTAGE_OPTIONS: { value: Lifestage; label: string }[] = [
  { value: "preschool", label: "未就学児" },
  { value: "elementary-junior-high", label: "小学生・中学生" },
  { value: "high-school", label: "高校生" },
  { value: "university-vocational", label: "大学生・専門学校生" },
  { value: "working-adult", label: "社会人" },
];

/**
 * ライフステージ → 既存 D1 スキーマの AgeGroup(child/adult)対応表(AC-2, AC-3)。
 * 未就学児〜高校生は「18歳未満」相当の `child`、大学生・専門学校生・社会人は
 * 「18歳以上」相当の `adult` へ寄せる。
 */
const LIFESTAGE_TO_AGE_GROUP: Record<Lifestage, AgeGroup> = {
  preschool: "child",
  "elementary-junior-high": "child",
  "high-school": "child",
  "university-vocational": "adult",
  "working-adult": "adult",
};

/** LIFESTAGE_TO_AGE_GROUP が LIFESTAGE_VALUES を過不足なく網羅しているかを実行時に保証する(AC-2)。 */
for (const lifestage of LIFESTAGE_VALUES) {
  if (!(lifestage in LIFESTAGE_TO_AGE_GROUP)) {
    throw new Error(`lifestage-mapping: ライフステージ "${lifestage}" の年齢区分対応が未定義です`);
  }
}

/**
 * ライフステージ → 序数(0〜4)。D1 facilities.lifestage_min/max の格納値・検索時の BETWEEN 比較値。
 * 序数は LIFESTAGE_VALUES の並び順(未就学児=0 … 社会人=4)と厳密に一致させる(migration 0016)。
 */
export const LIFESTAGE_ORDINAL: Record<Lifestage, number> = {
  preschool: 0,
  "elementary-junior-high": 1,
  "high-school": 2,
  "university-vocational": 3,
  "working-adult": 4,
};

/** LIFESTAGE_ORDINAL が LIFESTAGE_VALUES と同じ並び順・過不足なしであることを実行時に保証する。 */
for (let index = 0; index < LIFESTAGE_VALUES.length; index++) {
  const lifestage = LIFESTAGE_VALUES[index];
  if (LIFESTAGE_ORDINAL[lifestage] !== index) {
    throw new Error(`lifestage-mapping: ライフステージ "${lifestage}" の序数が LIFESTAGE_VALUES の並びと一致しません`);
  }
}

/** ライフステージを D1 facilities.lifestage_min/max と同じ序数へ変換する純関数(migration 0016)。 */
export function lifestageToOrdinal(lifestage: Lifestage): number {
  return LIFESTAGE_ORDINAL[lifestage];
}

/**
 * ライフステージを既存の D1 検索(`age` パラメータ)向けの AgeGroup へ変換する純関数(AC-2)。
 * db/schema.sql・AgeGroupSchema 等の既存スキーマには一切手を加えず、UI 層でのみ完結する。
 */
export function mapLifestageToAgeGroup(lifestage: Lifestage): AgeGroup {
  return LIFESTAGE_TO_AGE_GROUP[lifestage];
}
