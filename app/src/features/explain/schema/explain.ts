import { z } from "zod";

import { TOP_CATEGORIES_MAX_LENGTH } from "@/features/ai-summary/schema/summarize";
import { CategoryKeySchema } from "@/features/survey/schema/question";

// `/api/explain`(TICKET-0023, FR-043)のリクエスト/レスポンス zod スキーマ。
// client(CategoryExplainSection)/server(app/api/explain/route.ts)で同一スキーマを使う
// (client/server 共通 Zod スキーマとして、summarize.ts と同じ方針)。
//
// 送信するのはカテゴリ key(ホワイトリスト)のみで、自由記述・回答値・スコアは一切含まない
// (結果画面のプレビューでも「カテゴリ名のみ」と明示する)。
// `TOP_CATEGORIES_MAX_LENGTH` は AiSummarySection の上位カテゴリ件数(3)と同じ既定件数を
// 再利用する(結果画面の上位カテゴリ解説は常に最大3件のため)。

export const ExplainRequestSchema = z.object({
  topCategories: z.array(CategoryKeySchema).min(1, "上位カテゴリがありません。").max(TOP_CATEGORIES_MAX_LENGTH),
});

export const ExplainResponseSchema = z.object({
  explanation: z.string().min(1),
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
