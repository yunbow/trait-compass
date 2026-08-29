// RAG 検索の下地: VectorStore(Vectorize/Qdrant)への埋め込みクエリ → facility_id 配列を
// 返すヘルパー(FR-03A、TICKET-0021 AC-3 の下地)。
//
// D1 JOIN で事実情報(施設名・電話番号・URL 等)を再取得する処理は本関数の責務外
// (TICKET-0023 の `/api/recommend` 実装が担う)。ここでは「クエリテキストを埋め込み →
// VectorStore.query → facility_id を返す」ところまでを行う。
//
// **NFR-23 に関する注意(Vectorize の結果整合性遅延)**: Vectorize は upsert 後 5〜10 秒の
// 結果整合性遅延がある。取込パイプライン(workers/ingest/embed-pipeline.ts)が facilities を
// upsert した直後にこの関数で検索しても、直近投入分の facility が結果に含まれない可能性がある。
// 呼び出し側は「投入直後の即時検索」を前提にした設計にしないこと(投入と検索の間に十分な
// 時間差がある通常の検索リクエストのみを想定する)。

import type { Embedder } from "@/lib/ai/embedder";
import type { VectorStore, VectorStoreFilter } from "@/lib/ai/vector-store";

export interface FacilityVectorSearchQuery {
  /** 検索クエリテキスト(自由記述・カテゴリタグ等を組み合わせた文字列)。 */
  text: string;
  /** 上位何件を取得するか。 */
  topK: number;
  /** VectorStore 側でのメタデータ絞り込み(例: municipality)。省略時は絞り込みなし。 */
  filter?: VectorStoreFilter;
}

export interface FacilityVectorSearchDeps {
  embedder: Embedder;
  vectorStore: VectorStore;
}

/**
 * クエリテキストを `Embedder.embed` でベクトル化し、`VectorStore.query` で検索して
 * facility_id(D1 の facilities.id と対応する VectorStore 側の id)の配列を返す(AC-3 の下地)。
 *
 * D1 JOIN による事実情報の再取得・整形は呼び出し側(TICKET-0023)の責務であり、本関数は
 * ID 配列を返すところまでに留める(ticket の設計方針: 検索結果は D1 JOIN で事実情報を
 * 再取得して表示・生成に使う)。
 */
export async function queryFacilityIds(
  query: FacilityVectorSearchQuery,
  deps: FacilityVectorSearchDeps,
): Promise<string[]> {
  const { text, topK, filter } = query;
  const { embedder, vectorStore } = deps;

  const [vector] = await embedder.embed([text]);
  if (!vector) return [];

  const results = await vectorStore.query(vector, topK, filter);
  return results.map((result) => result.id);
}

export interface FacilityVectorSearchMultiQuery {
  /** 検索クエリテキスト(自由記述・カテゴリタグ等を組み合わせた文字列)。 */
  text: string;
  /** フィルタごとに取得する件数。 */
  topK: number;
  /** VectorStore 側でのメタデータ絞り込み条件を複数渡す(例: 選択自治体・広域)。 */
  filters: VectorStoreFilter[];
}

/**
 * `queryFacilityIds` の複数フィルタ版(2026-08是正、外部コードレビュー指摘)。
 *
 * 単一の無条件クエリで topK 件だけ取得すると、それらが D1 側の絞り込み(自治体・年齢)で
 * 全滅・大半除外されうる(全施設インデックスの中からは、選択自治体に属する施設が上位 topK に
 * 一件も入らないことが普通にある)。本関数は `filters` の要素ごとに個別クエリし、
 * facility_id をスコア(降順、同一 id は最良スコアを採用)でマージして返す
 * ことで、呼び出し側(route.ts)が「選択自治体」「広域(東京都)」を別々に確保できるようにする。
 *
 * embed はクエリテキストにつき1回のみ行う(フィルタ数だけ埋め込み課金が増えることを避ける)。
 */
export async function queryFacilityIdsAcrossFilters(
  query: FacilityVectorSearchMultiQuery,
  deps: FacilityVectorSearchDeps,
): Promise<string[]> {
  const { text, topK, filters } = query;
  const { embedder, vectorStore } = deps;

  const [vector] = await embedder.embed([text]);
  if (!vector) return [];

  const resultsPerFilter = await Promise.all(filters.map((filter) => vectorStore.query(vector, topK, filter)));

  const bestScoreById = new Map<string, number>();
  for (const results of resultsPerFilter) {
    for (const result of results) {
      const currentBest = bestScoreById.get(result.id);
      if (currentBest === undefined || result.score > currentBest) {
        bestScoreById.set(result.id, result.score);
      }
    }
  }

  return [...bestScoreById.entries()].sort(([, a], [, b]) => b - a).map(([id]) => id);
}
