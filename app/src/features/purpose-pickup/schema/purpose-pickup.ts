import { z } from "zod";

import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";

// `/api/purpose-pickup`(目的選択画面「それ以外」の自由記述からの目的ピックアップ)の
// リクエスト/レスポンス zod スキーマ。client/server で同一スキーマを使う
// (client/server 共通 Zod スキーマとして、recommend.ts と同じ方針)。
//
// municipality は今回のマッチング処理(自由記述 → 目的ID)には使わないため、
// リクエストスキーマに含めない(recommend.ts と異なる点)。

/** 困りごとの自由記述の最大文字数(recommend の RECOMMEND_QUERY_MAX_LENGTH と同じ考え方)。 */
export const PURPOSE_PICKUP_FREE_TEXT_MAX_LENGTH = 500;

export const PurposePickupRequestSchema = z.object({
  freeText: z.string().trim().min(1, "困りごとを入力してください。").max(PURPOSE_PICKUP_FREE_TEXT_MAX_LENGTH),
  lifestage: z.enum(LIFESTAGE_VALUES),
});

export const PurposePickupResponseSchema = z.object({
  /**
   * マッチした目的の id(`PURPOSE_OPTIONS_BY_LIFESTAGE` の要素の id)。
   * マッチ無し・AI 機能停止中・危機介入時は null(グレースフルフォールバック)。
   */
  matchedPurposeId: z.string().nullable(),
  isAiEnabled: z.boolean(),
  /** true の場合、危機介入ガード(FR-044)により AI 生成をスキップしている。 */
  isCrisisResponse: z.boolean(),
});
export type PurposePickupResponse = z.infer<typeof PurposePickupResponseSchema>;
