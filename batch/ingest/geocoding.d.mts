// batch/ingest/geocoding.mjs の型宣言(design: batch-geocoding-single-source)。
// 実装本体はプレーン ESM(.mjs)に一本化されているため、型のみをここで供給する。
// 公開関数・定数の名前とシグネチャは geocoding.mjs の実装と一致させること。

export declare const GSI_GEOCODE_BASE_URL: string;
export declare const GEOCODE_THROTTLE_MS: number;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeTarget {
  id: string;
  address: string;
}

export interface GeocodeOutcome {
  id: string;
  latLng: LatLng | null;
}

export interface GeocodeAddressesThrottledOptions {
  fetchImpl?: typeof fetch;
  /** 既定 GEOCODE_THROTTLE_MS。テストで待機を省略する場合にのみ上書きする。 */
  throttleMs?: number;
  /** 待機処理の差し替え用(テストで実待機を避けるため)。既定は実際の `setTimeout` ベースの待機。 */
  sleepImpl?: (ms: number) => Promise<void>;
}

export declare function buildGeocodeUrl(address: string): string;
export declare function isValidLatLng(value: LatLng): boolean;
export declare function parseGsiGeocodeResponse(json: unknown): LatLng | null;
export declare function geocodeAddress(address: string, fetchImpl?: typeof fetch): Promise<LatLng | null>;
export declare function geocodeAddressesThrottled(
  targets: readonly GeocodeTarget[],
  options?: GeocodeAddressesThrottledOptions,
): Promise<GeocodeOutcome[]>;
