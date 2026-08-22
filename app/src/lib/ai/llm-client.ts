import { GeminiMockServerLlmClient } from "./providers/gemini-mock-server-llm-client";
import { MockLlmClient } from "./providers/mock-llm-client";
import { VertexLlmClient } from "./providers/vertex-llm-client";
import { VertexGatewayLlmClient } from "./providers/vertex-gateway-llm-client";

// LLM クライアントの抽象インターフェースとファクトリ。
//
// 設計方針:
// - 生成 AI(Vertex AI Gemini Flash 等)は Docker 化できないため、`LlmClient` インターフェースを
//   切り、通常の開発では課金・データ汚染が発生しない `MockLlmClient` を既定 provider にする
//   (FR-041)。
// - 本番は Cloudflare AI Gateway 経由の Vertex AI(BYOK)を既定とし、ログ収集を無効化する
//   (NFR-34)。Vertex AI 直叩きは結合確認・デバッグ用の代替経路として用意する。

/**
 * Structured Output(Gemini API `generationConfig.responseSchema`)用の任意スキーマ
 * (OpenAPI subset 形式の素のオブジェクト)。zod スキーマからこの形式への変換は呼び出し側の
 * 責務とする(現状の利用元は `eval/lib/llm-judge.ts` の LLM-as-judge ハーネスのみ)。
 */
export type LlmResponseSchema = Record<string, unknown>;

/** `LlmClient.generate()` に渡す任意オプション。 */
export interface LlmGenerateOptions {
  /** モデルに与えるシステム指示(非診断プロンプト制約などを注入する想定。FR-044)。 */
  systemInstruction?: string;
  /** 生成トークン数の上限。 */
  maxOutputTokens?: number;
  /** サンプリング温度(0〜1 目安)。 */
  temperature?: number;
  /**
   * このプロンプトがユーザーの自由記述を一切含まない場合のみ true を指定する(TICKET-0035 AC-5)。
   * true かつ AI_GATEWAY_CACHE_TTL_SECONDS が設定されている場合に限り、AI Gateway の
   * 組み込みキャッシュを利用する。自由記述を含むプロンプト(/api/summarize・/api/recommend)は
   * 指定してはならない。プロンプト内容が Cloudflare 側に保持されると NFR-34/NFR-36 の
   * 「ログ非保存」の前提が崩れるため。
   */
  cacheable?: boolean;
  /**
   * Structured Output を強制する場合の JSON スキーマ(OpenAPI subset、Gemini API
   * `generationConfig.responseSchema` 形式)。指定時は `responseMimeType: "application/json"` も
   * 併せて設定される(`vertex-llm-client.ts` の `buildVertexRequestBody` 参照)。既存の呼び出し元
   * (`/api/summarize`・`/api/recommend` 等)は指定しないため、未指定時の挙動は変わらない
   * (opt-in の追加)。
   */
  responseSchema?: LlmResponseSchema;
}

/** `LlmClient.generate()` の戻り値。 */
export interface LlmGenerateResult {
  text: string;
}

/**
 * LLM 呼び出しの抽象インターフェース。
 * 実装は `mock` / `vertex-direct`(Vertex AI 直叩き) / `vertex-gateway`(Cloudflare AI Gateway 経由) /
 * `gemini-mock-server`(mock-api-gemini 経由)の4種類があり、`createLlmClient()` が `LLM_PROVIDER`
 * 環境変数で切り替える。
 */
export interface LlmClient {
  generate(prompt: string, opts?: LlmGenerateOptions): Promise<LlmGenerateResult>;
}

export type LlmProvider = "mock" | "vertex-direct" | "vertex-gateway" | "gemini-mock-server";

const DEFAULT_PROVIDER: LlmProvider = "mock";

function readProviderFromEnv(): LlmProvider {
  const raw = process.env.LLM_PROVIDER;
  if (raw === "vertex-direct" || raw === "vertex-gateway" || raw === "gemini-mock-server" || raw === "mock") {
    return raw;
  }
  return DEFAULT_PROVIDER;
}

/**
 * `LLM_PROVIDER` 環境変数(`mock` | `vertex-direct` | `vertex-gateway` | `gemini-mock-server`)に応じた
 * `LlmClient` を生成する。
 * 未設定時は `mock` が既定(通常の開発ではクラウド課金・データ送信を発生させないため)。
 */
export function createLlmClient(provider: LlmProvider = readProviderFromEnv()): LlmClient {
  switch (provider) {
    case "vertex-direct":
      return new VertexLlmClient();
    case "vertex-gateway":
      return new VertexGatewayLlmClient();
    case "gemini-mock-server":
      return new GeminiMockServerLlmClient();
    case "mock":
    default:
      return new MockLlmClient();
  }
}
