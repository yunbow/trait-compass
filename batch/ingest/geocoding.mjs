// 施設住所のジオコーディング(緯度経度への変換)クライアント(FR-02A、TICKET-0028)。
//
// 手段選定(AC-1): 区市町村単位の代表座標は
// `src/features/support/constants/municipality-centers.ts` の静的テーブル(公知データ由来)を
// 第一候補として既に採用しており、「自宅から近い」の距離計算(NFR-33: 区市町村粒度まで)は
// そちらで完結する。本モジュールはそれとは別の目的 —— 施設側(facilities.address)を
// 地図上に具体的なピンとして描くための、施設単位のジオコーディング —— を担う。
// 施設単位は約62区市町村×数施設の粒度で公開座標データが存在しないため、外部 API が必要になる。
// 国土地理院(GSI)Geocoding API(`msearch.gsi.go.jp/address-search/AddressSearch`)を選定した理由:
//   - 無料・APIキー不要(Cloudflare には課金・鍵管理を伴う地図/ジオコーディングのネイティブ手段が
//     無いという local-dev-environment.md の調査結果を踏まえ、鍵管理コストが無い手段を優先)
//   - 政府機関(国土交通省国土地理院)が提供する公的データであり、住所プライバシーの観点でも
//     信頼できる提供元
//   - 表示時ではなく取込時(バッチ)に1回だけ叩き、結果を D1 に保存する設計(GEOCODING_ENABLED
//     でゲート、既定 false)にすることで、表示のたびに外部 API を呼ぶことによるレート制限・
//     可用性リスク・レイテンシ増を避ける(embed-pipeline.ts の EMBEDDINGS_ENABLED と同じ設計方針)
//
// レート配慮: GSI API は公式なレート制限を明記していないが、無料・鍵不要の公共 API への配慮として
// 自主的に1件ずつ・最低 GEOCODE_THROTTLE_MS(既定1秒)間隔でリクエストする
// (`geocodeAddressesThrottled`)。個別の失敗(ネットワークエラー・レスポンス不正・該当なし)は
// 例外を投げず null を返し、他の施設の処理を継続する(1件の失敗でバッチ全体を止めない)。
//
// 実装は本ファイル(プレーン ESM)を唯一の正本とする(design: batch-geocoding-single-source)。
// TypeScript(batch/ingest/workflow.ts)・Node スクリプト(batch/scripts/ingest-manual-survey.mjs)
// の両方から同一ファイルを import する。型は隣接する geocoding.d.mts で供給する。

/** GSI Geocoding API のベース URL(無料・APIキー不要)。 */
export const GSI_GEOCODE_BASE_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch";

/** 1件ずつのジオコーディング間で空ける最短間隔(ミリ秒)。レート配慮のための自主スロットル。 */
export const GEOCODE_THROTTLE_MS = 1000;

/** ジオコーディング URL を組み立てる純関数(ネットワークアクセスなし)。 */
export function buildGeocodeUrl(address) {
  return `${GSI_GEOCODE_BASE_URL}?q=${encodeURIComponent(address)}`;
}

/**
 * 緯度経度の妥当性検証(純関数)。有限数であることに加え、日本の大まかな範囲
 * (緯度20〜46度、経度122〜154度。小笠原諸島・沖ノ鳥島等の island 部分まで含む余裕を持たせた
 * 概算バウンディングボックス)に収まっているかを確認する。GSI API が万一想定外の値
 * (例: パース失敗・別国の住所と誤認識)を返した場合に、明らかに不正な座標を D1 へ保存しない
 * ためのガード。
 */
export function isValidLatLng(value) {
  return (
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= 20 &&
    value.lat <= 46 &&
    value.lng >= 122 &&
    value.lng <= 154
  );
}

/**
 * GSI Geocoding API のレスポンス JSON をパースする純関数(ネットワークアクセスなし)。
 * 先頭の候補(最も一致度が高い候補)のみを採用する。候補が0件、`geometry.coordinates` が
 * 想定形式でない、座標が `isValidLatLng` の範囲外、のいずれかの場合は null を返す
 * (呼び出し側は null を「ジオコーディング失敗」として扱い、facilities.lat/lng は
 * 変更せず既存の NULL のまま据え置く)。
 */
export function parseGsiGeocodeResponse(json) {
  if (!Array.isArray(json) || json.length === 0) return null;

  const first = json[0];
  const coordinates = first?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const latLng = { lat, lng };
  return isValidLatLng(latLng) ? latLng : null;
}

/**
 * 住所1件をジオコーディングする。ネットワークエラー・非 200 応答・レスポンス不正の
 * いずれの場合も例外を投げず null を返す(FR-02A「失敗は null で続行」)。
 */
export async function geocodeAddress(address, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(buildGeocodeUrl(address));
    if (!res.ok) return null;
    const json = await res.json();
    return parseGsiGeocodeResponse(json);
  } catch {
    return null;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 複数件の住所を「1件ずつ・最低 throttleMs 間隔」で逐次ジオコーディングする(FR-02A のバッチ処理)。
 * 個々の失敗(geocodeAddress が null を返す)はバッチ全体を止めず、残りの件も処理を継続する。
 * 最後の1件の後には待機を挟まない(無駄な待ち時間を発生させないため)。
 */
export async function geocodeAddressesThrottled(targets, options = {}) {
  const { fetchImpl = fetch, throttleMs = GEOCODE_THROTTLE_MS, sleepImpl = defaultSleep } = options;

  const outcomes = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const latLng = await geocodeAddress(target.address, fetchImpl);
    outcomes.push({ id: target.id, latLng });

    const isLast = i === targets.length - 1;
    if (!isLast) {
      await sleepImpl(throttleMs);
    }
  }
  return outcomes;
}
