import { parseCategoryTypeParam } from "./category-types";
import type { CategoryType } from "./category-types";

export const SCHOOL_INFO_TAB = "学校情報" as const;
/** 結果画面のタブ = D1由来の4分類 + 手動調査の学校情報疑似タブ。facilities.category_type には決して入らない。 */
export type ResultsTab = CategoryType | typeof SCHOOL_INFO_TAB;

export function parseResultsTabParam(raw: string | undefined): ResultsTab {
  if (raw === SCHOOL_INFO_TAB) return SCHOOL_INFO_TAB;
  return parseCategoryTypeParam(raw);
}

/**
 * 結果画面タブの表示順(利用者の行動優先順)。
 * まず相談窓口・学校情報で相談先を絞り込み、次に福祉ガイド・支援資料で深掘りし、
 * 該当0件になりやすい支援制度は最後に置く。CATEGORY_TYPES(DB CHECK制約準拠の順)とは独立。
 */
export const RESULTS_TAB_ORDER: readonly ResultsTab[] = ["相談窓口", SCHOOL_INFO_TAB, "福祉ガイド", "発達障害支援資料", "支援制度"];
