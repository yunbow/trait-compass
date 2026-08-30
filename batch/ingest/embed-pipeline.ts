// D1 の facilities から埋め込みテキストを組み立て、Embedder → VectorStore へ upsert する
// パイプライン(FR-03A、TICKET-0021)。
//
// P0 の取込パイプライン(CKAN → R2 → toMarkdown → D1、workers/ingest/workflow.ts)の
// 後段に位置づけられる P1 の追加ステップ。`EMBEDDINGS_ENABLED` 環境変数(既定 false)で
// ゲートされ、未設定・無効時は本モジュールの関数は一切呼び出されない
// (workers/ingest/workflow.ts の `runEmbeddingStep` を参照)。
//
// ライセンス区分フィルタ(FR-033, TICKET-0021 AC-6)について:
// ライセンス区分 A/F/G(risk_level='low')以外のデータセットは、そもそも
// workers/ingest/workflow.ts 側で facilities への UPSERT 自体を行わない
// (license-hold ステータス、db/schema.sql の facilities は risk_level='low' の
// データセットに紐づく行しか持ち得ない)。本ファイルの `WHERE d.risk_level = 'low'` は
// その多層防御(defense-in-depth)であり、単独でライセンス制御を担っているわけではない。
//
// **NFR-23 に関する注意(結果整合性遅延)**: Vectorize は upsert 後 5〜10 秒の結果整合性遅延がある。
// この関数で upsert した直後に検索(src/features/support/services/facility-vector-search.ts)しても
// 最新の facility が結果に含まれない可能性がある。呼び出し側(cron/Workflow)は
// 「投入直後の即時検索」を前提にした設計にしないこと。

import type { Embedder } from "../../app/src/lib/ai/embedder";
import type { VectorStore, VectorStoreItem } from "../../app/src/lib/ai/vector-store";
import { FACILITY_BASE_WHERE } from "../../app/src/features/support/services/facility-search";
import { LIFESTAGE_VALUES } from "../../app/src/features/support/services/lifestage-mapping";

/**
 * D1 facilities.lifestage_min/max の序数域(migration 0016、db/schema.sql の
 * `CHECK (lifestage_min BETWEEN 0 AND 4)` 相当)。`LIFESTAGE_VALUES` の並び順に対応するため、
 * ここではハードコードせず `lifestage-mapping.ts` から導出する(2区分に増減しても追従する)。
 */
const LIFESTAGE_ORDINAL_MIN = 0;
const LIFESTAGE_ORDINAL_MAX = LIFESTAGE_VALUES.length - 1;

/** 埋め込み対象の facility 行(facilities × datasets(risk_level) × facility_tags の JOIN 結果)。 */
export interface EmbeddableFacilityRow {
  id: string;
  name: string;
  municipality: string;
  description: string | null;
  /** facility_tags.tag を GROUP_CONCAT で結合したもの(カンマ区切り、タグ無しは null)。 */
  tags: string | null;
  /**
   * D1 facilities.age_range(child/adult/both、NOT NULL)。VectorStore の年齢絞り込みフィルタ用
   * (2026-08是正、外部コードレビュー指摘 項目5)。
   */
  age_range: "child" | "adult" | "both";
  /**
   * D1 facilities.lifestage_min(migration 0016、0〜4 または NULL)。NULL は「対象ライフステージの
   * 細分なし(age_range のみで判定)」を意味する。`buildFacilityMetadata` で番兵値に変換する
   * (詳細は同関数のコメント参照)。
   */
  lifestage_min: number | null;
  /** D1 facilities.lifestage_max(migration 0016、0〜4 または NULL)。意味は lifestage_min と対。 */
  lifestage_max: number | null;
}

/**
 * Workers AI(`@cf/baai/bge-m3`)・Ollama(`bge-m3`)双方の入力上限を大きく下回る、
 * 保守的な埋め込みテキストの文字数上限。長大な description を持つレコードでも
 * 埋め込み生成リクエストが失敗しないよう、末尾を切り詰める(AC-1 の「長文トリム」)。
 */
export const MAX_EMBEDDING_TEXT_LENGTH = 2000;

/** VectorStore.upsert のバッチサイズ(1回のバッチ処理あたりの件数)。 */
export const DEFAULT_BATCH_SIZE = 50;

/**
 * facility 1件分の埋め込み対象テキストを組み立てる純関数(AC-1)。
 * name + municipality + description + タグ(GROUP_CONCAT のカンマ区切り文字列)をスペース区切りで
 * 結合し、`MAX_EMBEDDING_TEXT_LENGTH` を超える場合は末尾を切り詰める。
 */
