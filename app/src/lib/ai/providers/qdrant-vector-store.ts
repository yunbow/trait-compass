import type {
  VectorStore,
  VectorStoreFilter,
  VectorStoreItem,
  VectorStoreQueryResult,
} from "../vector-store";
import { warnIfMetadataOversized } from "../vector-store";
import { EMBEDDING_DIM } from "../embedder";

// Qdrant(REST API)による VectorStore 実装。Vectorize 代替(local-dev-environment.md §4)。
// 参考: https://qdrant.tech/documentation/concepts/collections/
//       https://qdrant.tech/documentation/concepts/points/
//
// フィールド名の差異(Vectorize: `values`/`metadata` ⇄ Qdrant: `vector`/`payload`)は
// このアダプタ内で吸収し、呼び出し元は共通の `VectorStoreItem`(`vector`/`metadata`)のみを扱う。
//
// **ID 形式の差異にも注意(TICKET-0021 で実機確認して判明)**: Vectorize は任意の文字列を
// ベクトル ID として受け付けるが、Qdrant の point ID は「符号なし整数、または UUID」以外を
// 拒否する(400 Bad Request)。取込パイプライン(workers/ingest/embed-pipeline.ts)は
// `id: facility.id`(例: "fac-1a2b3c4d")のような取込元由来の文字列 ID をそのまま
// `VectorStore.upsert` に渡す設計のため、Qdrant 実装側で決定的にハッシュ化した UUID 形式の
// 文字列に変換して upsert し、`query()` 側では元の ID を payload から復元して返す
// (`toQdrantPointId`/`SOURCE_ID_PAYLOAD_KEY`)。呼び出し元(`VectorStore` インターフェース越し)は
// この変換を意識する必要はない。

const DEFAULT_BASE_URL = "http://localhost:6333";
const DEFAULT_COLLECTION = "trait-compass";

/** Qdrant の payload 内で、呼び出し元が渡した元の ID(`VectorStoreItem.id`)を保持する予約キー。 */
const SOURCE_ID_PAYLOAD_KEY = "__vector_store_source_id";

const UNSIGNED_INT_PATTERN = /^\d+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QdrantSearchResponse {
  result?: { id: string | number; score: number; payload?: Record<string, unknown> }[];
}

export interface QdrantVectorStoreConfig {
  baseUrl?: string;
  collection?: string;
}

function readConfigFromEnv(): QdrantVectorStoreConfig {
  return {
    baseUrl: process.env.QDRANT_URL || DEFAULT_BASE_URL,
    collection: process.env.QDRANT_COLLECTION || DEFAULT_COLLECTION,
  };
}

