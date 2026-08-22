// 相談準備アシスタント(TICKET-0046)の窓口候補組み立て。
//
// 窓口特定は既存 `searchFacilities`(TICKET-0015、年齢区分+区市町村+困りごとタグ)をそのまま
// 再利用する(route.ts 側でオーケストレーションする)。本ファイルは、その結果から相談メモに
// 添付する窓口候補(「相談窓口」分類、タグ一致優先で上位数件)を選び、事実情報のみを
// PrepareFacility へ変換する純関数を提供する。
//
// D1 アクセスを含まないため、ユニットテストで担保する(NFR-72)。事実情報(name/municipality/
// address/phone/url/sourceCredit/sourceUrl)はすべて D1 由来の値をそのまま使う
// (fact-guard 方針、TICKET-0023 と同じ多層防御の考え方)。

import { formatSourceCredit } from "@/features/support/services/facility-display";
import type { FacilitySearchResult, FacilityWithTags } from "@/features/support/services/facility-search";

import type { PrepareFacility } from "@/features/prepare/schema/prepare";

/**
 * `FacilitySearchResult` から相談メモに添付する窓口候補(「相談窓口」分類のみ)を選ぶ。
 * `searchFacilities` が返す時点でタグ一致優先ソート済み(`sortByTagPriority`)のため、
 * 先頭から `limit` 件を取るだけでよい。
 */
export function selectPrepareFacilityRows(searchResult: FacilitySearchResult, limit: number): FacilityWithTags[] {
  return searchResult.facilitiesByCategory["相談窓口"].slice(0, limit);
}

/** D1 の事実情報を、相談メモ用の表示データへ変換する純関数(fact-guard 方針)。 */
export function toPrepareFacility(row: FacilityWithTags): PrepareFacility {
  return {
    id: row.id,
    name: row.name,
    municipality: row.municipality,
    address: row.address,
    phone: row.phone,
    url: row.url,
    sourceCredit: formatSourceCredit(row),
    sourceUrl: row.sourceUrl,
  };
}
