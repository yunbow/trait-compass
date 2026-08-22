import { z } from "zod";

// 年齢区分(TICKET-0014, FR-021)。「18歳未満/18歳以上」の2択のみで、
// 生年月日等の詳細な個人情報は収集しない(NFR-33 の粒度方針と同じ最小主義)。

export const AGE_GROUP_VALUES = ["child", "adult"] as const;

export const AgeGroupSchema = z.enum(AGE_GROUP_VALUES);

export type AgeGroup = z.infer<typeof AgeGroupSchema>;

/** 画面表示用ラベル。表示順もこのまま採用する(未成年→成人)。 */
export const AGE_GROUP_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: "child", label: "18歳未満" },
  { value: "adult", label: "18歳以上" },
];
