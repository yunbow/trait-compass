import type { LlmClient, LlmGenerateOptions, LlmGenerateResult } from "../llm-client";
import { buildVertexRequestBody, extractTextFromVertexResponse } from "./vertex-llm-client";

// ローカル開発用: mock-api-gemini(別リポジトリ、Gemini API 互換モックサーバー)経由で
// generateContent を呼び出す実装。LLM_PROVIDER=gemini-mock-server を設定すると、実際の
// Vertex AI/Cloudflare AI Gateway を呼ばずに、ローカルで起動した mock-api-gemini から
// 決定論的なレスポンスを受け取れる。課金なし・外部送信なしで、実際の HTTP 往復・
// エラーハンドリングを検証したい場合に使う(通常開発は引き続き LLM_PROVIDER=mock の
// in-process 固定応答で十分)。

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_API_KEY = "mock-api-key-dev1234";

export interface GeminiMockServerLlmClientConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

function readConfigFromEnv(): GeminiMockServerLlmClientConfig {
  return {
    baseUrl: process.env.GEMINI_API_BASE_URL,
    apiKey: process.env.GEMINI_MOCK_API_KEY || DEFAULT_API_KEY,
    model: process.env.GOOGLE_VERTEX_MODEL || DEFAULT_MODEL,
  };
}

/** mock-api-gemini の generateContent エンドポイント URL を組み立てる(末尾スラッシュを正規化)。 */
export function buildGeminiMockGenerateContentUrl(config: { baseUrl: string; model: string }): string {
  const base = config.baseUrl.replace(/\/$/, "");
  return `${base}/v1beta/models/${config.model}:generateContent`;
}

export class GeminiMockServerLlmClient implements LlmClient {
  private readonly config: GeminiMockServerLlmClientConfig;

  constructor(config: GeminiMockServerLlmClientConfig = readConfigFromEnv()) {
    this.config = config;
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const { baseUrl, apiKey = DEFAULT_API_KEY, model = DEFAULT_MODEL } = this.config;
    if (!baseUrl) {
      throw new Error(
        "GeminiMockServerLlmClient is not configured. Set GEMINI_API_BASE_URL " +
          "(mock-api-gemini のベース URL。例: http://localhost:3001)。",
      );
    }

    const url = buildGeminiMockGenerateContentUrl({ baseUrl, model });
    const requestBody = buildVertexRequestBody(prompt, opts);
    // Gemini 2.5 系は既定で thinking(内部思考)が有効なため、決定的・低コストな短文生成を
    // 目的とする本アプリの用途(要約・レコメンド理由文等)では明示的に無効化する
    // (thinkingBudget: 0)。この調整は gemini-mock-server 経由の呼び出しのみに閉じ、
    // buildVertexRequestBody 自体(vertex-direct/vertex-gateway と共有)は変更しない。
    const generationConfig = {
      ...requestBody.generationConfig,
      thinkingConfig: { thinkingBudget: 0 },
    };
    requestBody.generationConfig = generationConfig;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Gemini mock server (mock-api-gemini) generateContent failed: ${res.status} ${res.statusText} ${detail}`.trim(),
      );
    }

    const body = await res.json();
    return { text: extractTextFromVertexResponse(body) };
  }
}
