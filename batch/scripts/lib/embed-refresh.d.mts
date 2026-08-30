// batch/scripts/lib/embed-refresh.mjs の型宣言(geocoding.d.mts と同じ方針)。
// 実装本体はプレーン ESM(.mjs)に一本化されているため、型のみをここで供給する。
// 公開関数・定数の名前とシグネチャは embed-refresh.mjs の実装と一致させること。

export declare const DEFAULT_WRANGLER_PATH: string;
export declare const DEFAULT_INGEST_DEV_URL: string;

export declare function resolveIngestDevUrl(env?: NodeJS.ProcessEnv): string;

export declare function buildFacilityIdsSelectSql(datasetIds: readonly string[] | undefined): string | null;

export declare function parseWranglerSelectIds(rawStdout: string | unknown): string[];

export interface QueryFacilityIdsOptions {
  datasetIds: readonly string[];
  wranglerPath?: string;
  spawnSyncImpl?: (
    command: string,
    args: string[],
    options?: Record<string, unknown>,
  ) => { status: number | null; error?: Error; stdout?: string; stderr?: string };
}

export declare function queryFacilityIds(options: QueryFacilityIdsOptions): string[];

export declare function computeStaleIds(beforeIds: readonly string[], afterIds: readonly string[]): string[];

export interface CaptureFacilityIdsBeforeApplyOptions extends QueryFacilityIdsOptions {
  warn?: (message: string) => void;
}

export declare function captureFacilityIdsBeforeApply(options: CaptureFacilityIdsBeforeApplyOptions): string[];

export interface PostEmbedRefreshOptions {
  devUrl: string;
  deleteFacilityIds?: readonly string[];
  fetchImpl?: typeof fetch;
}

export declare function postEmbedRefresh(options: PostEmbedRefreshOptions): Promise<unknown>;

export declare function buildEmbedRefreshFailureGuidance(options: {
  devUrl: string;
  deleteFacilityIds?: readonly string[];
}): string;

export declare function buildRemoteEmbedGuidance(options: { deleteFacilityIds?: readonly string[] }): string;

export interface FinishLocalEmbedRefreshOptions {
  datasetIds: readonly string[];
  beforeIds: readonly string[];
  wranglerPath?: string;
  spawnSyncImpl?: QueryFacilityIdsOptions["spawnSyncImpl"];
  devUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export declare function finishLocalEmbedRefresh(
  options: FinishLocalEmbedRefreshOptions,
): Promise<{ ok: boolean; result?: unknown; error?: string; deleteFacilityIds?: string[] }>;
