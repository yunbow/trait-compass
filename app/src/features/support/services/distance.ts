// 直線距離計算(FR-02A「自宅から近い」、NFR-33)。
//
// 距離計算の中心点は呼び出し側が渡す。既定は区市町村中心の代表座標だが、「現在地から探す」
// ボタンが押され現在地を取得できた場合、呼び出し側がユーザーの現在地(1回取得・非保存、
// useCurrentLocation.ts)を中心点に渡すことがある。継続追跡(watchPosition)は行わない。
// D1 アクセスを含まない純関数のみで構成する(NFR-72)。

export interface LatLngLike {
  lat: number;
  lng: number;
}

/** 地球の平均半径(km)。Haversine 公式で使う定数。 */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 2点間の直線距離(km)を Haversine 公式で計算する純関数。
 * 区市町村粒度の概算距離であり、道路距離・経路案内には使わない(NFR-33)。
 */
export function haversineDistanceKm(a: LatLngLike, b: LatLngLike): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_KM * c;
}

export interface DistanceSortable {
  lat: number | null;
  lng: number | null;
}

/**
 * 施設一覧を「区市町村中心からの直線距離」の昇順で安定ソートする純関数。
 * lat/lng が無い(未ジオコーディング・住所無し)施設は距離を計算できないため、
 * 常に末尾へ回す(除外はしない。一覧表示自体は引き続き行う、TICKET-0028)。
 * `Array.prototype.sort` は安定ソートのため、距離あり同士・距離なし同士の相対順序は
 * 呼び出し側が渡した順序のまま維持される。
 */
export function sortByDistanceFromCenter<T extends DistanceSortable>(items: readonly T[], center: LatLngLike): T[] {
  const withDistance = items.map((item) => ({
    item,
    distanceKm:
      item.lat !== null && item.lng !== null ? haversineDistanceKm(center, { lat: item.lat, lng: item.lng }) : null,
  }));

  withDistance.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return 0;
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return withDistance.map((entry) => entry.item);
}
