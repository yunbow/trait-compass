// IngestWorkflow: CKAN API → R2(生データ) → Workers AI `toMarkdown`(整形) → D1(構造化)
// のパイプライン本体(FR-032)。
//
// ステップ構成(1データセットあたり):
//   ①package_show でメタ取得 → ②リソース選定(FR-034 の既知不良フォーマットのスキップ含む)
//   → ③リソース fetch → R2 保存 → ④正規化(CSV はテキストパース、XLSX は toMarkdown。
//     AI バインディング未設定時はスキップして freshness_note に記録するフォールバック)
//   → ⑤ datasets / facilities への UPSERT
//
// ライセンス区分 A/F/G(FR-033)以外・frozen 指定のデータセット(FR-034 AC-6)は
// ネットワーク取得自体を行わず、datasets のメタ情報のみを記録する。
//
// 取得失敗時(package_show・リソース fetch のリトライを使い果たした場合)は
// datasets.is_alive=0 + freshness_note に理由を記録する(FR-029/034 の死活監視の下地)。
//
// 全データセット処理後の後段ステップ(いずれも既定 disabled、環境変数で個別にゲート):
//   ⑥ 埋め込み生成・Vectorize 投入(EMBEDDINGS_ENABLED、TICKET-0021、FR-03A)
//   ⑦ facilities のジオコーディング(GEOCODING_ENABLED、TICKET-0028、FR-02A)。address はあるが
//     lat 未設定の facilities を対象に国土地理院 Geocoding API で lat/lng を解決して D1 に保存する
//     (表示時に毎回外部 API を呼ばないための取込時バッチ処理。詳細は geocoding.mjs を参照)。

import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";

import { classifyLicense, type LicenseClassification } from "../../app/src/features/data-ingest/services/licenseClassifier";
import { createEmbedder } from "../../app/src/lib/ai/embedder";
import { createVectorStore } from "../../app/src/lib/ai/vector-store";
import { fetchCkanPackage, fetchWithUserAgent, selectIngestResource, normalizeResourceFormat } from "./ckan";
import { CKAN_BASE_URL, INGEST_DATASETS, type DatasetConfig } from "./datasets.config";
import {
  buildDatasetRow,
  fetchFacilitiesNeedingGeocode,
  updateFacilityLatLng,
  upsertDataset,
  upsertFacilities,
} from "./db";
import { runEmbedPipeline } from "./embed-pipeline";
import { geocodeAddressesThrottled } from "./geocoding.mjs";
import { buildDerivedMarkdownKey, buildRawObjectKey } from "./storage-keys";
import { normalizeCsvText, type NormalizedFacility } from "./transform";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CKAN_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "30 seconds",
};

const RESOURCE_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes",
};

/** 埋め込み生成・VectorStore upsert ステップ(TICKET-0021)。バッチ処理のため CKAN 系より緩めのタイムアウト。 */
const EMBED_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes",
};

/**
 * ジオコーディングステップ(FR-02A、TICKET-0028)。1件ずつ1秒スロットルで逐次実行するため
 * 対象件数によっては数分かかり得る一方、個々の失敗は `geocodeAddressesThrottled` 内で
 * 吸収済み(例外を投げない)なので、ステップ自体の再試行は軽め(1回)に留める
 * (再試行すると成功済み分も含め対象を取得し直すが、`lat IS NULL` 条件により
 * 既に成功した行は対象から外れるため、再試行しても未処理分のみが再実行される)。
 */
const GEOCODE_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 1, delay: "10 seconds", backoff: "constant" },
  timeout: "10 minutes",
};