/** 32bit FNV-1a ハッシュ(workers/ingest/transform.ts の `stableFacilityId` と同じアルゴリズム)。 */
function fnv1a(input: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 任意の文字列から決定的に 32桁(128bit相当)の16進文字列を導出する。
 * 同じ入力からは常に同じ値になる(再取込時の upsert 冪等性を保つため)。
 */
function deterministicHex32(input: string): string {
  let hex = "";
  let seed = 0x811c9dc5;
  while (hex.length < 32) {
    hex += fnv1a(`${input}#${seed}`, seed).toString(16).padStart(8, "0");
    seed = Math.imul(seed ^ 0x9e3779b9, 0x01000193) >>> 0;
  }
  return hex.slice(0, 32);
}

/** 文字列を UUID 風(8-4-4-4-12)にフォーマットする。決定的なハッシュ由来のため厳密な UUID v4 ではない。 */
function toUuidLike(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

/**
 * `VectorStoreItem.id` を Qdrant の point ID(符号なし整数 or UUID のみ許可)に変換する。
 * 既に条件を満たす ID(数値文字列・UUID 文字列)はそのまま使い、それ以外は入力文字列から
 * 決定的に導出した UUID 風文字列に変換する(同じ id は常に同じ point ID になるため、
 * 再取込時の UPSERT でも同一ポイントを指す)。
 */
export function toQdrantPointId(id: string): string {
  if (UNSIGNED_INT_PATTERN.test(id) || UUID_PATTERN.test(id)) {
    return id;
  }
  return toUuidLike(deterministicHex32(id));
}

/**
 * Qdrant の points upsert リクエストボディを組み立てる(`vector`/`payload` へのフィールド変換込み)。
 * `id` は `toQdrantPointId` で Qdrant 許容形式に変換し、元の ID は `query()` 側で復元できるよう
 * payload の予約キー(`SOURCE_ID_PAYLOAD_KEY`)に保持する。
 */
export function buildQdrantUpsertBody(items: VectorStoreItem[]) {
  return {
    points: items.map((item) => ({
      id: toQdrantPointId(item.id),
      vector: item.vector,
      payload: { ...(item.metadata ?? {}), [SOURCE_ID_PAYLOAD_KEY]: item.id },
    })),
  };
}

/**
 * `VectorStoreFilter` の1キー分の条件を Qdrant の `must` 句1要素に変換する。
 * プレーンな scalar 値(string/number/boolean)は従来どおり `match.value` の等価条件にする。
 * 演算子オブジェクト(`VectorStoreFilterCondition`)は以下のように変換する
 * (2026-08是正、外部コードレビュー指摘 項目5):
 * - `$in`: Qdrant の `match.any`(複数値のいずれかに一致)。
 * - `$eq`: `match.value`(scalar 指定と同義)。
 * - `$lte`/`$gte`: Qdrant の `range`(数値の範囲比較。両方指定時は1つの `range` にまとめる)。
 */
function buildQdrantCondition(key: string, value: VectorStoreFilter[string]) {
  if (value !== null && typeof value === "object") {
    if (value.$in !== undefined) {
      return { key, match: { any: value.$in } };
    }
    if (value.$eq !== undefined) {
      return { key, match: { value: value.$eq } };
    }
    if (value.$lte !== undefined || value.$gte !== undefined) {
      const range: Record<string, number> = {};
      if (value.$gte !== undefined) range.gte = value.$gte;
      if (value.$lte !== undefined) range.lte = value.$lte;
      return { key, range };
    }
    throw new Error(`buildQdrantFilter: unsupported filter condition for key "${key}"`);
  }
  return { key, match: { value } };
}

/** 共通の `VectorStoreFilter`(等価条件・`$in`/`$lte`/`$gte` 演算子条件)を Qdrant の filter DSL に変換する。 */
export function buildQdrantFilter(filter?: VectorStoreFilter) {
  if (!filter || Object.keys(filter).length === 0) return undefined;
  return {
    must: Object.entries(filter).map(([key, value]) => buildQdrantCondition(key, value)),
  };
}

/**
 * Qdrant の points delete リクエストボディを組み立てる。
 * `ids`(呼び出し元由来のソース ID)は `toQdrantPointId` で upsert 時と同じ point ID に変換する
 * (変換前の ID をそのまま渡すと、upsert 済みのポイントと一致せず削除されない)。
 */
export function buildQdrantDeleteBody(ids: string[]) {
  return {
    points: ids.map(toQdrantPointId),
  };
}

/** Qdrant の points search リクエストボディを組み立てる。 */
export function buildQdrantSearchBody(vector: number[], topK: number, filter?: VectorStoreFilter) {
  return {
    vector,
    limit: topK,
    with_payload: true,
    ...(buildQdrantFilter(filter) ? { filter: buildQdrantFilter(filter) } : {}),
  };
}

export class QdrantVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly collection: string;

  constructor(config: QdrantVectorStoreConfig = readConfigFromEnv()) {
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.collection = config.collection || DEFAULT_COLLECTION;
  }

  /**
   * コレクションが存在しない場合のみ作成する(冪等)。既存の場合は何もしない。
   * 呼び出し元(投入パイプライン等)が初回セットアップ時に呼ぶ想定。
   */
  async ensureCollection(dimensions: number = EMBEDDING_DIM): Promise<void> {
    const existsRes = await fetch(`${this.baseUrl}/collections/${this.collection}`, {
      method: "GET",
    });
    if (existsRes.ok) return;

    const createRes = await fetch(`${this.baseUrl}/collections/${this.collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vectors: { size: dimensions, distance: "Cosine" } }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      throw new Error(
        `Qdrant ensureCollection failed: ${createRes.status} ${createRes.statusText} ${detail}`.trim(),
      );
    }
  }

  async upsert(items: VectorStoreItem[]): Promise<void> {
    for (const item of items) warnIfMetadataOversized(item);

    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQdrantUpsertBody(items)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Qdrant upsert failed: ${res.status} ${res.statusText} ${detail}`.trim());
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQdrantDeleteBody(ids)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Qdrant delete failed: ${res.status} ${res.statusText} ${detail}`.trim());
    }
  }

  async query(vector: number[], topK: number, filter?: VectorStoreFilter): Promise<VectorStoreQueryResult[]> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQdrantSearchBody(vector, topK, filter)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Qdrant query failed: ${res.status} ${res.statusText} ${detail}`.trim());
    }

    const body = (await res.json()) as QdrantSearchResponse;
    return (body.result ?? []).map((point) => {
      const payload = { ...(point.payload ?? {}) } as Record<string, unknown>;
      const sourceId = payload[SOURCE_ID_PAYLOAD_KEY];
      delete payload[SOURCE_ID_PAYLOAD_KEY];
      return {
        // upsert 時に付与した元の ID(SOURCE_ID_PAYLOAD_KEY)があれば復元し、無ければ
        // Qdrant の point ID をそのまま使う(このアダプタ経由で upsert していない
        // 既存データ・buildQdrantUpsertBody を介さない直接投入データ向けのフォールバック)。
        id: typeof sourceId === "string" ? sourceId : String(point.id),
        score: point.score,
        metadata: payload as VectorStoreQueryResult["metadata"],
      };
    });
  }
}
