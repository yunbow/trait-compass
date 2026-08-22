// RAG 検索精度メトリクス(TICKET-0024, NFR-73①)の純関数群。
//
// D1/VectorStore/Embedder への実アクセスを一切含まない(引数はすべてプレーンな配列・集合)。
// そのため vitest でユニットテストできる(eval/metrics.test.ts、「ハーネス自体の純関数は
// vitest でテストする」という本チケットの方針)。
//
// LLM judge は使わない(SQL/fixture 由来の正解 facility_id 集合との機械的な突合のみ、NFR-73)。

/** 1件のランキング付き検索結果に対する評価入力。 */
export interface RetrievalCase {
  /** 検索結果の facility_id 配列。スコア降順(関連度が高い順)を前提とする。 */
  rankedIds: readonly string[];
  /** 正解 facility_id の集合(ゴールデンデータ由来)。 */
  relevantIds: ReadonlySet<string>;
}

/**
 * Precision@K: 上位 K 件(実際に返された件数が K 未満ならその件数)のうち、正解集合に
 * 含まれる件数の割合。
 * 上位 0 件(検索結果が空)の場合は 0 を返す。
 */
export function precisionAtK(rankedIds: readonly string[], relevantIds: ReadonlySet<string>, k: number): number {
  const topK = rankedIds.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((id) => relevantIds.has(id)).length;
  return hits / topK.length;
}

/**
 * Recall@K: 正解集合のうち、上位 K 件に含まれている件数の割合。
 * 正解集合が空の場合、「見逃しようがない」ため 1 を返す(0/0 の NaN を避ける)。
 */
export function recallAtK(rankedIds: readonly string[], relevantIds: ReadonlySet<string>, k: number): number {
  if (relevantIds.size === 0) return 1;
  const topK = new Set(rankedIds.slice(0, k));
  let hits = 0;
  for (const id of relevantIds) {
    if (topK.has(id)) hits++;
  }
  return hits / relevantIds.size;
}

/**
 * Reciprocal Rank: 正解集合に含まれる最初の結果の順位の逆数(1-indexed)。
 * 1件も見つからない場合は 0。
 */
export function reciprocalRank(rankedIds: readonly string[], relevantIds: ReadonlySet<string>): number {
  const index = rankedIds.findIndex((id) => relevantIds.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

/** 複数ケースの平均 Precision@K。ケースが0件の場合は 0。 */
export function meanPrecisionAtK(cases: readonly RetrievalCase[], k: number): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, c) => acc + precisionAtK(c.rankedIds, c.relevantIds, k), 0);
  return sum / cases.length;
}

/** 複数ケースの平均 Recall@K。ケースが0件の場合は 0。 */
export function meanRecallAtK(cases: readonly RetrievalCase[], k: number): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, c) => acc + recallAtK(c.rankedIds, c.relevantIds, k), 0);
  return sum / cases.length;
}

/** Mean Reciprocal Rank(MRR)。ケースが0件の場合は 0。 */
export function meanReciprocalRank(cases: readonly RetrievalCase[]): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, c) => acc + reciprocalRank(c.rankedIds, c.relevantIds), 0);
  return sum / cases.length;
}

/**
 * Recall@K(K でキャップした版)。
 *
 * 既存の {@link recallAtK} は分母が常に `relevantIds.size` であるため、正解集合のサイズが K を
 * 超えるケース(例: 正解50件・K=10)では原理的に Recall@K=1.0 を達成できない
 * (最大でも 10/50=0.2)。生成ゴールデンデータ(区市町村内の該当施設全件を requiredFacilityIds
 * とする)ではこれが頻繁に起こりうるため、分母を `min(relevantIds.size, k)` にキャップした版を
 * 別関数として追加する。**既存の `recallAtK` は変更しない**(後方互換、手書き golden 12件の
 * しきい値に影響させないため)。
 *
 * 正解集合が空の場合は(recallAtK と同じく)「見逃しようがない」ため 1 を返す。
 */
export function recallAtKCapped(rankedIds: readonly string[], relevantIds: ReadonlySet<string>, k: number): number {
  if (relevantIds.size === 0) return 1;
  const topK = new Set(rankedIds.slice(0, k));
  let hits = 0;
  for (const id of relevantIds) {
    if (topK.has(id)) hits++;
  }
  const denominator = Math.min(relevantIds.size, k);
  return hits / denominator;
}

/** 複数ケースの平均 Recall@K(K でキャップした版)。ケースが0件の場合は 0。 */
export function meanRecallAtKCapped(cases: readonly RetrievalCase[], k: number): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, c) => acc + recallAtKCapped(c.rankedIds, c.relevantIds, k), 0);
  return sum / cases.length;
}

/**
 * 1件の検索結果に対する評価入力(正解を2層に分ける版)。生成ゴールデンデータ
 * (`retrieval-golden.generated.json`)のように、「同一区市町村内の該当施設(必須、Recall の分母)」と
 * 「広域窓口の該当施設(任意、Precision では正解扱いするが Recall の分母には含めない)」を
 * 区別したいケースで使う。
 */
export interface TieredRetrievalCase {
  /** 検索結果の facility_id 配列。スコア降順を前提とする。 */
  rankedIds: readonly string[];
  /** 同一区市町村内の該当施設 id 集合(Recall の分母、`municipalityHitRateAtK` の判定対象)。 */
  requiredIds: ReadonlySet<string>;
  /** 広域窓口の該当施設 id 集合(任意、Precision でのみ正解扱い)。 */
  acceptableIds: ReadonlySet<string>;
}

/**
 * 自治体単位での取りこぼしを検知する指標(2026-08-20 発覚: 千代田区クエリで千代田区の施設が
 * 上位10件に1件も含まれず、他区の施設ばかりが返っていた問題に対応)。
 *
 * 上位 K 件の中に `requiredIds`(同一区市町村内の該当施設)が1件でも含まれていれば 1、
 * 1件も含まれなければ 0 を返す(Recall@K のような按分ではなく二値判定)。
 * `requiredIds` が空の場合は「取りこぼしようがない」ため 1 を返す(recallAtK の空集合規約と同じ)。
 */
export function municipalityHitRateAtK(rankedIds: readonly string[], requiredIds: ReadonlySet<string>, k: number): number {
  if (requiredIds.size === 0) return 1;
  const topK = rankedIds.slice(0, k);
  return topK.some((id) => requiredIds.has(id)) ? 1 : 0;
}

/** 複数ケースの平均 municipalityHitRateAtK(=自治体単位でヒットしたケースの割合)。ケースが0件の場合は 0。 */
export function meanMunicipalityHitRateAtK(cases: readonly TieredRetrievalCase[], k: number): number {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((acc, c) => acc + municipalityHitRateAtK(c.rankedIds, c.requiredIds, k), 0);
  return sum / cases.length;
}
