import type { ClosureStatus, ReportCategory } from "@/features/facility-report/schema/facility-report";
import type { ReportCategoryOption } from "@/lib/report-form/report-category-option";

// 掲載情報の誤り報告(TICKET-0064)の選択肢マスタ。表示順もこの配列順を採用する。

export type FacilityReportCategoryOption = ReportCategoryOption<ReportCategory>;

export const FACILITY_REPORT_CATEGORY_OPTIONS: FacilityReportCategoryOption[] = [
  { value: "phone", label: "電話番号が違う・つながらない" },
  { value: "address", label: "所在地や地図が違う" },
  { value: "content", label: "受付時間・対象・相談方法などの内容が違う" },
  { value: "closure", label: "閉鎖・移転・名称変更している" },
  { value: "link", label: "リンク先が開かない・内容が違う" },
  { value: "unclear", label: "説明が分かりにくい・誤解しやすい" },
  { value: "other", label: "その他" },
];

export interface ClosureStatusOption {
  value: ClosureStatus;
  label: string;
}

export const CLOSURE_STATUS_OPTIONS: ClosureStatusOption[] = [
  { value: "closed", label: "閉鎖している" },
  { value: "moved", label: "移転している" },
  { value: "renamed", label: "名称が変わっている" },
  { value: "merged", label: "別の施設に統合された" },
  { value: "unknown-mismatch", label: "分からないが掲載内容と異なる" },
];
