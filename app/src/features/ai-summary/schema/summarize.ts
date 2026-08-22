import { z } from "zod";

import { CategoryKeySchema } from "@/features/survey/schema/question";

// `/api/summarize`(TICKET-0022)のリクエスト/レスポンス zod スキーマ。
// client(AiSummarySection)/server(app/api/summarize/route.ts)で同一スキーマを使う
// (client/server 共通 Zod スキーマ)。
//
// topCategories はカテゴリ key のホワイトリスト(CategoryKeySchema, 10種の enum)で検証する。
// 自由文字列を許可すると任意の文字列がプロンプトへ混入するため、必ず enum を通す。

/** 自由記述の最大文字数。結果画面の任意入力欄・リクエストボディ双方で共有する。 */
export const FREE_TEXT_MAX_LENGTH = 2000;

/** 上位カテゴリの最大送信件数(ResultView の上位カテゴリ解説と同じ既定件数)。 */
export const TOP_CATEGORIES_MAX_LENGTH = 3;

export const SummarizeRequestSchema = z.object({
  freeText: z.string().trim().min(1, "困りごとの入力内容が空です。").max(FREE_TEXT_MAX_LENGTH),
  topCategories: z.array(CategoryKeySchema).max(TOP_CATEGORIES_MAX_LENGTH),
});

export const SummarizeResponseSchema = z.object({
  summary: z.string().min(1),
  /** 危機介入ガード(FR-044)により、要約ではなく相談窓口案内を返した場合に true。 */
  isCrisisResponse: z.boolean(),
});
export type SummarizeResponse = z.infer<typeof SummarizeResponseSchema>;
