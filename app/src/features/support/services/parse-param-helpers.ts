// クエリパラメータの寛容パース共通ヘルパー(TICKET-0064 business-logic-consolidation 1-4)。
//
// support feature内の複数のクエリパラメータ解析関数(parseLifestagePrefillParam /
// parseSupportPurposeParam / parseSupportTagsParam / parseFacilitySubtypesParam)が
// それぞれ独自に実装していた共通骨格を、ここへ抽出する。既存4関数はこのファイルの
// ヘルパーを呼ぶ薄いラッパーとして温存し、呼び出し側のimportパス・公開シグネチャ・
// 挙動は一切変えない。
//
// 対象外(意図的に統合しない):
// - `parseCategoryTypeParam`(constants/category-types.ts): 不正値を既定タブへ
//   フォールバックする方針で、非該当を`null`で返す本ファイルの方針とは異なる。
// - `parseResultsSearchParams`(schema/results-search-params.ts): 厳格なZod検証・
//   空状態遷移を扱い、本ファイルの寛容パースとは非対称。

/**
 * `string | string[] | undefined` の生値を、既知の値集合(Set)とだけ照合する純関数。
 * - 値が文字列でない(未指定・配列=同名クエリの重複指定)場合は `null`。
 * - 既知集合に含まれない文字列(URL改ザン等)も `null`。
 * - 呼び出し側は「非該当」を通常のフォールバック(未選択状態など)として扱う。
 */
export function parseKnownValueParam<T extends string>(
  raw: string | string[] | undefined,
  knownValues: ReadonlySet<string>,
): T | null {
  if (typeof raw !== "string") return null;
  return knownValues.has(raw) ? (raw as T) : null;
}

/**
 * `string | string[] | undefined` の生値から、重複のない値の配列を取り出す純関数。
 * - カンマ区切り文字列(`?tags=a,b`)・配列(`?tags=a&tags=b`)のどちらも受け付ける。
 * - 各要素はtrimし、空要素は無視する。
 * - `predicate` を渡した場合は、それを満たす値のみを残す(ホワイトリスト方式)。
 *   省略した場合は未知の値もそのまま残す(ブラックリストを持たない方式)。
 * - 値が無い場合は空配列を返す。
 */
export function parseDedupedListParam<T extends string = string>(
  raw: string | string[] | undefined,
  predicate?: (value: string) => value is T,
): T[] {
  if (!raw) return [];

  const rawValues = Array.isArray(raw) ? raw : raw.split(",");

  const values: T[] = [];
  for (const value of rawValues) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (predicate && !predicate(trimmed)) continue;
    if (!values.includes(trimmed as T)) {
      values.push(trimmed as T);
    }
  }
  return values;
}
