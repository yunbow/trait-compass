// Cloudflare REST API(`POST /accounts/{accountId}/ai/run/@cf/baai/bge-m3`)を直接叩く
// `Embedder` 実装。eval ハーネス専用(TICKET-0024 拡張: 本番ベクトル経路の評価)。
//
// なぜバインディング(`src/lib/ai/providers/workers-ai-embedder.ts`)ではなく REST 直叩きか:
// eval ハーネスは Next.js/Workers のリクエストコンテキスト外の単なる Node プロセスであり、
// `env.AI` バインディングを取得する手段がない。`wrangler.toml` の `remote: true` バインディング
// (`wrangler dev --remote` 相当)を使う方法もあるが、eval のような単発の Node スクリプトには
// 大掛かりすぎるため、Cloudflare REST API を直接叩くシンプルな方式を選んだ。
//
// レスポンス形状は `workers-ai-embedder.ts` の `BgeM3EmbeddingOutput`(`{ shape, data }`)と同じ
// (`result` フィールド配下に格納される点のみ REST API 特有)。

import type { Embedder } from "@/lib/ai/embedder";
import { EMBEDDING_DIM } from "@/lib/ai/embedder";

const MODEL = "@cf/baai/bge-m3";

interface CloudflareApiError {
  code?: number;
  message?: string;
}

interface WorkersAiRunResponse {
  success?: boolean;
  errors?: CloudflareApiError[];
  result?: {
    shape?: number[];
    data?: number[][];
  };
}

/**
 * 本番 Workers AI(`@cf/baai/bge-m3`)を Cloudflare REST API 経由で叩く `Embedder`。
 * `EVAL_TARGET=production` の場合のみ `eval/lib/eval-target.ts` から生成される。
 */
export class RestWorkersAiEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIM;
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    });

    // レスポンス本文自体はログ出力しない(eval のデバッグ用途とはいえ、埋め込みベクトルの
    // 生データを不必要に標準出力へ流さないため)。エラー時のみ Cloudflare API の `errors` を
    // 例外メッセージに含める(本番の機密情報ではなくデバッグ用途のため許容)。
    const body = (await res.json().catch(() => null)) as WorkersAiRunResponse | null;

    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((e) => `[${e.code ?? "?"}] ${e.message ?? "unknown error"}`).join(", ") ?? "";
      throw new Error(`Workers AI REST API (${MODEL}) request failed (HTTP ${res.status}). ${detail}`);
    }

    return body.result?.data ?? [];
  }
}
