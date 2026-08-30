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
import type { AgeGroup } from "@/features/support/schema/age-group";

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

/** {@link queryFacilityIdsAcrossFilters} の1件分の戻り値。 */
export interface ScoredFacilityId {
  id: string;
  score: number;
}

/**
 * 複数の `{ id, score }` 配列(異なるフィルタ・異なるクエリ回による結果)を、同一 id は
 * 最良スコアを採用してデデュープし、スコア降順で1本にマージする純関数(2026-08是正、
 * 外部コードレビュー指摘)。`queryFacilityIdsAcrossFilters` 自身のフィルタ間マージと、
 * route.ts の初回クエリ+追加取得クエリのマージの両方で共有する。
 */
export function mergeScoredFacilityIds(...resultGroups: readonly (readonly ScoredFacilityId[])[]): ScoredFacilityId[] {
  const bestScoreById = new Map<string, number>();
  for (const results of resultGroups) {
    for (const result of results) {
      const currentBest = bestScoreById.get(result.id);
      if (currentBest === undefined || result.score > currentBest) {
        bestScoreById.set(result.id, result.score);
      }
    }
  }
  return [...bestScoreById.entries()].sort(([, a], [, b]) => b - a).map(([id, score]) => ({ id, score }));
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
 *
 * 2026-08是正(外部コードレビュー指摘): 戻り値を facility_id の配列ではなく
 * `{ id, score }` の配列にした。呼び出し側(route.ts)が初回クエリと追加取得クエリの結果を
 * 単純な配列連結(`[...a, ...b]`)でマージすると、スコアを保持していないため、追加取得側に
 * より高スコアの候補が含まれていてもID列の末尾に追いやられてしまう(Vectorize/Qdrant は
 * 近似最近傍探索であり、topK を変えた際に上位N件が単純な部分集合になる保証はない)。
 * スコアを呼び出し側まで持ち越すことで、複数回のクエリ結果を正しくスコア順に再統合できる。
 */
export async function queryFacilityIdsAcrossFilters(
  query: FacilityVectorSearchMultiQuery,
  deps: FacilityVectorSearchDeps,
): Promise<ScoredFacilityId[]> {
  const { text, topK, filters } = query;
  const { embedder, vectorStore } = deps;

  const [vector] = await embedder.embed([text]);
  if (!vector) return [];

  const resultsPerFilter = await Promise.all(filters.map((filter) => vectorStore.query(vector, topK, filter)));

  return mergeScoredFacilityIds(...resultsPerFilter);
}

/**
 * {@link buildRecommendFilterTiers} のパラメータ。
 */
export interface RecommendFilterTierParams {
  /** 選択自治体・広域(東京都)等、複数の municipality フィルタ(`queryFacilityIdsAcrossFilters` と同じ形)。 */
  municipalityFilters: VectorStoreFilter[];
  /** D1 の `facilities.age_range`(child/adult/both)と同じ粗い年齢区分。 */
  ageGroup: AgeGroup;
  /**
   * 任意。`lifestage-mapping.ts` の `lifestageToOrdinal` で変換した序数(0〜4)。
   * 未指定(null/undefined)の場合、VectorStore 側では lifestage_min/max の絞り込みを行わない
   * (D1 の `lifestageFilterClause` は「未指定時は lifestage_min/max が NULL の施設のみ許可」という
   * 逆方向の厳しい絞り込みを行うため、VectorStore 側で先読み的に同じ絞り込みを再現しようとすると
   * 候補選定の意図(関連度の高い施設を広く拾う)に反する。VectorStore はあくまで候補選定であり、
   * 正しさの最終判定は D1 の `fetchFacilitiesByIds`/`searchFacilities` が担う)。
   */
  lifestageOrdinal?: number | null;
}

/**
 * 年齢(`age_range`)・ライフステージ(`lifestage_min`/`lifestage_max`)による VectorStore
 * フィルタの段階(厳しい→緩い順)を組み立てる純関数(外部コードレビュー指摘 項目5)。
 *
 * 段階を分ける理由: Cloudflare Vectorize はフィールドごとに事前の
 * `wrangler vectorize create-metadata-index` が無いとそのフィールドを含む filter が
 * (エラーにならず)0件を返す。また、インデックス作成前に upsert 済みのベクトルは
 * インデックス作成後の再 upsert までフィルタ対象にならない。段階的フォールバック設計
 * (`queryFacilityIdsWithFilterCascade` が空段階をスキップする)により、本番導入初期・
 * メタデータインデックス未作成期間中でも「年齢・ライフステージで絞り込めないだけで、
 * 絞り込み自体ができず全滅する」ことを避け、既存(フィルタ無し)の挙動より劣化しない。
 *
 * 各段階内では従来どおり `municipalityFilters`(選択自治体/広域)をマージする
 * (`queryFacilityIdsWithFilterCascade` が段階ごとに実行)。
 *
 * 段階の構成:
 * 1. (lifestageOrdinal 指定時のみ) municipality + age_range + lifestage_min/max
 * 2. municipality + age_range
 * 3. municipality のみ(従来相当。フィルタ由来の 0 件はここまで緩めて最終的に拾う)
 */
export function buildRecommendFilterTiers(params: RecommendFilterTierParams): VectorStoreFilter[][] {
  const { municipalityFilters, ageGroup, lifestageOrdinal } = params;

  const withAgeFilters = municipalityFilters.map((filter) => ({
    ...filter,
    age_range: { $in: ["both", ageGroup] },
  }));

  const tiers: VectorStoreFilter[][] = [];

  if (lifestageOrdinal != null) {
    tiers.push(
      withAgeFilters.map((filter) => ({
        ...filter,
        lifestage_min: { $lte: lifestageOrdinal },
        lifestage_max: { $gte: lifestageOrdinal },
      })),
    );
  }

  tiers.push(withAgeFilters);
  tiers.push(municipalityFilters);

  return tiers;
}

export interface FacilityVectorSearchCascadeQuery {
  /** 検索クエリテキスト(自由記述・カテゴリタグ等を組み合わせた文字列)。 */
  text: string;
  /** フィルタごとに取得する件数。 */
  topK: number;
  /** {@link buildRecommendFilterTiers} 等で組み立てた、厳しい→緩い順のフィルタ段階。 */
  filterTiers: VectorStoreFilter[][];
}

/**
 * `queryFacilityIdsAcrossFilters` のフィルタ段階(カスケード)版(外部コードレビュー指摘 項目5)。
 *
 * `filterTiers` を先頭(最も厳しい)から順に試し、ある段階の結果(段階内は
 * `mergeScoredFacilityIds` でマージ)が1件でもあれば、それ以降の段階は試さずに返す。
 * 全段階が0件の場合のみ空配列を返す。embed はクエリテキストにつき1回のみ行う
 * (`queryFacilityIdsAcrossFilters` と同じ方針)。
 */
export async function queryFacilityIdsWithFilterCascade(
  query: FacilityVectorSearchCascadeQuery,
  deps: FacilityVectorSearchDeps,
): Promise<ScoredFacilityId[]> {
  const { text, topK, filterTiers } = query;
  const { embedder, vectorStore } = deps;

  const [vector] = await embedder.embed([text]);
  if (!vector) return [];

  for (const filters of filterTiers) {
    const resultsPerFilter = await Promise.all(filters.map((filter) => vectorStore.query(vector, topK, filter)));
    const merged = mergeScoredFacilityIds(...resultsPerFilter);
    if (merged.length > 0) return merged;
  }

  return [];
}
