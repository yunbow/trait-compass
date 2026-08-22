import type { Embedder } from "../embedder";
import { EMBEDDING_DIM } from "../embedder";

// Ollama(`bge-m3`)による埋め込み実装。OpenAI 互換 `/v1/embeddings` を使う。
// 参考: https://ollama.com/library/bge-m3
//
// **重要(混在禁止)**: このアダプタで構築した Qdrant インデックスに、Workers AI
// (`@cf/baai/bge-m3`)産のベクトルを混在させないこと(embedder.ts のモジュール doc 参照)。

const DEFAULT_BASE_URL = "http://localhost:11434";
const MODEL = "bge-m3";

interface OllamaEmbeddingsResponse {
  data?: { embedding: number[] }[];
}

export interface OllamaEmbedderConfig {
  baseUrl?: string;
}

function readConfigFromEnv(): OllamaEmbedderConfig {
  return { baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL };
}

/** OpenAI 互換 `/v1/embeddings` のリクエストボディを組み立てる。 */
export function buildOllamaEmbeddingsRequestBody(texts: string[]) {
  return { model: MODEL, input: texts };
}

export class OllamaEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIM;
  private readonly baseUrl: string;

  constructor(config: OllamaEmbedderConfig = readConfigFromEnv()) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOllamaEmbeddingsRequestBody(texts)),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText} ${detail}`.trim());
    }

    const body = (await res.json()) as OllamaEmbeddingsResponse;
    return (body.data ?? []).map((item) => item.embedding);
  }
}
