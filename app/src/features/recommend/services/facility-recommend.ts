// RAG 施設レコメンド(TICKET-0023, FR-042)の純関数群。
//
// D1/VectorStore/LlmClient への実アクセスを含まないため、ユニットテストで担保する(NFR-72)。
// app/api/recommend/route.ts はこれらの関数を組み合わせてオーケストレーションを行うのみとし、
// 分岐ロジック自体はここに閉じ込める。

import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { CategoryType } from "@/features/support/constants/category-types";
import { formatSourceCredit, riskLevelToDisplayMode, truncateForSummary } from "@/features/support/services/facility-display";
import type { FacilitySearchResult, FacilityRow, FacilityWithTags } from "@/features/support/services/facility-search";

import type { RecommendFacility } from "@/features/recommend/schema/recommend";

/**
 * `ids`(VectorStore 検索結果のスコア順)の順序を保ったまま、D1 から再取得した行を並べ替える。
 * D1 の `WHERE id IN (...)` は順序を保証しないため、呼び出し側でスコア順を復元する必要がある。
 * D1 側の絞り込み(is_medical/age/municipality)で除外された id は結果に含まれない
 * (`byId.get` が undefined を返すため自然に除外される)。
 */
export function reorderFacilitiesByIds<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

/**
 * D1 の事実情報(FacilityRow)を、レコメンドレスポンス用の形へ変換する純関数。
 * `aiNote` 以外のすべてのフィールドは D1 の値をそのまま使う(FR-042 AC-2)。
 * リスク区分に応じた表示モード出し分け(FR-027)は facility-display.ts の既存ロジックを再利用する。
 */
export function toRecommendFacility(row: FacilityRow, aiNote: string | null): RecommendFacility {
  const mode = riskLevelToDisplayMode(row.riskLevel);

  return {
    id: row.id,
    name: row.name,
    municipality: row.municipality,
    categoryType: row.categoryType,
    address: mode === "full" ? row.address : null,
    phone: mode === "full" ? row.phone : null,
    summary: row.description === null ? null : mode === "full" ? row.description : truncateForSummary(row.description),
    url: row.url,
    sourceCredit: formatSourceCredit(row),
    sourceUrl: row.sourceUrl,
    aiNote,
  };
}

/**
 * ベクトル検索・LLM が使えない場合のグレースフルフォールバック(タグベース検索結果、
 * `src/features/support/services/facility-search.ts` の `searchFacilities` の出力)を、
 * レコメンドレスポンス用の一覧に変換する純関数。`aiNote` は常に null。
 *
 * `facilitiesByCategory` はすでにタグ一致優先でソート済み(`sortByTagPriority`)なので、
 * カテゴリの掲載順(CATEGORY_TYPES)で連結したうえで `limit` 件に切り詰める。
 */
export function buildFallbackFacilities(searchResult: FacilitySearchResult, limit: number): RecommendFacility[] {
  const flattened: FacilityWithTags[] = CATEGORY_TYPES.flatMap(
    (type: CategoryType) => searchResult.facilitiesByCategory[type],
  );
  return flattened.slice(0, limit).map((row) => toRecommendFacility(row, null));
}
