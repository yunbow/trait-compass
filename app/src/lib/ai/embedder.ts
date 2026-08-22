import type { Ai } from "@cloudflare/workers-types";
import { OllamaEmbedder } from "./providers/ollama-embedder";
import { WorkersAiEmbedder } from "./providers/workers-ai-embedder";

// 埋め込み(embedding)生成の抽象インターフェースとファクトリ。
//
// **重要(混在禁止)**: ローカルの Qdrant インデックスはローカルの Ollama 埋め込みでのみ構築し、
// 本番(Workers AI `@cf/baai/bge-m3`)由来のベクトルと混在させないこと。
// `@cf/baai/bge-m3` の出力次元数は公式ドキュメントに明記がなく(2026年7月時点)、HuggingFace 原典は
// 1024 次元だが Workers AI 側で完全に一致する保証はない。同一の Qdrant コレクションに
// Ollama 産と Workers AI 産のベクトルを混在させると、コサイン類似度の意味が崩れて検索結果が
// 破綻するため、環境(ローカル/本番)ごとに埋め込み元を統一する運用を必須とする。

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export type EmbedderProvider = "ollama" | "workers-ai";

const DEFAULT_PROVIDER: EmbedderProvider = "ollama";

/**
 * Ollama(`bge-m3`)実測時点の次元数。HuggingFace 原典(1024 次元)に基づく想定値。
 * TODO: Ollama `bge-m3` を実際に pull・実行して実測し、
 * 差異があればこの定数と Workers AI 側の実測値の両方をコメントに追記すること。
 */
export const EMBEDDING_DIM = 1024;

function readProviderFromEnv(): EmbedderProvider {
  const raw = process.env.EMBEDDER_PROVIDER;
  if (raw === "workers-ai" || raw === "ollama") {
    return raw;
  }
  return DEFAULT_PROVIDER;
}

/**
 * `EMBEDDER_PROVIDER` 環境変数(`ollama` | `workers-ai`)に応じた `Embedder` を生成する。
 * 未設定時は `ollama` が既定(ローカル開発でのクラウド課金を避けるため)。
 *
 * `workers-ai` は `env.AI` バインディング経由でのみ動作するため、Workers 上(本番 / `wrangler dev`)
 * からのみ指定すること。`next dev` 上のブラウザ相当コンテキストで指定すると
 * バインディング未設定エラーになる。
 */
export function createEmbedder(
  provider: EmbedderProvider = readProviderFromEnv(),
  aiBinding?: Ai,
): Embedder {
  switch (provider) {
    case "workers-ai":
      return new WorkersAiEmbedder(aiBinding);
    case "ollama":
    default:
      return new OllamaEmbedder();
  }
}
