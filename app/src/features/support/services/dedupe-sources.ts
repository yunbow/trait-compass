/**
 * 出典配列を label+url の複合キーで重複排除する共通ヘルパー。
 *
 * もとは `ResultsTabGuide.tsx` のローカル関数(汎用sources+自治体固有sourcesの結合用)だった
 * ものを、`SchoolCard.tsx`(学校自体のsources + 各固定級のsourcesの結合、TICKET-xxx
 * 掲載情報の訂正・更新報告拡張)でも再利用するため、この共通モジュールへ切り出した。
 * 出典の型はモジュールをまたいで微妙に異なる(`TabGuideSource`/`SupportPathwaySource`/
 * `SourceRef`等)が、いずれも `{ label: string; url？: string; confirmedOn: string }` の
 * 構造的部分型を満たすため、ジェネリクスで受け取る。
 */
export interface DedupableSource {
  label: string;
  url?: string;
  confirmedOn: string;
}

/** 同一の出典(label+url)が重複する場合は先勝ちで1件にまとめる。 */
export function dedupeSources<T extends DedupableSource>(sources: readonly T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = JSON.stringify([source.label, source.url ?? ""]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
