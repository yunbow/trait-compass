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

  async query(vector: number[], topK: number, filter?: VectorStoreFilter): Promise<VectorStoreQueryResult[]> {
    const result = await this.getBinding().query(vector, {
      topK,
      returnMetadata: true,
      ...(filter && Object.keys(filter).length > 0 ? { filter } : {}),
    });
    return result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata as VectorStoreQueryResult["metadata"],
    }));
  }
}
