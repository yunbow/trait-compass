// 目的選択画面(`/support/purpose`)で選んだ目的(`purposeId`)ごとの、結果画面(`/support/results`)
// での既定 `subtype`(facility_subtype、福祉ガイドタブのクライアント側絞り込み)。
// purpose-default-tabs.ts と同じ理由(`use-day-service`はlifestageごとに別の目的を指す)で
// lifestage別に定義する。
//
// 対応表に無い目的・lifestageの場合は`undefined`を返し、呼び出し側(results-url.ts)は
// `subtype`クエリを付けない(既存の「福祉ガイド」タブ全件表示にフォールバックする)。

import type { Lifestage } from "@/features/support/services/lifestage-mapping";

type PurposeDefaultSubtypes = Partial<Record<string, string>>;

/** 未就学児(preschool)向け。「児童発達支援・療育を利用したい」→児童発達支援(facility_subtype)。 */
const PRESCHOOL_PURPOSE_DEFAULT_SUBTYPES: PurposeDefaultSubtypes = {
  "use-day-service": "児童発達支援",
};

/** 小学生・中学生(elementary-junior-high)向け。「放課後等デイサービスを利用したい」。 */
const ELEMENTARY_JUNIOR_HIGH_PURPOSE_DEFAULT_SUBTYPES: PurposeDefaultSubtypes = {
  "use-day-service": "放課後等デイサービス",
};

/** 高校生(high-school)向け。「放課後等デイサービスを継続利用したい」。 */
const HIGH_SCHOOL_PURPOSE_DEFAULT_SUBTYPES: PurposeDefaultSubtypes = {
  "use-day-service": "放課後等デイサービス",
};

const PURPOSE_DEFAULT_SUBTYPES_BY_LIFESTAGE: Partial<Record<Lifestage, PurposeDefaultSubtypes>> = {
  preschool: PRESCHOOL_PURPOSE_DEFAULT_SUBTYPES,
  "elementary-junior-high": ELEMENTARY_JUNIOR_HIGH_PURPOSE_DEFAULT_SUBTYPES,
  "high-school": HIGH_SCHOOL_PURPOSE_DEFAULT_SUBTYPES,
};

/** 対応表に無い場合は`undefined`(呼び出し側で`subtype`クエリを付けない)。 */
export function getPurposeDefaultSubtype(lifestage: Lifestage, purposeId: string): string | undefined {
  return PURPOSE_DEFAULT_SUBTYPES_BY_LIFESTAGE[lifestage]?.[purposeId];
}
