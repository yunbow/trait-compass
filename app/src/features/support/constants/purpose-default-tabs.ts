// 目的選択画面(`/support/purpose`)で選んだ目的(`purposeId`)ごとの、結果画面(`/support/results`)
// での既定表示タブ。目的とライフステージの組で意味が変わる purposeId(例: `use-day-service`は
// preschool/elementary-junior-high/high-schoolで別の目的を指す)があるため、lifestage別に定義する。
//
// 対応表に無い目的・lifestageの場合は`undefined`を返し、呼び出し側(page.tsx)は
// `?tab=`未指定時の既存の既定挙動(先頭の0件でないタブ)にフォールバックする。

import type { ResultsTab } from "@/features/support/constants/results-tabs";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";

type PurposeDefaultTabs = Partial<Record<string, ResultsTab>>;

/** 小学生・中学生(elementary-junior-high)向け。 */
const ELEMENTARY_JUNIOR_HIGH_PURPOSE_DEFAULT_TABS: PurposeDefaultTabs = {
  "use-day-service": "福祉ガイド",
  "consult-transfer": SCHOOL_INFO_TAB,
};

const PURPOSE_DEFAULT_TABS_BY_LIFESTAGE: Partial<Record<Lifestage, PurposeDefaultTabs>> = {
  "elementary-junior-high": ELEMENTARY_JUNIOR_HIGH_PURPOSE_DEFAULT_TABS,
};

/** 対応表に無い場合は`undefined`(呼び出し側で既存の既定タブ挙動にフォールバックする)。 */
export function getPurposeDefaultTab(lifestage: Lifestage, purposeId: string): ResultsTab | undefined {
  return PURPOSE_DEFAULT_TABS_BY_LIFESTAGE[lifestage]?.[purposeId];
}
