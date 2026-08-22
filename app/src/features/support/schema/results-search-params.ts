import { z } from "zod";

import type { MunicipalityRegistryEntry } from "@/features/support/constants/municipality-registry";
import { AgeGroupSchema } from "@/features/support/schema/age-group";
import type { AgeGroup } from "@/features/support/schema/age-group";
import { MunicipalityEntrySchema } from "@/features/support/schema/municipality-param";

// 支援情報案内画面(/support/results, TICKET-0015)の検索クエリ検証。
//
// age・municipality は「検索が成立するかどうか」を左右する必須条件であるため Zod で厳格に
// 検証し、不正・欠損の場合は呼び出し側(app/support/results/page.tsx)が検索自体を行わず
// /support への差し戻し導線を持つ空状態を表示する(全入力データを Zod で検証する方針による)。
//
// tags は既存の parseSupportTagsParam(TICKET-0014, 未知の値を黙って除外する寛容な実装)を
// そのまま再利用する。URL 改ざん等で未知のタグが1つ混入しただけで検索結果画面全体を
// 空状態にしてしまうと、他の正しいタグでの検索まで妨げてしまうため、age/municipality とは
// 異なり本スキーマでは検証しない(意図的に非対称な設計とする)。

export const ResultsSearchParamsSchema = z.object({
  age: AgeGroupSchema,
  municipality: MunicipalityEntrySchema,
});

export interface ResultsSearchParams {
  age: AgeGroup;
  municipality: MunicipalityRegistryEntry;
}

export type ParseResultsSearchParamsResult = { success: true; data: ResultsSearchParams } | { success: false };

/**
 * `searchParams` の `age` / `municipality` 生値を検証する純関数。
 * Next.js の `searchParams` は `string | string[] | undefined` を取り得るため、配列(同名クエリ
 * の重複指定)は検証対象とせずそのまま不正値として扱う(安全側)。
 */
export function parseResultsSearchParams(raw: {
  age?: string | string[];
  municipality?: string | string[];
}): ParseResultsSearchParamsResult {
  if (Array.isArray(raw.age) || Array.isArray(raw.municipality)) {
    return { success: false };
  }

  const result = ResultsSearchParamsSchema.safeParse({
    age: raw.age,
    municipality: raw.municipality,
  });

  if (!result.success) return { success: false };
  return { success: true, data: result.data };
}
