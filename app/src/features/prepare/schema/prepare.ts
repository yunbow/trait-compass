import { z } from "zod";

import { AgeGroupSchema } from "@/features/support/schema/age-group";
import { MunicipalityEntrySchema } from "@/features/support/schema/municipality-param";
import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";
import { TOP_CATEGORIES_MAX_LENGTH } from "@/features/ai-summary/schema/summarize";
import { CategoryKeySchema } from "@/features/survey/schema/question";
import {
  PREPARE_ACCOMMODATION_TAGS,
  PREPARE_CONSULT_PURPOSE_VALUES,
  PREPARE_CONTACT_METHOD_VALUES,
  PREPARE_DURATION_VALUES,
  PREPARE_LIFE_STATUS_VALUES,
  PREPARE_PRIOR_SUPPORT_TAGS,
  PREPARE_SITUATION_TAGS,
} from "@/features/prepare/constants/prepare-options";

// `/api/prepare`(TICKET-0046)のリクエスト/レスポンス zod スキーマ。
// client(PreparePanel)/server(app/api/prepare/route.ts)で同一スキーマを使う
// (client/server 共通 Zod スキーマとして、summarize.ts/recommend.ts と同じ方針)。
//
// 自由記述フィールドは一切持たない(AC-2、既存の危機介入回避構造の維持)。すべて既存の
// ホワイトリスト(CategoryKeySchema・SUPPORT_TAGS・AgeGroupSchema・自治体レジストリ)で検証する。

/** 相談メモに添付する窓口候補の最大件数。 */
export const PREPARE_FACILITY_LIMIT = 3;

/**
 * どなたについて相談するか(TICKET-0047)。「自分について/子ども・家族について」の二択(選択式)。
 * 「本人として相談する」だと、内部値が guardian でも年齢層に未就学児等を選べてしまい
 * 「本人=未就学児」という矛盾した見え方になっていたため、値(self/guardian)は維持したまま
 * 表示ラベルを見直した(P0対応)。自由記述は増やさず、既定は "self"(自分について)。
 */
export const PREPARE_RELATIONSHIP_VALUES = ["self", "guardian"] as const;
export const PrepareRelationshipSchema = z.enum(PREPARE_RELATIONSHIP_VALUES);
export type PrepareRelationship = z.infer<typeof PrepareRelationshipSchema>;

/** 画面表示用ラベル。表示順もこのまま採用する(自分→子ども・家族)。 */
export const PREPARE_RELATIONSHIP_OPTIONS: { value: PrepareRelationship; label: string }[] = [
  { value: "self", label: "自分について" },
  { value: "guardian", label: "子ども・家族について" },
];

