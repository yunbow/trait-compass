// `/support/results?purpose=` クエリパラメータの検証。
//
// 目的選択画面(`/support/purpose`)で目的ボタンを押すと `purpose=<purposeId>` を付けて
// `/support/results` へ遷移する(「それ以外」を選んだ場合は `PURPOSE_OTHER_ID`)。結果画面側は
// この値を表示にのみ使い(FR-025 の絞り込みロジックは変更しない、スコープ外)、未知の値・
// URL改ざんはそのまま無視して `null` を返す(`parseLifestagePrefillParam` と同じ寛容な方針)。
// lifestage との対応関係(その lifestage に実在する目的かどうか)まではここでは検証しない。
// 表示側で `PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage]` に対応する目的が見つからなければ、
// 何も表示しないだけでよい。

import { PURPOSE_OPTIONS_BY_LIFESTAGE, PURPOSE_OTHER_ID } from "@/features/support/constants/purpose-options";
import { parseKnownValueParam } from "@/features/support/services/parse-param-helpers";

const PURPOSE_ID_SET: ReadonlySet<string> = new Set([
  ...Object.values(PURPOSE_OPTIONS_BY_LIFESTAGE).flatMap((options) => options.map((option) => option.id)),
  PURPOSE_OTHER_ID,
]);

/**
 * `searchParams.purpose` の生値を検証する純関数。
 * 未知の値(URL改ざん等)・配列(同名クエリの重複指定)は無視して `null` を返し、
 * 呼び出し側は「目的の指定無し」として通常の一覧表示にフォールバックする
 * (`parseLifestagePrefillParam` と同じ方針)。
 */
export function parseSupportPurposeParam(raw: string | string[] | undefined): string | null {
  return parseKnownValueParam(raw, PURPOSE_ID_SET);
}
