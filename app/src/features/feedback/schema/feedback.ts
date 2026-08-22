import { z } from "zod";

// `/api/feedback` のリクエスト zod スキーマ。client(feedback/components 側フォーム)/
// server(app/api/feedback/route.ts)で同一スキーマを使う(client/server 共通
// Zod スキーマとして、facility-report.ts と同じ方針)。
//
// 支援先一覧「このページで、次に何をすればよいか分かりましたか?」の3択評価+「まだ分からない」
// 時の内訳+任意の一言コメント(公開許可付き)を送信する。プライバシー最小主義(NFR-31〜33)を
// 厳守するため、3択評価・内訳は日付×選択肢の集計カウンタのみに還元し行レベル記録を持たない
// (kind: "rating" / "unclear-reason")。コメントのみ自由記述文そのものを保持する
// (kind: "comment")。この3種は1リクエストにつき1件のみを送る設計とし、discriminated union で
// 判別する。

export const FEEDBACK_SOURCES = ["support-results", "result-prepare"] as const;
export const FeedbackSourceSchema = z.enum(FEEDBACK_SOURCES);
export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;

export const FEEDBACK_RATINGS = ["clear", "partial", "unclear"] as const;
export const FeedbackRatingSchema = z.enum(FEEDBACK_RATINGS);
export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>;

export const FEEDBACK_UNCLEAR_REASONS = ["facility-fit", "first-step", "scheme-diff", "info-gap", "other"] as const;
export const FeedbackUnclearReasonSchema = z.enum(FEEDBACK_UNCLEAR_REASONS);
export type FeedbackUnclearReason = z.infer<typeof FeedbackUnclearReasonSchema>;

export const FEEDBACK_COMMENT_MIN_LENGTH = 1;
export const FEEDBACK_COMMENT_MAX_LENGTH = 500;

const FeedbackRatingRequestSchema = z
  .object({
    kind: z.literal("rating"),
    source: FeedbackSourceSchema,
    rating: FeedbackRatingSchema,
  })
  .strict();

const FeedbackUnclearReasonRequestSchema = z
  .object({
    kind: z.literal("unclear-reason"),
    source: FeedbackSourceSchema,
    reason: FeedbackUnclearReasonSchema,
  })
  .strict();

const FeedbackCommentRequestSchema = z
  .object({
    kind: z.literal("comment"),
    source: FeedbackSourceSchema,
    commentText: z.string().trim().min(FEEDBACK_COMMENT_MIN_LENGTH).max(FEEDBACK_COMMENT_MAX_LENGTH),
    publishConsent: z.boolean(),
    // ハニーポット。非空なら保存せず ok を返す(bot対策、facility-report.ts と同じ方針)。
    website: z.string().max(500).optional(),
  })
  .strict();

export const FeedbackRequestSchema = z.discriminatedUnion("kind", [
  FeedbackRatingRequestSchema,
  FeedbackUnclearReasonRequestSchema,
  FeedbackCommentRequestSchema,
]);

export type FeedbackRatingRequest = z.infer<typeof FeedbackRatingRequestSchema>;
export type FeedbackUnclearReasonRequest = z.infer<typeof FeedbackUnclearReasonRequestSchema>;
export type FeedbackCommentRequest = z.infer<typeof FeedbackCommentRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({ ok: z.literal(true) });
