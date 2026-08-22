import { parseDedupedListParam } from "@/features/support/services/parse-param-helpers";

/**
 * `searchParams.subtype` の生値(`string | string[] | undefined`)から、施設サブタイプの
 * 配列を重複なく取り出す。未知・古い値も許容し、実在する施設サブタイプと一致しない限り
 * 下流で表示対象から除かれるため、そのまま残す。
 */
export function parseFacilitySubtypesParam(raw: string | string[] | undefined): string[] {
  return parseDedupedListParam(raw);
}