/** IngestWorkflow が要求するバインディング。AI・VECTORIZE は未設定でも動作する(フォールバック対象)。 */
export interface IngestEnv {
  DB: D1Database;
  RAW_BUCKET: R2Bucket;
  AI?: Ai;
  /**
   * RAG 用埋め込みの投入先(TICKET-0021)。`EMBEDDINGS_ENABLED="true"` の場合のみ使用する。
   * wrangler.ingest.toml の `[[vectorize]]` バインディング(未作成の場合は undefined のままでよい。
   * EMBEDDINGS_ENABLED=false が既定のため、未作成でも P0 の取込動作には影響しない)。
   */
  VECTORIZE?: Vectorize;
  /**
   * 埋め込み生成・Vectorize 投入ステップの有効化フラグ(TICKET-0021)。既定は無効(false 相当)。
   * `"true"`(文字列)の場合のみ埋め込みステップを実行する。P0 の取込動作(CKAN→R2→D1)を
   * 壊さないための安全側デフォルト(FR-032「P0 では Vectorize への投入は行わない」を踏襲)。
   */
  EMBEDDINGS_ENABLED?: string;
  /**
   * facilities の住所ジオコーディング(国土地理院 Geocoding API)ステップの有効化フラグ
   * (FR-02A、TICKET-0028)。既定は無効(false 相当)。`"true"`(文字列)の場合のみ実行する。
   * 表示時ではなく取込時にのみ外部 API を叩く設計にすることで、表示のたびに GSI API へ
   * アクセスすることによるレート制限・可用性リスクを避ける(EMBEDDINGS_ENABLED と同じ方針)。
   */
  GEOCODING_ENABLED?: string;
  /** テスト・ローカル検証用に CKAN のベース URL を差し替え可能にする(未設定時は本番 URL)。 */
  CKAN_BASE_URL?: string;
}

export interface IngestWorkflowParams {
  /** 対象データセット id(datasets.config.ts の DatasetConfig.id)。省略/空配列時は全件処理。 */
  datasetIds?: string[];
}

export type DatasetIngestStatus =
  | "ok"
  | "frozen-meta-only"
  | "license-hold"
  | "no-resource"
  | "error";

export interface DatasetIngestResult {
  datasetId: string;
  status: DatasetIngestStatus;
  resourceFormat?: string;
  facilityCount?: number;
  error?: string;
}

/** 埋め込み生成・Vectorize 投入ステップの結果(TICKET-0021)。 */
export type EmbeddingStepResult =
  | { status: "disabled" }
  | { status: "ok"; facilityCount: number; batchCount: number }
  | { status: "error"; error: string };

/** ジオコーディングステップの結果(FR-02A、TICKET-0028)。 */
export type GeocodingStepResult =
  | { status: "disabled" }
  | { status: "ok"; targetCount: number; successCount: number }
  | { status: "error"; error: string };

export interface IngestWorkflowResult {
  processedAt: string;
  results: DatasetIngestResult[];
  embedding: EmbeddingStepResult;
  geocoding: GeocodingStepResult;
}

export class IngestWorkflow extends WorkflowEntrypoint<IngestEnv, IngestWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<IngestWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<IngestWorkflowResult> {
    const targetIds = event.payload.datasetIds;
    const datasets =
      targetIds && targetIds.length > 0
        ? INGEST_DATASETS.filter((dataset) => targetIds.includes(dataset.id))
        : INGEST_DATASETS;

    const results: DatasetIngestResult[] = [];
    for (const dataset of datasets) {
      results.push(await this.processDataset(dataset, step));
    }

    // D1 UPSERT 後段の埋め込み生成・Vectorize 投入(FR-03A、TICKET-0021)。
    // EMBEDDINGS_ENABLED=false(既定)の場合は何もせず、上記の CKAN→R2→D1 の結果には影響しない。
    const embedding = await this.runEmbeddingStep(step);

    // D1 UPSERT 後段の facilities ジオコーディング(FR-02A、TICKET-0028)。
    // GEOCODING_ENABLED=false(既定)の場合は何もせず、上記の結果には影響しない。
    const geocoding = await this.runGeocodingStep(step);

