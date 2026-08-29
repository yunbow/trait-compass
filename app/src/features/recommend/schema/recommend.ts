import { z } from "zod";

import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import { AgeGroupSchema } from "@/features/support/schema/age-group";
import { MunicipalityEntrySchema } from "@/features/support/schema/municipality-param";
import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";

// `/api/recommend`(TICKET-0023)のリクエスト/レスポンス zod スキーマ。
// client/server で同一スキーマを使う(client/server 共通 Zod スキーマとして、
// src/features/ai-summary/schema/summarize.ts と同じ方針)。
//
// municipality はレジストリでコードまたは旧名称から解決して検証する
// (results-search-params.ts と同じ方針。自由文字列を許可すると SQL の municipality 一致条件が
// 無意味な値でも通ってしまう)。tags も SUPPORT_TAGS のホワイトリストで検証する。

/** 相談したい内容の自由文の最大文字数。 */
export const RECOMMEND_QUERY_MAX_LENGTH = 500;

/** VectorStore.query の topK(ticket 記載の固定値)。 */
export const RECOMMEND_TOP_K = 10;

export const RecommendRequestSchema = z.object({
  query: z.string().trim().min(1, "相談したい内容を入力してください。").max(RECOMMEND_QUERY_MAX_LENGTH),
  age: AgeGroupSchema,
  /** 元の年齢選択(5区分ライフステージ)。任意(既存/古いクライアントとの後方互換性のため)。
   *  age(粗い年齢区分)による D1 検索の絞り込みは維持しつつ、指定時は facility-search.ts の
   *  lifestageFilterClause により lifestage_min/max の細分絞り込みも適用される。未指定時は
   *  対象年齢帯が明示されている施設(lifestage_min/max 設定済み)を安全側で除外する
   *  (2026-08是正、旧URL・旧クライアント互換のため API 自体は必須化しない)。AIプロンプトへの
   *  文脈提供にも使う。 */
  lifestage: z.enum(LIFESTAGE_VALUES).optional(),
  municipality: MunicipalityEntrySchema,
  tags: z.array(z.enum(SUPPORT_TAGS)).max(SUPPORT_TAGS.length).optional(),
});

/**
 * レスポンスの施設1件分。事実情報(name/municipality/address/phone/url/sourceCredit/sourceUrl)は
 * すべて D1 の値をそのまま返す(FR-042 AC-2)。`aiNote` のみが LLM 生成の理由文であり、
 * 生成失敗・ガード抵触・LLM/ベクトル未設定時は null になる(グレースフルフォールバック)。
 */
export const RecommendFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  municipality: z.string(),
  categoryType: z.enum(CATEGORY_TYPES),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  summary: z.string().nullable(),
  url: z.string().nullable(),
  sourceCredit: z.string(),
  sourceUrl: z.string().nullable(),
  /** LLM 生成の「この施設が合いそうな理由」。事実情報は含まれない想定(FR-042 AC-2)。 */
  aiNote: z.string().nullable(),
});
export type RecommendFacility = z.infer<typeof RecommendFacilitySchema>;

export const RecommendResponseSchema = z.object({
  facilities: z.array(RecommendFacilitySchema),
  /** true の場合、ベクトル検索(RAG)経路が使われている(aiNote が生成され得る)。 */
  isAiEnabled: z.boolean(),
  /** true の場合、区市町村データ欠損等により広域窓口へのフォールバック表示をしている(FR-022, AC-7)。 */
  isFallback: z.boolean(),
  fallbackMessage: z.string().nullable(),
  /** true の場合、危機介入ガード(FR-044)により AI 生成をスキップし、一般相談窓口案内を返している。 */
  isCrisisResponse: z.boolean(),
});
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
