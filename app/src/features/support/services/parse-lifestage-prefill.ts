// `/support?lifestage=` プリフィル値の検証。
//
// `/support/results` の「条件を見直す」導線で `/support` へ戻る際、選択済みの年齢
// (ライフステージ)を復元するために使う。`age`(child/adult の2値)からは元の
// 5区分ライフステージを一意に復元できないため、`lifestage` を専用のクエリパラメータとして
// 別途引き継ぐ。

import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { parseKnownValueParam } from "@/features/support/services/parse-param-helpers";

const LIFESTAGE_SET: ReadonlySet<string> = new Set(LIFESTAGE_VALUES);

/**
 * `searchParams.lifestage` の生値を検証する純関数。
 * 未知の値(URL改ざん等)・配列(同名クエリの重複指定)は無視して `null` を返し、
 * 呼び出し側は「プリフィル無し」として通常の未選択状態にフォールバックする。
 */
export function parseLifestagePrefillParam(raw: string | string[] | undefined): Lifestage | null {
  return parseKnownValueParam<Lifestage>(raw, LIFESTAGE_SET);
}