    return { processedAt: event.timestamp.toISOString(), results, embedding, geocoding };
  }

  /**
   * D1(facilities)から埋め込み対象を取得し、Workers AI(埋め込み)→ Vectorize(投入)する
   * ステップ(FR-03A、AC-1・AC-2)。`EMBEDDINGS_ENABLED` 環境変数でゲートする(AC-5:
   * P0 の取込動作を壊さないための安全側デフォルト = 未設定・"true" 以外は disabled)。
   *
   * `step.do` の自動リトライ(EMBED_STEP_CONFIG)を使い切っても失敗した場合、この関数は
   * 例外を再送出せず `{ status: "error" }` を返す。埋め込みステップの失敗によって
   * ワークフロー全体(=既に確定している CKAN→R2→D1 の `results`)を失敗扱いにしないための設計判断。
   */
  private async runEmbeddingStep(step: WorkflowStep): Promise<EmbeddingStepResult> {
    if (this.env.EMBEDDINGS_ENABLED !== "true") {
      return { status: "disabled" };
    }

    try {
      const summary = await step.do("embed and upsert facilities", EMBED_STEP_CONFIG, async () =>
        runEmbedPipeline({
          db: this.env.DB,
          embedder: createEmbedder("workers-ai", this.env.AI),
          vectorStore: createVectorStore("vectorize", this.env.VECTORIZE),
        }),
      );
      return { status: "ok", ...summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "error", error: message };
    }
  }

  /**
   * D1(facilities)から address はあるが lat が未設定の行を取得し、国土地理院 Geocoding API で
   * ジオコーディングして lat/lng を更新するステップ(FR-02A、TICKET-0028、AC-2)。
   * `GEOCODING_ENABLED` 環境変数でゲートする(未設定・"true" 以外は disabled。表示時に毎回
   * 外部 API を呼ばない設計のため、既定で無効にしても検索・一覧表示自体には影響しない)。
   *
   * `runEmbeddingStep` と同じ設計判断で、このステップが(リトライを使い果たしても)失敗しても
   * 例外を再送出せず `{ status: "error" }` を返す。ジオコーディング失敗によって、既に確定している
   * CKAN→R2→D1 の取込結果(`results`)をワークフロー全体の失敗として扱わないため。
   */
  private async runGeocodingStep(step: WorkflowStep): Promise<GeocodingStepResult> {
    if (this.env.GEOCODING_ENABLED !== "true") {
      return { status: "disabled" };
    }

    try {
      const summary = await step.do("geocode facilities", GEOCODE_STEP_CONFIG, async () => {
        const targets = await fetchFacilitiesNeedingGeocode(this.env.DB);
        const outcomes = await geocodeAddressesThrottled(targets);

        let successCount = 0;
        for (const outcome of outcomes) {
          if (outcome.latLng) successCount++;
          await updateFacilityLatLng(this.env.DB, outcome.id, outcome.latLng);
        }

        return { targetCount: targets.length, successCount };
      });
      return { status: "ok", ...summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "error", error: message };
    }
  }

  private async processDataset(dataset: DatasetConfig, step: WorkflowStep): Promise<DatasetIngestResult> {
    const baseUrl = this.env.CKAN_BASE_URL ?? CKAN_BASE_URL;
    const fetchedAt = new Date().toISOString();
    const license = classifyLicense(dataset.license);
    const notes: string[] = dataset.freshnessNote ? [dataset.freshnessNote] : [];

    // frozen(更新終了・CKAN 未登録)なデータセットはメタ情報のみ記録する(FR-034 AC-6)。
    if (dataset.frozen || !dataset.ckanPackageId) {
      await this.recordDatasetMeta(dataset, license, fetchedAt, null, notes, 0, step);
      return { datasetId: dataset.id, status: "frozen-meta-only" };
    }

    // ライセンス区分 A/F/G 以外は個別確認まで全文投入しない(FR-033)。
    if (!license.allowed) {
      notes.push(
        `ライセンス区分 ${license.category}(${license.label})のため個別確認が完了するまで本文投入を保留した(FR-033)。`,
      );
      await this.recordDatasetMeta(dataset, license, fetchedAt, null, notes, 1, step);
      return { datasetId: dataset.id, status: "license-hold" };
    }

    try {
      // ① CKAN package_show でメタ取得(FR-031)。
      const pkg = await step.do(`ckan package_show: ${dataset.id}`, CKAN_STEP_CONFIG, async () =>
        fetchCkanPackage(baseUrl, dataset.ckanPackageId as string),
      );

      // ② リソース選定(既知不良フォーマットのスキップを含む。FR-034)。
      const selection = selectIngestResource(pkg.resources ?? [], dataset.resource);
      if (selection.skippedKnownBad.length > 0) {
        notes.push(
          `${selection.skippedKnownBad.join("/")} リソースは既知の取得不能(404 等)のため取得を試みずスキップした(FR-034)。`,
        );
      }

      if (!selection.resource) {
        notes.push("優先フォーマットに合致する利用可能なリソースが見つからなかった。");
        await this.recordDatasetMeta(dataset, license, fetchedAt, null, notes, 0, step);
        return { datasetId: dataset.id, status: "no-resource" };
      }

      const format = normalizeResourceFormat(selection.resource.format, selection.resource.url);
      if (!format) {
        notes.push(`未対応のリソース形式(${selection.resource.format ?? "不明"})のため取得しなかった。`);
        await this.recordDatasetMeta(dataset, license, fetchedAt, selection.resource.url, notes, 0, step);
        return { datasetId: dataset.id, status: "no-resource" };
      }

      // ③ リソース取得 → R2 保存(1ステップにまとめ、巨大バイナリを step 結果として
      //    ワークフロー状態に持ち回らない。以降のステップは R2 キー経由で読み直す)。
      const resourceUrl = selection.resource.url;
      const resourceId = selection.resource.id;
      const raw = await step.do(`fetch and store resource: ${dataset.id}`, RESOURCE_STEP_CONFIG, async () => {
        const res = await fetchWithUserAgent(resourceUrl);
        if (!res.ok) {
          throw new Error(`resource fetch failed: ${res.status} ${res.statusText} (url=${resourceUrl})`);
        }
        const buf = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        const r2Key = buildRawObjectKey(dataset.id, resourceId, format);
        await this.env.RAW_BUCKET.put(r2Key, buf, { httpMetadata: { contentType } });
        return { r2Key, contentType, byteLength: buf.byteLength };
      });

      // ④ 正規化。
      let facilities: NormalizedFacility[] = [];
      if (format === "CSV" && dataset.csvColumns) {
        const csvColumns = dataset.csvColumns;
        facilities = await step.do(`normalize csv: ${dataset.id}`, async () => {
          const obj = await this.env.RAW_BUCKET.get(raw.r2Key);
          if (!obj) return [];
          // R2 には取得時の生バイトを保持し、正規化直前の読み出し時だけ設定された文字コードで復号する。
          const bytes = await obj.arrayBuffer();
          const text = new TextDecoder(dataset.encoding ?? "utf-8").decode(bytes);
          return normalizeCsvText(text, csvColumns, dataset.id, dataset.defaultCategoryType, dataset.fixedMunicipality, dataset.defaultFacilitySubtype, dataset.fixedAgeRange, dataset.fixedLifestageRange, dataset.fixedContactMethods, dataset.fixedUrl);
        });
      } else if (format === "XLSX") {
        notes.push(await this.convertXlsxToMarkdown(dataset, resourceId, raw.r2Key, step));
      }

      // 2026-08是正(外部コードレビュー指摘): facilities が0件の場合、リソース取得自体は
      // 成功していても「実際に使える施設データが無い」状態のため is_alive=1(健全)として
      // 記録しない。従来は正規化結果に関わらず常に isAlive=1 だったため、XLSX(未対応で
      // 常に0件、後述)や CSV のヘッダー形式変更で正規化が0件になった場合でも「取得成功・
      // 最新」として扱われ、支援情報案内画面の不健全判定(getUnhealthyDatasets)に一切
      // 引っかからなかった。is_alive=0 にすることで、この画面が既存の縮退表示・注記の
      // 仕組みにそのまま乗るようになる(取得自体の失敗と区別する注記を freshness_note に残す)。
      const isAlive = facilities.length > 0 ? 1 : 0;
      if (isAlive === 0) {
        notes.push(
          format === "XLSX"
            ? "XLSX からの facilities 自動反映は未対応のため、このデータセットには施設データが" +
                "0件のまま記録されている(is_alive=0、TICKET-0012以降で対応予定)。"
            : "正規化の結果、施設データが0件になった(取込元のCSV形式が変わった可能性がある。" +
                "is_alive=0 として記録し、目視確認を促す)。",
        );
      }

      // ⑤ D1 UPSERT。
      await step.do(`upsert dataset: ${dataset.id}`, async () => {
        await upsertDataset(
          this.env.DB,
          buildDatasetRow({ dataset, license, fetchedAt, sourceUrl: resourceUrl, notes, isAlive }),
        );
      });

      if (facilities.length > 0) {
        await step.do(`upsert facilities: ${dataset.id}`, async () => {
          await upsertFacilities(this.env.DB, dataset.id, facilities);
        });
      }

      return { datasetId: dataset.id, status: "ok", resourceFormat: format, facilityCount: facilities.length };
    } catch (err) {
      // package_show / リソース取得のリトライを使い果たして失敗した場合(死活監視、FR-029/034)。
      const message = err instanceof Error ? err.message : String(err);
      notes.push(`取得に失敗したため is_alive=0 として記録した: ${message}`);
      await this.recordDatasetMeta(dataset, license, fetchedAt, null, notes, 0, step);
      return { datasetId: dataset.id, status: "error", error: message };
    }
  }

  /** XLSX → Workers AI `toMarkdown` 変換。AI バインディング未設定・変換失敗時は理由を返す(FR-032 フォールバック)。 */
  private async convertXlsxToMarkdown(
    dataset: DatasetConfig,
    resourceId: string,
    r2Key: string,
    step: WorkflowStep,
  ): Promise<string> {
    const outcome = await step.do(`toMarkdown xlsx: ${dataset.id}`, async () => {
      if (!this.env.AI) {
        return { converted: false as const, reason: "ai-binding-missing" };
      }
      const obj = await this.env.RAW_BUCKET.get(r2Key);
      if (!obj) {
        return { converted: false as const, reason: "r2-object-missing" };
      }
      try {
        const buf = await obj.arrayBuffer();
        const result = await this.env.AI.toMarkdown({
          name: `${dataset.id}.xlsx`,
          blob: new Blob([buf], { type: XLSX_MIME }),
        });
        if (result.format !== "markdown") {
          return { converted: false as const, reason: `toMarkdown-error:${result.error ?? "unknown"}` };
        }
        await this.env.RAW_BUCKET.put(buildDerivedMarkdownKey(dataset.id, resourceId), result.data, {
          httpMetadata: { contentType: "text/markdown" },
        });
        return { converted: true as const };
      } catch (err) {
        return { converted: false as const, reason: err instanceof Error ? err.message : String(err) };
      }
    });

    if (outcome.converted) {
      return (
        "XLSX を Workers AI(toMarkdown)で整形し R2 に保存した" +
        "(表から facilities への自動反映は本チケットの対象外。TICKET-0012 以降で対応)。"
      );
    }
    if (outcome.reason === "ai-binding-missing") {
      return (
        "Workers AI(AI バインディング)が未設定のため XLSX の正規化(toMarkdown)をスキップした。" +
        "原本は R2 に保存済み(FR-032 のフォールバック)。"
      );
    }
    return `XLSX の toMarkdown 変換に失敗したためスキップした: ${outcome.reason}`;
  }

  private async recordDatasetMeta(
    dataset: DatasetConfig,
    license: LicenseClassification,
    fetchedAt: string,
    sourceUrl: string | null,
    notes: string[],
    isAlive: 0 | 1,
    step: WorkflowStep,
  ): Promise<void> {
    await step.do(`upsert dataset meta: ${dataset.id}`, async () => {
      await upsertDataset(
        this.env.DB,
        buildDatasetRow({ dataset, license, fetchedAt, sourceUrl, notes, isAlive }),
      );
    });
  }
}
