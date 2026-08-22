import { z } from "zod";

/**
 * 全10カテゴリの key(app/src/data/questions.json の各設問の category フィールドに対応)。
 * 掲載順(= P0 出題順)を保持する。
 */
export const CATEGORY_KEYS = [
  "communication",
  "social-reading",
  "emotion-regulation",
  "impulse-memory",
  "executive-function",
  "kindness-misread",
  "sensory",
  "motor",
  "learning",
  "restricted-repetitive",
] as const;

export const CategoryKeySchema = z.enum(CATEGORY_KEYS);
export type CategoryKey = z.infer<typeof CategoryKeySchema>;

/**
 * 元データ(`manga-neurodivergent-fact`)の `nd_traits` に対応する関連特性の key。
 * `gray-zone` は trait スコアには含めないため、Question では `grayZone: boolean` として
 * 別フィールドに分離する(FR-011 のスコアリング仕様と整合)。
 */
export const TRAIT_KEYS = ["ASD", "ADHD", "LD", "DCD"] as const;

export const TraitKeySchema = z.enum(TRAIT_KEYS);
export type TraitKey = z.infer<typeof TraitKeySchema>;

export const QuestionSchema = z.object({
  id: z.string().regex(/^ND-\d{4}$/, "id は ND-#### 形式である必要があります"),
  text: z.string().min(1),
  category: CategoryKeySchema,
  traits: z.array(TraitKeySchema),
  grayZone: z.boolean(),
});
export type Question = z.infer<typeof QuestionSchema>;

/**
 * 回答値の3件法(FR-012): よくある=2 / ときどき=1 / ない=0。
 */
export const AnswerValueSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
