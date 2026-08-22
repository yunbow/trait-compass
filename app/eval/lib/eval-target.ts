// 検索精度評価(eval/retrieval.eval.ts)の評価対象経路(EVAL_TARGET)を管理する薄いモジュール。
// TICKET-0024 拡張: 本番 Vectorize(`trait-compass-facilities`)/Workers AI(`@cf/baai/bge-m3`)
// への疎通を REST API 直叩き(rest-workers-ai-embedder.ts / rest-vectorize-store.ts)で検証できる
// ようにする。既存のローカル Qdrant/Ollama 疎通ロジックは本ファイルに移設した。
//
// `EVAL_TARGET` 環境変数:
//   - "production": 本番 Vectorize/Workers AI に REST API で直接クエリする。
//     `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` が無ければ**即座にエラー**(下記参照)。
//   - "local": ローカル Qdrant/Ollama への疎通を確認し、疎通できればベクトル検索経路、
//     できなければタグベース検索経路(グレースフルフォールバック)。
//   - "auto"(既定・未設定時): 従来の `retrieval.eval.ts` と完全互換の挙動
//     (ローカル Qdrant/Ollama 疎通確認 → ダメならタグフォールバック)。既定動作は変更しない。

import type { Embedder } from "@/lib/ai/embedder";
import { createEmbedder } from "@/lib/ai/embedder";
import type { VectorStore } from "@/lib/ai/vector-store";
import { createVectorStore } from "@/lib/ai/vector-store";

import { RestWorkersAiEmbedder } from "./rest-workers-ai-embedder";
import { RestVectorizeStore } from "./rest-vectorize-store";

export type EvalTarget = "production" | "local" | "auto";

/** `batch/wrangler.ingest.toml` の `[[vectorize]] index_name` と同じ値。 */
const VECTORIZE_INDEX_NAME = "trait-compass-facilities";

const VECTOR_CHECK_TIMEOUT_MS = 1500;

export function readEvalTarget(): EvalTarget {
  const raw = process.env.EVAL_TARGET;
  if (raw === "production" || raw === "local") return raw;
  return "auto";
}

/** ローカルの Qdrant(`:6333`)・Ollama(`:11434`)の両方に疎通できるかを確認する。 */
export async function isVectorStackAvailable(): Promise<boolean> {
  const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  try {
    const [qdrantRes, ollamaRes] = await Promise.all([
      fetch(`${qdrantUrl}/collections`, { signal: AbortSignal.timeout(VECTOR_CHECK_TIMEOUT_MS) }),
      fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(VECTOR_CHECK_TIMEOUT_MS) }),
    ]);
    return qdrantRes.ok && ollamaRes.ok;
  } catch {
    return false;
  }
}

export type RetrievalPath = "vector-production" | "vector-local" | "tag-fallback";

export interface RetrievalDeps {
  /** `usedPath` が `"tag-fallback"` の場合は未設定(タグ検索は Embedder/VectorStore を使わない)。 */
  embedder?: Embedder;
  vectorStore?: VectorStore;
  usedPath: RetrievalPath;
}

async function resolveLocalOrFallback(): Promise<RetrievalDeps> {
  const available = await isVectorStackAvailable();
  if (!available) return { usedPath: "tag-fallback" };
  return {
    embedder: createEmbedder("ollama"),
    vectorStore: createVectorStore("qdrant"),
    usedPath: "vector-local",
  };
}

/**
 * `EVAL_TARGET` に応じて検索精度評価が使う `Embedder`/`VectorStore` を解決する。
 *
 * `"production"` は既存の「疎通できなければタグ検索へグレースフルフォールバック」という
 * 設計思想とは**意図的に異なる**扱いにする: 必要な環境変数が無い場合は静かにフォールバック
 * せず即座にエラーを投げる。理由は、本番経路の検証を明示的に要求しているのに黙って別の
 * (意味の異なる)経路にフォールバックしてしまうと、レポート上は「評価した」ように見えて
 * 実際には本番経路を一度も検証していない、という事故につながるため。
 */
export async function resolveRetrievalDeps(): Promise<RetrievalDeps> {
  const target = readEvalTarget();

  if (target === "production") {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      throw new Error(
        "EVAL_TARGET=production には CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN の両方が必要です。" +
          "本番 Vectorize/Workers AI への評価を明示的に要求しているため、" +
          "(local/auto のようにローカル Qdrant/Ollama へ静かにフォールバックせず)即座にエラーとしています。",
      );
    }
    return {
      embedder: new RestWorkersAiEmbedder(accountId, apiToken),
      vectorStore: new RestVectorizeStore(accountId, apiToken, VECTORIZE_INDEX_NAME),
      usedPath: "vector-production",
    };
  }

  // "local" / "auto" は同じロジック(ローカル疎通確認 → ダメならタグフォールバック)。
  // "auto" が既定であり、これは EVAL_TARGET 導入前の retrieval.eval.ts と完全互換の挙動。
  return resolveLocalOrFallback();
}
