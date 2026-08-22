import { z } from "zod";

// `/api/facility-report`(TICKET-0064)のリクエスト/レスポンス zod スキーマ。
// client(FacilityReportForm)/server(app/api/facility-report/route.ts)で同一スキーマを使う
// (client/server 共通 Zod スキーマとして、prepare.ts/recommend.ts と同じ方針)。
//
// このアプリで初めて利用者投稿の自由記述内容を D1 に永続化する機能。他の AI 機能はリクエスト
// 内容を一切ログ・保存しない設計のため、本スキーマは意図的な例外であることを踏まえ、
// 保存対象フィールドを最小限(訂正候補・補足の2つ、いずれも最大文字数つき)に絞る。

export const REPORT_CATEGORY_VALUES = ["phone", "address", "content", "closure", "link", "unclear", "other"] as const;
export const ReportCategorySchema = z.enum(REPORT_CATEGORY_VALUES);
export type ReportCategory = z.infer<typeof ReportCategorySchema>;

export const CLOSURE_STATUS_VALUES = ["closed", "moved", "renamed", "merged", "unknown-mismatch"] as const;
export const ClosureStatusSchema = z.enum(CLOSURE_STATUS_VALUES);
export type ClosureStatus = z.infer<typeof ClosureStatusSchema>;

export const FACILITY_REPORT_CORRECTED_VALUE_MAX_LENGTH = 200;
export const FACILITY_REPORT_DETAIL_MAX_LENGTH = 500;

export const FacilityReportRequestSchema = z
  .object({
    facilityId: z.string().trim().min(1).max(64),
    category: ReportCategorySchema,
    closureStatus: ClosureStatusSchema.optional(),
    correctedValue: z.string().trim().max(FACILITY_REPORT_CORRECTED_VALUE_MAX_LENGTH).optional(),
    detailText: z.string().trim().max(FACILITY_REPORT_DETAIL_MAX_LENGTH).optional(),
    // ハニーポット。非空なら保存せず ok を返す(bot対策)。
    website: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.category === "closure" && data.closureStatus === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["closureStatus"],
        message: "現在の状況を選択してください。",
      });
    }
    if (data.category !== "closure" && data.closureStatus !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["closureStatus"],
        message: "closure 以外では closureStatus を指定できません。",
      });
    }
    if (data.category === "unclear" || data.category === "other") {
      if (data.detailText === undefined || data.detailText.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["detailText"],
          message: "どの部分に問題があるか入力してください。",
        });
      }
    }
  });

export const FacilityReportResponseSchema = z.object({ ok: z.literal(true) });

/**
 * `FacilityReportForm`(`/support/facility-report`)が表示に使う施設データの最小形。
 * ページ(page.tsx)は検索結果一覧(FacilityDisplayData)が持つ検索文脈のフィールド
 * (matchesTags/facilitySubtype/sourceCredit 等)を持たない・持つ必要がないため、
 * `FacilityDisplayData` を流用せずこの専用の狭い型を使う。フィールド名・null 許容は
 * `FacilityDisplayData` の対応フィールドと揃えている(mode="summary" 時の
 * 住所・電話 null 化ルールも同様に適用する、facility-display.ts 参照)。
 */
export interface ReportableFacility {
  id: string;
  name: string;
  municipality: string;
  phone: string | null;
  address: string | null;
  url: string | null;
  summary: string | null;
}
