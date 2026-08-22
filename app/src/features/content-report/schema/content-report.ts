import { z } from "zod";

import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import { MunicipalityEntrySchema } from "@/features/support/schema/municipality-param";
import { LifestageSchema } from "../../../../../data/manual/schema/municipality.schema";

// `ResultsTab`(results-tabs.ts)の実体は `CategoryType | "学校情報"`。`RESULTS_TAB_ORDER` は
// `readonly ResultsTab[]`(非タプル型)で zod の enum にそのまま渡せないため、同じ値集合を
// `CATEGORY_TYPES`(as const タプル)+ `SCHOOL_INFO_TAB` から組み立て直す。
const RESULTS_TAB_VALUES = [...CATEGORY_TYPES, SCHOOL_INFO_TAB] as const;

// `/api/content-report` のリクエスト/レスポンス zod スキーマ。
// `facility-report/schema/facility-report.ts`(TICKET-0064)と同じ方針
// (client(ContentReportForm)/server(app/api/content-report/route.ts)で同一スキーマを使う、
// validation.md「client/server 共通 Zod スキーマ」)で、対象種別(想定ルート・学校情報・
// 結果の見方ガイド)ごとにカテゴリの許可リスト・必須項目が異なる点を discriminatedUnion で表現する。
//
// facility-report と同じく、このアプリで数少ない利用者投稿の自由記述内容を D1 に永続化する
// 機能のため、保存対象フィールドは最小限(訂正候補・補足の2つ、いずれも最大文字数つき)に絞る。

export const PATHWAY_REPORT_CATEGORY_VALUES = ["contact", "content", "outdated", "link", "unclear", "other"] as const;
export const PathwayReportCategorySchema = z.enum(PATHWAY_REPORT_CATEGORY_VALUES);
export type PathwayReportCategory = z.infer<typeof PathwayReportCategorySchema>;

export const SCHOOL_REPORT_CATEGORY_VALUES = [
  "phone",
  "address",
  "fixed-class",
  "resource-room",
  "school-status",
  "link",
  "unclear",
  "other",
] as const;
export const SchoolReportCategorySchema = z.enum(SCHOOL_REPORT_CATEGORY_VALUES);
export type SchoolReportCategory = z.infer<typeof SchoolReportCategorySchema>;

export const GUIDE_REPORT_CATEGORY_VALUES = ["content", "outdated", "link", "unclear", "other"] as const;
export const GuideReportCategorySchema = z.enum(GUIDE_REPORT_CATEGORY_VALUES);
export type GuideReportCategory = z.infer<typeof GuideReportCategorySchema>;

export const CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH = 200;
export const CONTENT_REPORT_DETAIL_MAX_LENGTH = 500;

// `targetLabel` はあえてリクエストスキーマに含めない: クライアントが表示している対象名を
// サーバーが信用して保存する設計にはしない。route.ts は targetId(pathway/school)または
// municipality+tab(guide)から D1/ソースコードを再取得し、対象の表示名(purposeLabel/学校名/
// ガイド見出し)をサーバー側で独立に導出する(facility-report の facilityId 再取得と同じ方針)。
const baseFields = {
  correctedValue: z.string().trim().max(CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH).optional(),
  detailText: z.string().trim().max(CONTENT_REPORT_DETAIL_MAX_LENGTH).optional(),
  // ハニーポット。非空なら保存せず ok を返す(bot対策)。
  website: z.string().max(500).optional(),
};

export const ContentReportRequestSchema = z
  .discriminatedUnion("targetType", [
    z
      .object({
        targetType: z.literal("pathway"),
        targetId: z.string().min(1).max(64),
        category: PathwayReportCategorySchema,
        ...baseFields,
      })
      .strict(),
    z
      .object({
        targetType: z.literal("school"),
        targetId: z.string().min(1).max(64),
        category: SchoolReportCategorySchema,
        ...baseFields,
      })
      .strict(),
    z
      .object({
        targetType: z.literal("guide"),
        municipality: MunicipalityEntrySchema,
        tab: z.enum(RESULTS_TAB_VALUES),
        lifestage: LifestageSchema.nullable(),
        category: GuideReportCategorySchema,
        ...baseFields,
      })
      .strict(),
  ])
  .superRefine((data, ctx) => {
    const requiresDetail =
      data.category === "unclear" || data.category === "other" || data.category === "school-status";
    if (requiresDetail && (data.detailText === undefined || data.detailText.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["detailText"],
        message: "どの部分に問題があるか入力してください。",
      });
    }
  });

export const ContentReportResponseSchema = z.object({ ok: z.literal(true) });

/**
 * `ContentReportForm`(`/support/content-report`)が表示に使う対象データの最小形。
 * `ReportableFacility`(facility-report/schema/facility-report.ts)と同じ考え方で、
 * ページ(page.tsx)が検索結果一覧の表示用データを流用せず、この専用の狭い型で受け渡す。
 */
export interface ReportablePathway {
  id: string;
  purposeLabel: string;
  municipality: string;
}

export interface ReportableSchool {
  id: string;
  name: string;
  municipality: string;
  level: string;
}

export interface ReportableGuide {
  municipality: string;
  tab: string;
  lifestage: string | null;
  heading: string;
}
