import { AwsClient } from "aws4fetch";

// S3 互換ストレージ(R2 本番 / MinIO ローカル)クライアント。
//
// 設計方針:
// - `env.BUCKET` のような Cloudflare バインディングではなく、aws4fetch による
//   S3 互換 API 経由でアクセスする。これにより本番(R2)/ローカル(MinIO)を
//   コード分岐なしで `R2_*` 環境変数の値だけで切り替えられる。
// - パス形式 URL(`endpoint/bucket/key`)を使う。R2 / MinIO いずれもこの形式で動作する。
// - 公開 URL は `R2_PUBLIC_URL` をベースに組み立てる。`R2_ENDPOINT`(S3 互換管理エンドポイント)
//   を公開 URL に使うと内部エンドポイントの露出やアクセス制御の不整合につながるため使わない。

export interface R2Config {
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  endpoint?: string;
  publicUrl?: string;
}

function readConfigFromEnv(): R2Config {
  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
    publicUrl: process.env.R2_PUBLIC_URL,
  };
}

/**
 * R2/MinIO が利用可能かどうかを判定する。
 * 5変数すべてが設定されている場合のみ有効(公開 URL が無いと画像を配信できないため必須)。
 */
export function isR2Enabled(config: R2Config): boolean {
  return Boolean(
    config.accessKeyId &&
      config.secretAccessKey &&
      config.bucketName &&
      config.endpoint &&
      config.publicUrl,
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function stripLeadingSlash(key: string): string {
  return key.replace(/^\/+/, "");
}

/**
 * S3 互換 API のオブジェクト URL(パス形式: endpoint/bucket/key)を組み立てる。
 * PUT/GET/DELETE の対象 URL として使用する。
 */
export function buildObjectEndpointUrl(
  config: Pick<R2Config, "endpoint" | "bucketName">,
  key: string,
): string {
  if (!config.endpoint || !config.bucketName) {
    throw new Error("R2_ENDPOINT and R2_BUCKET_NAME are required to build an object URL");
  }
  return `${stripTrailingSlash(config.endpoint)}/${config.bucketName}/${stripLeadingSlash(key)}`;
}

/**
 * 公開配信用 URL(R2_PUBLIC_URL ベース)を組み立てる。
 * アップロード完了後にクライアントへ返す URL はこちらを使う。
 */
export function buildPublicObjectUrl(
  config: Pick<R2Config, "publicUrl">,
  key: string,
): string {
  if (!config.publicUrl) {
    throw new Error("R2_PUBLIC_URL is required to build a public object URL");
  }
  return `${stripTrailingSlash(config.publicUrl)}/${stripLeadingSlash(key)}`;
}

const config = readConfigFromEnv();

/** R2/MinIO が利用可能かどうか(5変数すべて設定時のみ true)。 */
export const R2_ENABLED = isR2Enabled(config);

let cachedClient: AwsClient | null = null;

function getClient(): AwsClient {
  if (!R2_ENABLED) {
    throw new Error(
      "R2 is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT, R2_PUBLIC_URL.",
    );
  }
  if (!cachedClient) {
    // aws4fetch は SigV4 署名を fetch に被せる軽量ライブラリ。@aws-sdk/client-s3 の
    // 巨大バンドルを避けつつ R2/MinIO(S3 互換)にアクセスする。Node/Workers いずれの
    // fetch 実装でも動作する。
    cachedClient = new AwsClient({
      accessKeyId: config.accessKeyId!,
      secretAccessKey: config.secretAccessKey!,
      service: "s3",
      region: "auto",
    });
  }
  return cachedClient;
}

/** アップロード後にクライアントへ返す公開 URL を得る(実ネットワークアクセスなし)。 */
export function getObjectUrl(key: string): string {
  return buildPublicObjectUrl(config, key);
}

export interface PutObjectParams {
  key: string;
  body: BodyInit;
  contentType: string;
  cacheControl?: string;
}

/** オブジェクトを PUT し、公開 URL を返す。 */
export async function putObject({
  key,
  body,
  contentType,
  cacheControl = "public, max-age=31536000, immutable",
}: PutObjectParams): Promise<string> {
  const client = getClient();
  const url = buildObjectEndpointUrl(config, key);
  const res = await client.fetch(url, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 upload failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
  return getObjectUrl(key);
}

/** オブジェクトを GET し、Response をそのまま返す。 */
export async function getObject(key: string): Promise<Response> {
  const client = getClient();
  const url = buildObjectEndpointUrl(config, key);
  const res = await client.fetch(url, { method: "GET" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 get failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
  return res;
}

/** オブジェクトを削除する。 */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  const url = buildObjectEndpointUrl(config, key);
  const res = await client.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 delete failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
}