export function buildEmbeddingText(facility: EmbeddableFacilityRow): string {
  const tags = (facility.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const parts = [facility.name, facility.municipality, facility.description ?? "", ...tags].filter(
    (part) => part.length > 0,
  );

  const text = parts.join(" ");
  return text.length > MAX_EMBEDDING_TEXT_LENGTH ? text.slice(0, MAX_EMBEDDING_TEXT_LENGTH) : text;
}

/**
 * VectorStore へ渡すメタデータを組み立てる純関数(AC-2、NFR-23、2026-08是正・外部コードレビュー
 * 指摘 項目5で age_range/lifestage_min/lifestage_max を追加)。
 * facility_id(D1 主キー)・municipality・年齢/ライフステージ絞り込み用の3フィールドのみを持たせ、
 * 施設名・説明等の長い文字列は含めない(NFR-23 のメタデータ文字列 64 バイト制約を超過しやすい
 * フィールドを避ける設計)。
 *
 * **lifestage_min/max が NULL の場合の扱い(設計判断の根拠)**: D1 側では NULL は「対象ライフ
 * ステージの細分なし = age_range のみで判定する制限なし施設」を意味する
 * (facility-search.ts の `lifestageFilterClause`)。しかし Vectorize/Qdrant のメタデータフィルタは、
 * フィールド自体が欠損しているレコードは `$lte`/`$gte` 等の範囲比較にマッチせず「除外」される
 * のが一般的な挙動であり、NULL をメタデータキーの省略で表現すると「制限なし」のつもりが
 * 「候補から漏れる」に転倒してしまう。そこで、NULL は lifestage_min/max の取り得る全域
 * (`LIFESTAGE_ORDINAL_MIN`〜`LIFESTAGE_ORDINAL_MAX`、db/schema.sql の CHECK 制約と同じ 0〜4)を
 * 表す番兵値に変換して格納する。これにより、クエリ側が任意の序数(0〜4のいずれか)で
 * `lifestage_min <= 序数 AND lifestage_max >= 序数` を問い合わせても、制限なし施設は
 * 常にマッチする(D1 の「lifestage_min IS NULL は常に許可」と同じ意味論を再現できる)。
 */
export function buildFacilityMetadata(
  facility: Pick<EmbeddableFacilityRow, "id" | "municipality" | "age_range" | "lifestage_min" | "lifestage_max">,
): Record<string, string | number> {
  return {
    facility_id: facility.id,
    municipality: facility.municipality,
    age_range: facility.age_range,
    lifestage_min: facility.lifestage_min ?? LIFESTAGE_ORDINAL_MIN,
    lifestage_max: facility.lifestage_max ?? LIFESTAGE_ORDINAL_MAX,
  };
}

/** 配列を指定サイズごとのバッチに分割する純関数(AC-1 のバッチ処理)。 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error(`chunk size must be a positive integer (got ${size})`);
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export interface EmbedPipelineSummary {
  facilityCount: number;
  batchCount: number;
}

/**
 * facility 行を `batchSize` 件ずつ Embedder → VectorStore.upsert するオーケストレーション純関数。
 * D1 に依存しない(呼び出し側が `fetchEmbeddableFacilities` 等で取得済みの行を渡す)ため、
 * `Embedder`/`VectorStore` をモックしたユニットテストが可能(TICKET-0021 テスト観点)。
 */
export async function embedAndUpsertFacilities(
  rows: readonly EmbeddableFacilityRow[],
  embedder: Embedder,
  vectorStore: VectorStore,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<EmbedPipelineSummary> {
  const batches = chunk(rows, batchSize);

  for (const batch of batches) {
    const texts = batch.map(buildEmbeddingText);
    const vectors = await embedder.embed(texts);
    const items: VectorStoreItem[] = batch.map((facility, index) => ({
      id: facility.id,
      vector: vectors[index],
      metadata: buildFacilityMetadata(facility),
    }));
    await vectorStore.upsert(items);
  }

  return { facilityCount: rows.length, batchCount: batches.length };
}

/**
 * facilities × datasets(risk_level='low' のみ) × facility_tags を JOIN し、
 * 埋め込み対象行を取得する(D1 への実アクセスを伴うため vitest ではテストしない。
 * workers/ingest/db.ts の方針・src/features/support/services/dataset-status.ts の
 * `getUnhealthyDatasets` と同じ扱い)。
 *
 * 2026-08是正(外部コードレビュー指摘): `FACILITY_BASE_WHERE`(facility-search.ts、
 * `f.is_medical = 0 AND f.is_out_of_scope = 0`)を通常のD1検索と共有する。以前は
 * risk_level のみで絞っており、医療機関・対象外施設もベクトル埋め込み対象になっていた
 * (通常のD1検索では常に除外される行が、RAG検索の topK 候補枠を無駄に消費していた)。
 *
 * 2026-08是正(外部コードレビュー指摘 項目5): SELECT 列に `age_range`/`lifestage_min`/
 * `lifestage_max` を追加(`buildFacilityMetadata` が VectorStore メタデータに含めるため)。
 */
export async function fetchEmbeddableFacilities(db: D1Database): Promise<EmbeddableFacilityRow[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id AS id, f.name AS name, f.municipality AS municipality, f.description AS description,
              f.age_range AS age_range, f.lifestage_min AS lifestage_min, f.lifestage_max AS lifestage_max,
              GROUP_CONCAT(ft.tag) AS tags
       FROM facilities f
       JOIN datasets d ON d.id = f.dataset_id
       LEFT JOIN facility_tags ft ON ft.facility_id = f.id
       WHERE d.risk_level = 'low' AND ${FACILITY_BASE_WHERE}
       GROUP BY f.id`,
    )
    .all<EmbeddableFacilityRow>();
  return results ?? [];
}

export interface EmbedPipelineParams {
  db: D1Database;
  embedder: Embedder;
  vectorStore: VectorStore;
  batchSize?: number;
}

/**
 * D1 から埋め込み対象の facilities を取得し、埋め込み生成・VectorStore への upsert まで行う
 * 合成関数(AC-1〜AC-2)。取込 Worker の Workflow ステップ(EMBEDDINGS_ENABLED ゲート時)、
 * およびローカル開発用の手動発火エンドポイント(POST /embed)の双方から呼び出される。
 */
export async function runEmbedPipeline(params: EmbedPipelineParams): Promise<EmbedPipelineSummary> {
  const { db, embedder, vectorStore, batchSize } = params;
  const rows = await fetchEmbeddableFacilities(db);
  return embedAndUpsertFacilities(rows, embedder, vectorStore, batchSize);
}
