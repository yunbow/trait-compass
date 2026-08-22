import type { LlmClient, LlmGenerateOptions, LlmGenerateResult } from "../llm-client";
import { buildVertexRequestBody, extractTextFromVertexResponse } from "./vertex-llm-client";

// Cloudflare AI Gateway 経由で Vertex AI Gemini Flash を呼び出す実装。
// 本番の既定経路(P1 の生成 AI デフォルト)。
//
// 参考: https://developers.cloudflare.com/ai-gateway/usage/providers/vertex/
//
// NFR-34 対応(重要・回帰テスト対象): 生成 AI は Cloudflare AI Gateway 経由で呼び出し、
// ログ収集を無効化する設定を明示する。AI Gateway の `cf-aig-collect-log: false` ヘッダーを
// 必ず付与すること(このヘッダーを落とすとプロンプト内容が Cloudflare 側にログ保存され得るため、
// NFR-34/NFR-35 の「自社サーバーの保証範囲」というプライバシー訴求の前提が崩れる)。
//
// Vertex AI 側の認証は Cloudflare AI Gateway の BYOK(Bring Your Own Key、Google Vertex AI
// provider 設定で Google service account を保存する方式)を前提とする。アプリコード・環境変数には
// service account JSON を置かない(NFR-34)。BYOK 設定済みの場合、Gateway が保存済み資格情報を
// 自動注入するため `GOOGLE_VERTEX_ACCESS_TOKEN` は不要(未設定なら Authorization ヘッダーを
// 送らない)。ローカルで BYOK 抜きに疎通確認する場合のみ、短命アクセストークンを環境変数で渡すと
// Authorization ヘッダーとして送信される(2026-08是正: OAuth2 アクセストークンは既定1時間で
// 失効するため、本番ではこの経路に依存しないこと。docs/usage/vertex-ai-gemini-setup.md §3.2/3.3)。
//
// Cloudflare Gateway 自体への認証(2026-08是正で追加): AI Gateway の「認証済みゲートウェイ」
// (Authenticated Gateway)を有効にすると、Worker バインディング経由以外の HTTP リクエストは
// `cf-aig-authorization` ヘッダーが無いと Gateway の入口で拒否される(Vertex AI 側に到達する前に
// 失敗するため、原因が Vertex 認証の問題と区別しにくい)。本クライアントは fetch による直接 HTTP
// 呼び出しのため対象になる。`AI_GATEWAY_AUTH_TOKEN` が設定されている場合のみ送信する(未設定なら
// 「認証済みゲートウェイ」を無効化しておく運用。docs/usage/cloudflare-setup.md §3.6)。

const DEFAULT_MODEL = "gemini-2.5-flash";

export interface VertexGatewayLlmClientConfig {
  gatewayUrl?: string;
  project?: string;
  location?: string;
  accessToken?: string;
  authGatewayToken?: string;
  model?: string;
  cacheTtlSeconds?: number | null;
}

export function readCacheTtlSeconds(raw = process.env.AI_GATEWAY_CACHE_TTL_SECONDS): number | null {
  if (raw === undefined || raw === "" || !/^\d+$/.test(raw)) return null;
  const seconds = Number(raw);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

function readConfigFromEnv(): VertexGatewayLlmClientConfig {
  return {
    gatewayUrl: process.env.AI_GATEWAY_URL,
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION,
    accessToken: process.env.GOOGLE_VERTEX_ACCESS_TOKEN,
    authGatewayToken: process.env.AI_GATEWAY_AUTH_TOKEN,
    model: process.env.GOOGLE_VERTEX_MODEL || DEFAULT_MODEL,
    cacheTtlSeconds: readCacheTtlSeconds(),
  };
}

/**
 * Cloudflare AI Gateway 経由の Vertex AI `generateContent` エンドポイント URL を組み立てる。
 * `AI_GATEWAY_URL` はゲートウェイ直下(`https://gateway.ai.cloudflare.com/v1/{account}/{gateway}`)
 * までの値を想定し、そこに `google-vertex-ai` provider パスを付与する。
 */
export function buildVertexGatewayUrl(config: {
  gatewayUrl: string;
  project: string;
  location: string;
  model: string;
}): string {
  const base = config.gatewayUrl.replace(/\/$/, "");
  return (
    `${base}/google-vertex-ai/v1/projects/${config.project}` +
    `/locations/${config.location}/publishers/google/models/${config.model}:generateContent`
  );
}

export class VertexGatewayLlmClient implements LlmClient {
  private readonly config: VertexGatewayLlmClientConfig;

  constructor(config: VertexGatewayLlmClientConfig = readConfigFromEnv()) {
    this.config = config;
  }

  async generate(prompt: string, opts?: LlmGenerateOptions): Promise<LlmGenerateResult> {
    const {
      gatewayUrl,
      project,
      location,
      accessToken,
      authGatewayToken,
      model = DEFAULT_MODEL,
      cacheTtlSeconds,
    } = this.config;
    if (!gatewayUrl || !project || !location) {
      throw new Error(
        "VertexGatewayLlmClient is not configured. Set AI_GATEWAY_URL, GOOGLE_VERTEX_PROJECT, " +
          "GOOGLE_VERTEX_LOCATION.",
      );
    }

    const url = buildVertexGatewayUrl({ gatewayUrl, project, location, model });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // NFR-34: AI Gateway 側でのログ収集を必ず無効化する。落とさないこと。
      "cf-aig-collect-log": "false",
    };
    // BYOK(Gateway側に保存済みの Google service account)が設定済みなら Gateway が Vertex AI
    // への認証を自動注入するため、Authorization ヘッダーは送らない(2026-08是正)。
    // GOOGLE_VERTEX_ACCESS_TOKEN が設定されている場合のみ、疎通確認用に明示送信する。
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    // Gateway の「認証済みゲートウェイ」が有効な場合のみ必要(2026-08是正)。無効化している間は
    // AI_GATEWAY_AUTH_TOKEN 未設定でよく、ヘッダーも付与されない。
    if (authGatewayToken) {
      headers["cf-aig-authorization"] = `Bearer ${authGatewayToken}`;
    }
    // TICKET-0035 AC-5: AI Gateway 組み込みキャッシュは既定で無効(AI_GATEWAY_CACHE_TTL_SECONDS
    // 未設定)。有効化してよいのは、キャッシュがプロンプト/レスポンス本文をどこにどれだけ保持する
    // 仕様かを公式ドキュメントで確認し、NFR-34/NFR-36 と矛盾しないと確認できた場合のみ
    // (確認項目は docs/usage/cloudflare-setup.md §3.4)。ヘッダー名 `cf-aig-cache-ttl` は
    // 公式ドキュメント未確認のため、確認前に有効化しないこと(既定では付与されないため無害)。
    if (opts?.cacheable === true && typeof cacheTtlSeconds === "number" && cacheTtlSeconds > 0) {
      headers["cf-aig-cache-ttl"] = String(cacheTtlSeconds);
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildVertexRequestBody(prompt, opts)),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Vertex AI (via AI Gateway) generateContent failed: ${res.status} ${res.statusText} ${detail}`.trim(),
      );
    }

    const body = await res.json();
    return { text: extractTextFromVertexResponse(body) };
  }
}
