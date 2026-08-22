// 結果画面から引き継ぐ相談分野タグの解析(TICKET-0014)。
//
// `/support?tags=a,b` の `tags` クエリ(ASCII ID、support-tag-url.ts 参照)を受け取り、
// 既知の相談分野タグ(SUPPORT_TAGS)にだけ絞り込む純関数。結果画面(TICKET-0013
// mapScoresToTags)が生成しないはずの値が URL 改ざん等で混入しても、そのまま次画面
// (/support/results)へ転送しない(全入力データを検証する方針を、
// 区市町村と同様に定数リストとの突合で満たす)。
// 旧仕様の日本語ラベルはハードカットオーバーにより互換維持せず、未知の値として除外される。

import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { parseDedupedListParam } from "@/features/support/services/parse-param-helpers";
import {
  decodeSupportTagUrlId,
  isSupportTagUrlId,
} from "@/features/support/services/support-tag-url";
import type { SupportTagUrlId } from "@/features/support/services/support-tag-url";

/**
 * `searchParams.tags` の生値(`string | string[] | undefined`)から、既知の相談分野タグの
 * 配列を重複なく取り出す。
 * - 値が無い・空文字・既知タグを1つも含まない場合は空配列を返す(呼び出し側は
 *   「タグが無ければ全般扱いで転送しない」の判断にこの空配列をそのまま使える)。
 * - カンマ区切り文字列(`/support?tags=a,b`)・配列(`?tags=a&tags=b`)のどちらも受け付ける。
 */
export function parseSupportTagsParam(raw: string | string[] | undefined): SupportTag[] {
  return parseDedupedListParam<SupportTagUrlId>(raw, isSupportTagUrlId).map(decodeSupportTagUrlId);
}
