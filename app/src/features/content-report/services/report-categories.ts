import type {
  GuideReportCategory,
  PathwayReportCategory,
  SchoolReportCategory,
} from "@/features/content-report/schema/content-report";
import type { ReportCategoryOption } from "@/lib/report-form/report-category-option";

// 掲載情報の訂正・更新報告(想定ルート・学校情報・結果の見方ガイド)の選択肢マスタ。
// `facility-report/services/report-categories.ts` と同じ方針で、表示順もこの配列順を採用する。

export type ContentReportCategoryOption<T extends string> = ReportCategoryOption<T>;

export const PATHWAY_REPORT_CATEGORY_OPTIONS: ContentReportCategoryOption<PathwayReportCategory>[] = [
  { value: "contact", label: "窓口・連絡先が違う・つながらない" },
  { value: "content", label: "手続きの内容や順番が実際と違う" },
  { value: "outdated", label: "掲載情報が古い・内容が更新されている" },
  { value: "link", label: "出典リンクが開かない・内容が違う" },
  { value: "unclear", label: "説明が分かりにくい・誤解しやすい" },
  { value: "other", label: "その他" },
];

export const SCHOOL_REPORT_CATEGORY_OPTIONS: ContentReportCategoryOption<SchoolReportCategory>[] = [
  { value: "phone", label: "電話番号が違う・つながらない" },
  { value: "address", label: "所在地や地図が違う" },
  { value: "fixed-class", label: "固定学級(特別支援学級)の情報が違う" },
  { value: "resource-room", label: "特別支援教室(通級)の情報が違う" },
  { value: "school-status", label: "閉校・統合・名称変更している" },
  { value: "link", label: "リンク先が開かない・内容が違う" },
  { value: "unclear", label: "説明が分かりにくい・誤解しやすい" },
  { value: "other", label: "その他" },
];

export const GUIDE_REPORT_CATEGORY_OPTIONS: ContentReportCategoryOption<GuideReportCategory>[] = [
  { value: "content", label: "内容が実際の制度・手続きと違う" },
  { value: "outdated", label: "情報が古くなっている" },
  { value: "link", label: "出典リンクが開かない・内容が違う" },
  { value: "unclear", label: "説明が分かりにくい・誤解しやすい" },
  { value: "other", label: "その他" },
];

/** 補足(detailText)の入力が必須になるカテゴリ(対象種別を問わず共通)。 */
export const CONTENT_REPORT_MANDATORY_DETAIL_CATEGORIES: readonly string[] = ["unclear", "other", "school-status"];

/** 「正しいと思われる内容」(correctedValue)の入力欄を表示するカテゴリ(対象種別を問わず共通)。 */
export const CONTENT_REPORT_CORRECTED_VALUE_CATEGORIES: readonly string[] = [
  "contact",
  "phone",
  "address",
  "fixed-class",
  "resource-room",
  "link",
  "content",
];
