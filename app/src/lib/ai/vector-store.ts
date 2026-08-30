import type { Vectorize } from "@cloudflare/workers-types";
import { QdrantVectorStore } from "./providers/qdrant-vector-store";
import { VectorizeVectorStore } from "./providers/vectorize-vector-store";

// ベクトルストアの抽象インターフェースとファクトリ。
//
// **設計上の必須事項**: Vectorize と Qdrant は API 互換性が
// 皆無(バインディング RPC vs REST、`values`⇄`vector` 等フィールド名も異なる)なため、
// `VectorStore` インターフェースでフィールド名差異を吸収する。

/** ベクトルストアに保存する1レコード。メタデータの値は文字列のみ 64 バイト制約(NFR-23)の対象。 */
export interface VectorStoreItem {
  id: string;
  vector: number[];
  metadata?: Record<string, string | number | boolean>;
}

/** クエリ結果の1レコード。 */
export interface VectorStoreQueryResult {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * メタデータ値に対する比較演算子付きフィルタ条件(2026-08是正、外部コードレビュー指摘 項目5:
 * 年齢・ライフステージ絞り込みの VectorStore フィルタ対応)。
 *
 * - `$in`: 複数値のいずれかに一致(例: `age_range` が `'both'` または選択した年齢区分)。
 * - `$lte`/`$gte`: 数値の範囲比較(例: `lifestage_min <= 選択序数`、`lifestage_max >= 選択序数`)。
 *   施設側は範囲(min〜max)、クエリ側は単一値という非対称な関係を、`lifestage_min` フィールドに
 *   `{ $lte: 選択序数 }`、`lifestage_max` フィールドに `{ $gte: 選択序数 }` を別々に指定する
 *   ことで表現する(1フィールド1演算子。AND 結合は複数キーで表現)。
 * - `$eq`: 単一値との一致(プレーンな scalar 値と同義。明示したい場合のみ使う)。
 *
 * Vectorize(`$eq/$ne/$lt/$lte/$gt/$gte`・`$in/$nin`)・Qdrant(`match`/`range`)双方への変換は
 * 各プロバイダ実装(vectorize-vector-store.ts の pass-through、qdrant-vector-store.ts の
 * `buildQdrantFilter`)側で行う。
 */
export interface VectorStoreFilterCondition {
  $eq?: string | number | boolean;
  $in?: (string | number)[];
  $lte?: number;
  $gte?: number;
}

export type VectorStoreFilterValue = string | number | boolean | VectorStoreFilterCondition;

export type VectorStoreFilter = Record<string, VectorStoreFilterValue>;

/**
 * ベクトルストアの抽象インターフェース。
 * 実装は `qdrant`(ローカル・REST) / `vectorize`(本番・バインディング)の2種類があり、
 * `createVectorStore()` が `VECTOR_PROVIDER` 環境変数で切り替える。
 */
export interface VectorStore {
  upsert(items: VectorStoreItem[]): Promise<void>;
  query(vector: number[], topK: number, filter?: VectorStoreFilter): Promise<VectorStoreQueryResult[]>;
  /**
   * 指定した ID(`VectorStoreItem.id`。呼び出し元にとっては施設 ID などのソース ID)のレコードを削除する。
   * 空配列が渡された場合は何もせず正常終了する(呼び出し側が削除対象なしのケースを都度分岐しなくて済むように)。
   */
  delete(ids: string[]): Promise<void>;
}

export type VectorStoreProvider = "qdrant" | "vectorize";

const DEFAULT_PROVIDER: VectorStoreProvider = "qdrant";

/**
 * メタデータ文字列値の 64 バイト制約(NFR-23: 「Vectorize の upsert 後 5〜10 秒の結果整合性遅延、
 * メタデータ文字列 64 バイト切り捨てを前提に設計する」)を超過するキーを警告付きで検出する。
 * バイト長は UTF-8 換算(`TextEncoder`)で判定する(日本語は1文字3バイト程度になり得るため)。
 */
export function findOversizedMetadataKeys(
  metadata: Record<string, string | number | boolean> | undefined,
  limitBytes = 64,
): string[] {
  if (!metadata) return [];
  const encoder = new TextEncoder();
  return Object.entries(metadata)
    .filter(([, value]) => typeof value === "string" && encoder.encode(value).length > limitBytes)
    .map(([key]) => key);
}

/**
 * メタデータの 64 バイト制約超過を検出し、超過している場合は `console.warn` で警告する。
 * Vectorize は超過分を黙って切り捨てる(NFR-23)ため、例外は投げず警告に留める
 * (呼び出し元の upsert 自体は継続させる)。
 */
export function warnIfMetadataOversized(item: Pick<VectorStoreItem, "id" | "metadata">): void {
  const oversizedKeys = findOversizedMetadataKeys(item.metadata);
  if (oversizedKeys.length > 0) {
    console.warn(
      `[VectorStore] metadata field(s) [${oversizedKeys.join(", ")}] on item "${item.id}" exceed the ` +
        "64-byte string limit (NFR-23) and may be silently truncated by Vectorize.",
    );
  }
}

function readProviderFromEnv(): VectorStoreProvider {
  const raw = process.env.VECTOR_PROVIDER;
  if (raw === "vectorize" || raw === "qdrant") {
    return raw;
  }
  return DEFAULT_PROVIDER;
}

/**
 * `VECTOR_PROVIDER` 環境変数(`qdrant` | `vectorize`)に応じた `VectorStore` を生成する。
 * 未設定時は `qdrant` が既定(ローカル開発でのクラウド課金を避けるため)。
 *
 * `vectorize` は `env.VECTORIZE` バインディング経由でのみ動作するため、Workers 上
 * (本番 / `wrangler dev`)からのみ指定すること。`vectorizeBinding` を明示的に渡した場合は
 * それを使う(`getCloudflareContext()` が使えない別 Worker、例: workers/ingest から
 * `this.env.VECTORIZE` を渡すケースを想定。`createEmbedder` の `aiBinding` 引数と同じ設計)。
 * 未指定時は従来どおり `VectorizeVectorStore` 内部で `getCloudflareContext()` 経由の解決を試みる。
 */
export function createVectorStore(
  provider: VectorStoreProvider = readProviderFromEnv(),
  vectorizeBinding?: Vectorize,
): VectorStore {
  switch (provider) {
    case "vectorize":
      return new VectorizeVectorStore(vectorizeBinding);
    case "qdrant":
    default:
      return new QdrantVectorStore();
  }
}