export const PrepareRequestSchema = z.object({
  /** 結果画面で高めに出た上位カテゴリ(AiSummarySection/ExplainRequestSchema と同じ既定件数)。 */
  topCategories: z.array(CategoryKeySchema).max(TOP_CATEGORIES_MAX_LENGTH),
  /** 選択式の困りごとタグ(複数選択、既存の相談分野タグ語彙を再利用、AC-1)。 */
  tags: z.array(z.enum(SUPPORT_TAGS)).max(SUPPORT_TAGS.length),
  age: AgeGroupSchema,
  /** 元の年齢選択(5区分ライフステージ)。任意(既存/古いクライアントとの後方互換性のため)。
   *  age(粗い年齢区分)による D1 検索の絞り込みは維持しつつ、指定時は facility-search.ts の
   *  lifestageFilterClause により lifestage_min/max の細分絞り込みも適用される。未指定時は
   *  対象年齢帯が明示されている施設(lifestage_min/max 設定済み)を安全側で除外する
   *  (2026-08是正、旧URL・旧クライアント互換のため API 自体は必須化しない)。AIプロンプトへの
   *  文脈提供にも使う。 */
  lifestage: z.enum(LIFESTAGE_VALUES).optional(),
  municipality: MunicipalityEntrySchema,
  /** 相談する立場(TICKET-0047)。未指定時は "self" にフォールバックする。 */
  relationship: PrepareRelationshipSchema.default("self"),
  // 以下、相談メモ追加項目(選択式7フィールド)。既存クライアントとの後方互換性のため、
  // すべて省略可能にする(UIフォーム・プロンプトへの反映は別タスク)。自由記述フィールドは
  // 一切追加しない(AC-2 の維持、@/features/prepare/constants/prepare-options.ts 参照)。
  /** 困っている場面(複数選択可)。未指定時は空配列。 */
  situations: z.array(z.enum(PREPARE_SITUATION_TAGS)).max(PREPARE_SITUATION_TAGS.length).default([]),
  /** いつから困っているか(単一選択、任意)。 */
  duration: z.enum(PREPARE_DURATION_VALUES).optional(),
  /** 現在の生活・就労・就学状況(単一選択、任意)。 */
  lifeStatus: z.enum(PREPARE_LIFE_STATUS_VALUES).optional(),
  /** 相談したい内容(単一選択、任意)。 */
  consultPurpose: z.enum(PREPARE_CONSULT_PURPOSE_VALUES).optional(),
  /** 希望する連絡方法(単一選択、任意)。 */
  contactMethod: z.enum(PREPARE_CONTACT_METHOD_VALUES).optional(),
  /** 配慮事項(複数選択可)。未指定時は空配列。 */
  accommodations: z.array(z.enum(PREPARE_ACCOMMODATION_TAGS)).max(PREPARE_ACCOMMODATION_TAGS.length).default([]),
  /** これまで利用した支援(複数選択可)。未指定時は空配列。 */
  priorSupport: z.array(z.enum(PREPARE_PRIOR_SUPPORT_TAGS)).max(PREPARE_PRIOR_SUPPORT_TAGS.length).default([]),
});

/** 相談メモに添付する窓口候補1件分。事実情報はすべて D1 由来の値のみ(fact-guard 方針)。 */
export const PrepareFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  municipality: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  sourceCredit: z.string(),
  sourceUrl: z.string().nullable(),
  /**
   * 掲載内容の確認状態(migration 0034、facility-search.ts の `ConfirmationStatus` と同じ3値)。
   * NULL は「未確認」ではなく、CKAN/オープンデータ由来でこの概念自体を持たない施設を表す
   * (混同しないこと。通常検索カード FacilityCard と同じ意味で、相談メモでも取りこぼさず
   * 引き継ぐ、外部レビュー指摘対応)。
   */
  confirmationStatus: z.enum(["confirmed", "unconfirmed", "phone_required"]).nullable(),
  /** confirmationStatus="confirmed" の場合の確認日(YYYY-MM-DD)。値が無い場合は null。 */
  confirmedOn: z.string().nullable(),
});
export type PrepareFacility = z.infer<typeof PrepareFacilitySchema>;

export const PrepareResponseSchema = z.object({
  /** 困りごと要約(LLM生成、出力ガード適用済み)。 */
  summary: z.string().min(1),
  /** 伝えるとよいことチェックリスト(決定的テンプレートで組み立て、LLMを介さない)。 */
  checklist: z.array(z.string()).min(1),
  /** 当日の流れ/持ち物(決定的テンプレート)。 */
  flow: z.array(z.string()).min(1),
  /** 聞いておきたいこと候補(決定的テンプレート)。 */
  questions: z.array(z.string()).min(1),
  /** 該当する窓口候補(D1 由来、最大 PREPARE_FACILITY_LIMIT 件)。 */
  facilities: z.array(PrepareFacilitySchema),
  /** true の場合、区市町村データ欠損等により広域窓口へのフォールバック表示をしている(FR-022)。 */
  isFallback: z.boolean(),
  fallbackMessage: z.string().nullable(),
});
export type PrepareResponse = z.infer<typeof PrepareResponseSchema>;
