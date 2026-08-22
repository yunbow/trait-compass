import { describe, expect, it } from "vitest";

import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import {
  PREPARE_ACCOMMODATION_TAGS,
  PREPARE_CONSULT_PURPOSE_OPTIONS,
  PREPARE_CONSULT_PURPOSE_VALUES,
  PREPARE_CONTACT_METHOD_OPTIONS,
  PREPARE_CONTACT_METHOD_VALUES,
  PREPARE_DURATION_OPTIONS,
  PREPARE_DURATION_VALUES,
  PREPARE_LIFE_STATUS_OPTIONS,
  PREPARE_LIFE_STATUS_VALUES,
  PREPARE_PRIOR_SUPPORT_TAGS,
  PREPARE_SITUATION_TAGS,
} from "@/features/prepare/constants/prepare-options";

// prepare-options.ts(相談メモ追加7項目の選択肢定数)の回帰テスト。
//
// **最重要**: 選択肢文言に危機介入シグナル(自傷・希死念慮等)を想起させる語句が
// 紛れ込んでいないことを回帰確認する(prepare-options.ts 冒頭コメント参照、AC-2 の
// 危機介入回避構造の維持)。今後誰かが不用意にそのような文言を追加した場合、この
// テストが失敗して気付けるようにする。

function hasNoDuplicates(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** 単一選択項目(VALUES と OPTIONS のペア)。 */
const singleChoiceGroups = [
  { name: "duration", values: PREPARE_DURATION_VALUES, options: PREPARE_DURATION_OPTIONS },
  { name: "lifeStatus", values: PREPARE_LIFE_STATUS_VALUES, options: PREPARE_LIFE_STATUS_OPTIONS },
  { name: "consultPurpose", values: PREPARE_CONSULT_PURPOSE_VALUES, options: PREPARE_CONSULT_PURPOSE_OPTIONS },
  { name: "contactMethod", values: PREPARE_CONTACT_METHOD_VALUES, options: PREPARE_CONTACT_METHOD_OPTIONS },
] as const;

/** 複数選択項目(タグ配列のみ、value/label ペアを持たない)。 */
const multiChoiceGroups = [
  { name: "situation", tags: PREPARE_SITUATION_TAGS },
  { name: "accommodation", tags: PREPARE_ACCOMMODATION_TAGS },
  { name: "priorSupport", tags: PREPARE_PRIOR_SUPPORT_TAGS },
] as const;

describe("prepare-options: 単一選択項目の VALUES/OPTIONS 整合性", () => {
  it.each(singleChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: OPTIONS の value 集合と VALUES が一致する",
    (_name, group) => {
      expect(new Set(group.options.map((option) => option.value))).toEqual(new Set(group.values));
    },
  );

  it.each(singleChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: VALUES に重複が無い",
    (_name, group) => {
      expect(hasNoDuplicates(group.values)).toBe(true);
    },
  );

  it.each(singleChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: OPTIONS の value に重複が無い",
    (_name, group) => {
      expect(hasNoDuplicates(group.options.map((option) => option.value))).toBe(true);
    },
  );

  it.each(singleChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: OPTIONS のラベルはすべて空文字でない",
    (_name, group) => {
      for (const option of group.options) {
        expect(option.label.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(singleChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: OPTIONS のラベルに重複が無い",
    (_name, group) => {
      expect(hasNoDuplicates(group.options.map((option) => option.label))).toBe(true);
    },
  );
});

describe("prepare-options: 複数選択タグ配列", () => {
  it.each(multiChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: タグに重複が無い",
    (_name, group) => {
      expect(hasNoDuplicates(group.tags)).toBe(true);
    },
  );

  it.each(multiChoiceGroups.map((group) => [group.name, group] as const))(
    "%s: タグはすべて空文字でない",
    (_name, group) => {
      for (const tag of group.tags) {
        expect(tag.length).toBeGreaterThan(0);
      }
    },
  );
});

describe("prepare-options: 危機介入シグナル回帰テスト(安全要件、AC-2)", () => {
  const allLabels: string[] = [
    ...PREPARE_SITUATION_TAGS,
    ...PREPARE_ACCOMMODATION_TAGS,
    ...PREPARE_PRIOR_SUPPORT_TAGS,
    ...singleChoiceGroups.flatMap((group) => group.options.map((option) => option.label)),
  ];

  it("チェック対象のラベルが1件以上存在する(テスト自体の健全性確認)", () => {
    expect(allLabels.length).toBeGreaterThan(0);
  });

  it.each(allLabels.map((label) => [label] as const))(
    "選択肢ラベル「%s」は危機介入シグナル(containsCrisisSignal)を誘発しない",
    (label) => {
      expect(containsCrisisSignal(label)).toBe(false);
    },
  );
});
