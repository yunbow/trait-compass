import type { Vectorize, VectorizeVector } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  VectorStore,
  VectorStoreFilter,
  VectorStoreItem,
  VectorStoreQueryResult,
} from "../vector-store";
import { warnIfMetadataOversized } from "../vector-store";

// Cloudflare Vectorize(バインディング)による VectorStore 実装。本番用(local-dev-environment.md §4)。
// 参考: https://developers.cloudflare.com/vectorize/
//
// フィールド名の差異(Vectorize: `values`/`metadata` ⇄ Qdrant: `vector`/`payload`)は
// このアダプタ内で吸収し、呼び出し元は共通の `VectorStoreItem`(`vector`/`metadata`)のみを扱う。
//
// **Workers 上でのみ動作する**(`env.VECTORIZE` バインディングが必要)。ローカル開発では
// `VECTOR_PROVIDER=qdrant`(既定)を使うこと。

/** 共通の `VectorStoreItem` を Vectorize の `VectorizeVector`(`values`/`metadata`)に変換する。 */
export function toVectorizeVector(item: VectorStoreItem): VectorizeVector {
  return {
    id: item.id,
    values: item.vector,
    metadata: item.metadata,
  };
}

export class VectorizeVectorStore implements VectorStore {
  private readonly binding?: Vectorize;

  constructor(binding?: Vectorize) {
    this.binding = binding;
  }

  private getBinding(): Vectorize {
    if (this.binding) return this.binding;
    const { env } = getCloudflareContext();
    const binding = env.VECTORIZE;
    if (!binding) {
      throw new Error(
        "Vectorize binding 'VECTORIZE' is not configured. VectorizeVectorStore only works on " +
          "Cloudflare Workers (wrangler.toml [[vectorize]] binding). Use VECTOR_PROVIDER=qdrant for " +
          "local development.",
      );
    }
    return binding;
  }

  async upsert(items: VectorStoreItem[]): Promise<void> {
    for (const item of items) warnIfMetadataOversized(item);
    await this.getBinding().upsert(items.map(toVectorizeVector));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.getBinding().deleteByIds(ids);
  }

  async query(vector: number[], topK: number, filter?: VectorStoreFilter): Promise<VectorStoreQueryResult[]> {
    // `VectorStoreFilter` は Vectorize の `VectorizeVectorMetadataFilter`(`$eq/$ne/$lt/$lte/$gt/$gte`・
    // `$in/$nin` を各フィールドにネストした形)と構造的に互換なため、変換なしでそのまま渡せる
    // (2026-08是正、外部コードレビュー指摘 項目5。年齢・ライフステージの範囲/複数値フィルタ対応)。
    // Vectorize 側でフィルタが機能するには対象フィールドごとの `create-metadata-index` が
    // 事前に必要(未作成のフィールドを含む filter は 0 件になる)。呼び出し側
    // (facility-vector-search.ts の `queryFacilityIdsWithFilterCascade`)がフィルタ段階的
    // フォールバックを行うことで、インデックス未作成期間でも劣化しない設計にしている。
    const result = await this.getBinding().query(vector, {
      topK,
      returnMetadata: true,
      ...(filter && Object.keys(filter).length > 0
        ? { filter: filter as NonNullable<Parameters<Vectorize["query"]>[1]>["filter"] }
        : {}),
    });
    return result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata as VectorStoreQueryResult["metadata"],
    }));
  }
}
