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

/** 埋め込み対象の facility 行(facilities × datasets(risk_level) × facility_tags の JOIN 結果)。 */
export interface EmbeddableFacilityRow {
  id: string;
  name: string;
  municipality: string;
  description: string | null;
  /** facility_tags.tag を GROUP_CONCAT で結合したもの(カンマ区切り、タグ無しは null)。 */
  tags: string | null;
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
 * VectorStore へ渡すメタデータを組み立てる純関数(AC-2、NFR-23)。
 * facility_id(D1 主キー)と municipality のみを持たせ、施設名・説明等の長い文字列は含めない
 * (NFR-23 のメタデータ文字列 64 バイト制約を超過しやすいフィールドを避ける設計)。
 */
export function buildFacilityMetadata(
  facility: Pick<EmbeddableFacilityRow, "id" | "municipality">,
): Record<string, string> {
  return { facility_id: facility.id, municipality: facility.municipality };
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
 */
export async function fetchEmbeddableFacilities(db: D1Database): Promise<EmbeddableFacilityRow[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id AS id, f.name AS name, f.municipality AS municipality, f.description AS description,
              GROUP_CONCAT(ft.tag) AS tags
       FROM facilities f
       JOIN datasets d ON d.id = f.dataset_id
       LEFT JOIN facility_tags ft ON ft.facility_id = f.id
       WHERE d.risk_level = 'low'
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
