// 4タブ分類の定数(TICKET-0015, FR-028)。
//
// db/schema.sql の facilities.category_type CHECK 制約(相談窓口/支援制度/福祉ガイド/
// 発達障害支援資料)と完全一致させる。FAQ タブは設けず、AI 要約機能側に統合する(FR-028)。

export const CATEGORY_TYPES = ["相談窓口", "支援制度", "福祉ガイド", "発達障害支援資料"] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

const CATEGORY_TYPE_SET: ReadonlySet<string> = new Set(CATEGORY_TYPES);

function isCategoryType(value: string): value is CategoryType {
  return CATEGORY_TYPE_SET.has(value);
}

/**
 * `/support/results?tab=` クエリの検証(純関数)。
 * 未指定・既知の4分類以外の値(URL 改ざん等)は、既定タブ(先頭の「相談窓口」)にフォールバックする。
 * age/municipality と異なり、tab の不正値は検索条件そのものではないため空状態には遷移させない。
 */
export function parseCategoryTypeParam(raw: string | undefined): CategoryType {
  if (raw && isCategoryType(raw)) return raw;
  return CATEGORY_TYPES[0];
}
