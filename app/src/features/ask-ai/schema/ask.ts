import { z } from "zod";

import {
  FACILITY_QUESTION_IDS,
  INSTITUTION_QUESTION_IDS,
  SCHOOL_QUESTION_IDS,
} from "@/features/ask-ai/services/preset-questions";

// `/api/ask`(TICKET-0048)のリクエスト/レスポンス zod スキーマ。
// client(AskAiPanel)/server(app/api/ask/route.ts)で同一スキーマを使う
// (validation.md「client/server 共通 Zod スキーマ」、既存の summarize.ts/prepare.ts と同じ方針)。
//
// 自由記述フィールドは一切持たない(AC-2)。`questionId` は定型質問マスタ
// (services/preset-questions.ts)のホワイトリストで検証し、自由文字列を許可しない。
// `targetType` によって要求されるフィールドが変わるため discriminatedUnion で表現する
// (facility: facilityId 必須、institution: facilityId 不要、school: schoolId 必須)。

export const AskRequestSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("facility"),
    questionId: z.enum(FACILITY_QUESTION_IDS),
    /** 質問対象の窓口(D1 `facilities.id`)。事実情報はすべてこの id を起点に D1 から取得する。 */
    facilityId: z.string().min(1),
  }),
  z.object({
    targetType: z.literal("institution"),
    questionId: z.enum(INSTITUTION_QUESTION_IDS),
  }),
  z.object({
    targetType: z.literal("school"),
    questionId: z.enum(SCHOOL_QUESTION_IDS),
    /** 質問対象の学校(D1 `schools.id`)。事実情報はすべてこの id を起点に D1 から取得する。 */
    schoolId: z.string().min(1),
  }),
]);

/** 出典1件分(FR-026, NFR-54)。SourceCredit コンポーネントへそのまま渡せる形。 */
export const AskSourceSchema = z.object({
  credit: z.string(),
  sourceUrl: z.string().nullable(),
});
export type AskSource = z.infer<typeof AskSourceSchema>;

export const AskResponseSchema = z.object({
  answer: z.string().min(1),
  /**
   * 回答の根拠となった出典(AC-3)。`isFallback=false` の場合は route.ts 側で必ず1件以上を
   * 詰める(出典表示必須)。`isFallback=true`(根拠データ不足)の場合のみ空配列を許容する。
   */
  sources: z.array(AskSourceSchema),
  /** true の場合、根拠データ不足(TICKET-0049 の低リスクデータ未整備等)により定型の案内文を返している。 */
  isFallback: z.boolean(),
  fallbackMessage: z.string().nullable(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;
