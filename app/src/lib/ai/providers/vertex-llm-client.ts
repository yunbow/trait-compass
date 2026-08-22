import type { LlmClient, LlmGenerateOptions, LlmGenerateResult } from "../llm-client";

// Vertex AI Gemini Flash への直叩き実装(`generateContent` エンドポイント)。
// 参考: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference
//
// 用途: 本番は Cloudflare AI Gateway 経由(`VertexGatewayLlmClient`、NFR-34)を既定にするため、
// 本実装は結合確認・デバッグ用の代替経路として位置づける。
//
// 認証: サービスアカウント JSON をアプリコード・環境変数に置かず(NFR-34)、
// 短命の OAuth2 アクセストークン(`gcloud auth print-access-token` 等で発行)を
// `GOOGLE_VERTEX_ACCESS_TOKEN` として都度セットする運用を前提とする。

const DEFAULT_MODEL = "gemini-2.5-flash";

interface VertexGenerateContentResponse {
  candidates?: {
    content?: {
      parts?: { text?: string; thought?: boolean }[];
    };
  }[];
}

export interface VertexLlmClientConfig {
  project?: string;
  location?: string;
  accessToken?: string;
  model?: string;
}

function readConfigFromEnv(): VertexLlmClientConfig {
  return {
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION,
    accessToken: process.env.GOOGLE_VERTEX_ACCESS_TOKEN,
    model: process.env.GOOGLE_VERTEX_MODEL || DEFAULT_MODEL,
  };
}

/** Vertex AI `generateContent` の直叩きエンドポイント URL を組み立てる。 */
export function buildVertexGenerateContentUrl(config: {
  project: string;
  location: string;
  model: string;
}): string {
  return (
    `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.project}` +
    `/locations/${config.location}/publishers/google/models/${config.model}:generateContent`
  );
}

/** Vertex AI `generateContent` リクエストボディを組み立てる。 */
export function buildVertexRequestBody(prompt: string, opts?: LlmGenerateOptions) {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(opts?.systemInstruction
      ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
      : {}),
    generationConfig: {
      ...(opts?.maxOutputTokens !== undefined && { maxOutputTokens: opts.maxOutputTokens }),
      ...(opts?.temperature !== undefined && { temperature: opts.temperature }),
      // Structured Output(opt-in)。`responseSchema` 指定時のみ付与する。既存の呼び出し元は
      // 指定しないため、未指定時はこれまでどおり generationConfig にこの2フィールドが
      // 含まれない(挙動は一切変わらない)。
      ...(opts?.responseSchema !== undefined && {
        responseMimeType: "application/json",
        responseSchema: opts.responseSchema,
      }),
    },
  };
}

/** `generateContent` レスポンスから最初の候補のテキストを取り出す。 */
export function extractTextFromVertexResponse(body: VertexGenerateContentResponse): string {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  // Gemini 2.5 系の thinking 機能が有効な場合、応答に `thought: true` の思考サマリーパートが
  // 混在することがある。最終的なテキストにはこれを含めない(通常応答には `thought` フィールド
  // 自体が存在しないため、この除外は既存の非 thinking モデルの挙動には影響しない)。
  return parts
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? "")
    .join("");
}

export class VertexLlmClient implements LlmClient {
  private readonly config: VertexLlmClientConfig;

  constructor(config: VertexLlmClientConfig = readConfigFromEnv()) {
    this.config = config;
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const { project, location, accessToken, model = DEFAULT_MODEL } = this.config;
    if (!project || !location || !accessToken) {
      throw new Error(
        "VertexLlmClient is not configured. Set GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION, " +
          "GOOGLE_VERTEX_ACCESS_TOKEN.",
      );
    }

    const url = buildVertexGenerateContentUrl({ project, location, model });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildVertexRequestBody(prompt, opts)),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Vertex AI generateContent failed: ${res.status} ${res.statusText} ${detail}`.trim());
    }

    const body = (await res.json()) as VertexGenerateContentResponse;
    return { text: extractTextFromVertexResponse(body) };
  }
}
