import { FEEDBACK_COMMENT_MAX_LENGTH, FeedbackResponseSchema } from "@/features/feedback/schema/feedback";
import type { FeedbackRating, FeedbackSource, FeedbackUnclearReason } from "@/features/feedback/schema/feedback";

/**
 * フィードバック収集ウィジェット(支援先一覧・相談メモ完成後の3択評価)の表示用定数。
 *
 * 型・コメント最大文字数・成功応答スキーマは `schema/feedback.ts`(`/api/feedback` の
 * client/server共通 zod スキーマ、"use client" を持たない純粋な zod ファイルのため
 * クライアントから import できる)からそのまま re-export し、重複定義によるドリフトを
 * 避ける。日本語ラベル配列(表示専用、確定コピー)のみこのファイルで独自に持つ。
 */

export type { FeedbackRating, FeedbackSource, FeedbackUnclearReason };

export { FEEDBACK_COMMENT_MAX_LENGTH };

/** `POST /api/feedback` の成功応答スキーマ(`{ ok: true }`)。`schema/feedback.ts` の re-export。 */
export const FeedbackAckSchema = FeedbackResponseSchema;

/** 3択評価ボタンの選択肢(確定コピー)。 */
export const FEEDBACK_RATING_OPTIONS: readonly { value: FeedbackRating; label: string }[] = [
  { value: "clear", label: "分かった" },
  { value: "partial", label: "少し分かった" },
  { value: "unclear", label: "まだ分からない" },
];

/** 「まだ分からない」時の内訳質問の選択肢(確定コピー)。 */
export const FEEDBACK_UNCLEAR_REASON_OPTIONS: readonly { value: FeedbackUnclearReason; label: string }[] = [
  { value: "facility-fit", label: "自分に合う支援先が分からない" },
  { value: "first-step", label: "どこから相談すればよいか分からない" },
  { value: "scheme-diff", label: "制度の違いが分からない" },
  { value: "info-gap", label: "情報が足りない" },
  { value: "other", label: "その他" },
];
