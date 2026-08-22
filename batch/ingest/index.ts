// オープンデータ取込 Worker(TICKET-0011)のエントリポイント。
//
// Next.js アプリ本体(wrangler.toml)とは別 Worker として動作する
// (`@opennextjs/cloudflare` は scheduled ハンドラを扱えないため)。
//
// - scheduled: Cron Triggers(週1回、wrangler.ingest.toml [triggers])から IngestWorkflow を起動する。
// - scheduled: 別のCron Trigger(1日1回)で、掲載情報の訂正・更新報告(facility_reports/
//   content_reports)の未対応件数を集計し、1件以上あれば Slack へ件数のみ通知する
//   (report-digest.ts参照。報告1件ごとの即時・自由記述全文送信は廃止した)。同じCronで、
//   トリアージ済み(done/dismissed)から
//   90日経過した報告の自由記述(corrected_value/detail_text)を削除する
//   (セキュリティレビュー指摘、report-retention.ts参照。専用のCron Triggerは追加しない)。
//   さらに同じCronで、フィードバックコメント(feedback_comments、TICKET-0067)のうち
//   公開許可済みでまだレビューされていない件数も同様に集計し、1件以上あれば Slack へ
//   件数のみ通知する(feedback-digest.ts参照。専用のCron Triggerは追加しない)。
// - fetch: ローカル手動発火用に POST /trigger で同じ IngestWorkflow を起動する
//   (本番相当の発火は `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`。
//   TICKET-0011 AC-7)。
// - fetch: GET /health で datasets の死活監視・鮮度チェック結果を返す
//   (TICKET-0012、FR-029、NFR-25、NFR-62)。
// - fetch: POST /embed でローカル開発用に埋め込み生成・Qdrant 投入を手動発火する
//   (TICKET-0021、FR-03A。OllamaEmbedder + QdrantVectorStore。本番の Workers AI +
//   Vectorize 経路とは独立。docker-compose の qdrant/ollama が起動している前提)。

import {
  computeStaleDays,
  STALE_THRESHOLD_DAYS,
  type DatasetStatusRow,
} from "../../app/src/features/support/services/dataset-status";
import { createEmbedder, EMBEDDING_DIM } from "../../app/src/lib/ai/embedder";
import { QdrantVectorStore } from "../../app/src/lib/ai/providers/qdrant-vector-store";
import { postSlackMessage } from "../../app/src/lib/notify/slack";
import { runEmbedPipeline } from "./embed-pipeline";
import { buildFeedbackDigestMessage, countPendingFeedbackComments } from "./feedback-digest";
import { buildReportDigestMessage, countNewReports } from "./report-digest";
import { purgeExpiredReports } from "./report-retention";
import { IngestWorkflow, type IngestEnv, type IngestWorkflowParams } from "./workflow";

export { IngestWorkflow };

interface Env extends IngestEnv {
  INGEST_WORKFLOW: Workflow<IngestWorkflowParams>;
}

const TRIGGER_PATH = "/trigger";
const HEALTH_PATH = "/health";
const EMBED_PATH = "/embed";

