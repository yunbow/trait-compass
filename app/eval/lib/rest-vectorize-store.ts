// Cloudflare REST API(`POST /accounts/{accountId}/vectorize/v2/indexes/{indexName}/query`)を
// 直接叩く `VectorStore` 実装。eval ハーネス専用(TICKET-0024 拡張: 本番ベクトル経路の評価)。
//
// なぜバインディング(`src/lib/ai/providers/vectorize-vector-store.ts`)ではなく REST 直叩きか:
// `rest-workers-ai-embedder.ts` と同じ理由(eval は Next.js/Workers コンテキスト外の Node
// プロセスであり、`env.VECTORIZE` バインディングを取得できない。`wrangler.toml` の
// `remote: true` バインディングより単純な REST 直叩きを選んだ)。
//
// eval は本番データを投入しない(読み取り専用の評価のみ)ため `upsert` は未実装。

import type {
  VectorStore,
  VectorStoreFilter,
  VectorStoreItem,
  VectorStoreQueryResult,
} from "@/lib/ai/vector-store";

interface CloudflareApiError {
  code?: number;
  message?: string;
}

interface VectorizeQueryMatch {
  id: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

interface VectorizeQueryResponse {
  success?: boolean;
  errors?: CloudflareApiError[];
  result?: {
    matches?: VectorizeQueryMatch[];
  };
}

/**
 * 本番 Vectorize(`trait-compass-facilities`)を Cloudflare REST API 経由で叩く `VectorStore`。
 * `query` のみ対応(read-only)。`EVAL_TARGET=production` の場合のみ
 * `eval/lib/eval-target.ts` から生成される。
 */
export class RestVectorizeStore implements VectorStore {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly indexName: string;

  constructor(accountId: string, apiToken: string, indexName: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.indexName = indexName;
  }

  async upsert(_items: VectorStoreItem[]): Promise<void> {
    throw new Error("read-only: eval用アダプタはqueryのみ対応");
  }

  async query(vector: number[], topK: number, filter?: VectorStoreFilter): Promise<VectorStoreQueryResult[]> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize/v2/indexes/${this.indexName}/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK,
        returnMetadata: "all",
        ...(filter && Object.keys(filter).length > 0 ? { filter } : {}),
      }),
    });

    const body = (await res.json().catch(() => null)) as VectorizeQueryResponse | null;

    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((e) => `[${e.code ?? "?"}] ${e.message ?? "unknown error"}`).join(", ") ?? "";
      throw new Error(`Vectorize REST API (index: ${this.indexName}) query failed (HTTP ${res.status}). ${detail}`);
    }

    return (body.result?.matches ?? []).map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata,
    }));
  }
}
