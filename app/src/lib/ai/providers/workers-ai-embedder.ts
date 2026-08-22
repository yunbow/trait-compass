import type { Ai } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Embedder } from "../embedder";
import { EMBEDDING_DIM } from "../embedder";

// Workers AI(`@cf/baai/bge-m3`)バインディング経由の埋め込み実装。
// Workers AI はローカル実行不可。wrangler dev でもクラウドにアクセスし課金される。
//
// **Workers 上でのみ動作する**(`env.AI` バインディングが必要)。ローカルの `next dev` から
// 通常フローで呼び出すと課金が発生するため、開発時は `Embedder` インターフェース越しに
// `OllamaEmbedder` へ差し替えること(`EMBEDDER_PROVIDER=ollama` が既定)。
//
// **重要(混在禁止)**: このアダプタで生成したベクトルを、Ollama で構築したローカル Qdrant
// インデックスに混在させないこと(embedder.ts のモジュール doc 参照)。
//
// TODO: `@cf/baai/bge-m3` の出力次元数は公式未確定。
// 本番で実測した値が `EMBEDDING_DIM`(1024、Ollama/HuggingFace 原典基準)と異なる場合は
// ここと embedder.ts の両方にコメントを追記すること。

const MODEL = "@cf/baai/bge-m3";

interface BgeM3EmbeddingOutput {
  shape?: number[];
  data?: number[][];
}

export class WorkersAiEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIM;
  private readonly aiBinding?: Ai;

  constructor(aiBinding?: Ai) {
    this.aiBinding = aiBinding;
  }

  private getBinding(): Ai {
    if (this.aiBinding) return this.aiBinding;
    const { env } = getCloudflareContext();
    const binding = env.AI;
    if (!binding) {
      throw new Error(
        "AI binding 'AI' is not configured. WorkersAiEmbedder only works on Cloudflare Workers " +
          "(wrangler.toml [ai] binding). Use EMBEDDER_PROVIDER=ollama for local development.",
      );
    }
    return binding;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const ai = this.getBinding();
    const output = (await ai.run(MODEL, { text: texts })) as BgeM3EmbeddingOutput;
    return output.data ?? [];
  }
}