// 掲載情報訂正報告の日次ダイジェスト(§report-digest.ts)専用の Cron 式。
// 00:00 UTC = 09:00 JST(週1回のオープンデータ取込 Cron とは別トリガーとして
// wrangler.ingest.toml の [triggers] に併記する)。
const REPORT_DIGEST_CRON = "0 0 * * *";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === TRIGGER_PATH) {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleManualTrigger(request, env);
    }

    if (url.pathname === HEALTH_PATH) {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
      }
      return handleHealth(env);
    }

    if (url.pathname === EMBED_PATH) {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleManualEmbed(env);
    }

    if (url.pathname === "/") {
      return Response.json({ ok: true, worker: "trait-compass-ingest" });
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === REPORT_DIGEST_CRON) {
      ctx.waitUntil(runReportDigest(env));
      ctx.waitUntil(runFeedbackDigest(env));
      ctx.waitUntil(purgeExpiredReports(env.DB));
      return;
    }

    ctx.waitUntil(
      env.INGEST_WORKFLOW.create({
        id: `scheduled-${controller.scheduledTime}`,
        params: {},
      }),
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * 掲載情報の訂正・更新報告の未対応件数を集計し、1件以上あれば Slack へ件数のみ通知する
 * (自由記述・施設名は一切送らない。report-digest.ts参照)。`postSlackMessage` 自体が
 * `SLACK_WEBHOOK_URL` 未設定時は何もせず、送信失敗も握りつぶす設計のため、ここでは
 * D1 集計の失敗のみを考慮すればよい。
 */
async function runReportDigest(env: Env): Promise<void> {
  const counts = await countNewReports(env.DB);
  const message = buildReportDigestMessage(counts);
  if (message === null) return;
  await postSlackMessage(message);
}

/**
 * 公開許可済みでまだレビューされていないフィードバックコメント(feedback_comments)の件数を
 * 集計し、1件以上あれば Slack へ件数のみ通知する(本文は一切送らない。feedback-digest.ts参照)。
 */
async function runFeedbackDigest(env: Env): Promise<void> {
  const pendingCount = await countPendingFeedbackComments(env.DB);
  const message = buildFeedbackDigestMessage(pendingCount);
  if (message === null) return;
  await postSlackMessage(message);
}

/** POST /trigger: ローカル動作確認用の手動発火(TICKET-0011 AC-7)。 */
async function handleManualTrigger(request: Request, env: Env): Promise<Response> {
  const datasetIds = await readDatasetIdsFromBody(request);

  const instance = await env.INGEST_WORKFLOW.create({
    id: `manual-${Date.now()}`,
    params: { datasetIds },
  });

  return Response.json(
    { ok: true, instanceId: instance.id, status: await instance.status() },
    { status: 202 },
  );
}

/**
 * GET /health: D1 の datasets を死活監視・鮮度チェックの観点で読み取り、JSON で返す
 * (TICKET-0012 AC-1/AC-2、FR-029、NFR-25、NFR-62)。
 *
 * 判定ロジック(閾値・経過日数計算)は src/features/support/services/dataset-status.ts の
 * 純関数を使い、フォールバック表示ヘルパー(TICKET-0015 が使う getUnhealthyDatasets)と
 * 単一の閾値定数を共有する。
 */
async function handleHealth(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, is_alive AS isAlive, fetched_at AS fetchedAt FROM datasets ORDER BY id`,
  ).all<DatasetStatusRow>();

  const now = new Date();
  const datasets = (results ?? []).map((row) => ({
    id: row.id,
    isAlive: row.isAlive === 1,
    fetchedAt: row.fetchedAt,
    staleDays: computeStaleDays(row.fetchedAt, now),
  }));

  const staleCount = datasets.filter((d) => d.staleDays > STALE_THRESHOLD_DAYS).length;
  const deadCount = datasets.filter((d) => !d.isAlive).length;

  return Response.json({ datasets, staleCount, deadCount });
}

/**
 * POST /embed: ローカル開発用の手動埋め込み投入(TICKET-0021、FR-03A)。
 *
 * `OllamaEmbedder` + `QdrantVectorStore`(docker-compose の qdrant/ollama)を使い、
 * D1 の facilities(ライセンス区分 A/F/G=risk_level 'low' のみ、workers/ingest/embed-pipeline.ts
 * を参照)を埋め込み生成 → Qdrant へ upsert する。本番相当の経路(Workers 上での
 * IngestWorkflow の `EMBEDDINGS_ENABLED` ゲート、`WorkersAiEmbedder` + `VectorizeVectorStore`)
 * とは独立した動作確認専用のエンドポイントであり、`EMBEDDINGS_ENABLED` の値に関係なく動作する
 * (Cron による自動発火ではなく、開発者が明示的に POST した場合のみ実行されるため)。
 *
 * 実行前に `docker compose up -d qdrant ollama`(および `ollama pull bge-m3`)が必要。
 * Qdrant のコレクションは(`VectorStore` 抽象には無い Qdrant 固有の操作である)
 * `ensureCollection` で初回のみ作成する(未作成の場合、upsert 前に自動作成される)。
 */
async function handleManualEmbed(env: Env): Promise<Response> {
  try {
    const vectorStore = new QdrantVectorStore();
    await vectorStore.ensureCollection(EMBEDDING_DIM);

    const summary = await runEmbedPipeline({
      db: env.DB,
      embedder: createEmbedder("ollama"),
      vectorStore,
    });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * リクエストボディから `{ "datasetIds": string[] }` を読み取る。
 * ボディなし・不正 JSON・想定外の形の場合は undefined(=全データセット対象)として扱う
 * (手動発火の使い勝手を優先し、厳密なバリデーションエラーにはしない)。
 */
async function readDatasetIdsFromBody(request: Request): Promise<string[] | undefined> {
  if (request.method !== "POST") return undefined;
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") return undefined;

  try {
    const body = (await request.json()) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "datasetIds" in body &&
      Array.isArray((body as { datasetIds: unknown }).datasetIds)
    ) {
      const ids = (body as { datasetIds: unknown[] }).datasetIds.filter(
        (v): v is string => typeof v === "string",
      );
      return ids.length > 0 ? ids : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
