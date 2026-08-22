import { MUNICIPALITY_REGISTRY, TOKYO_MUNICIPALITY_REGISTRY } from "@/features/support/constants/municipality-registry";
import type { Municipality } from "@/features/support/constants/municipalities";
import { haversineDistanceKm } from "@/features/support/services/distance";
import type { LatLngLike } from "@/features/support/services/distance";

// 自治体レジストリの代表座標から、既存呼び出し元向けの名前キーのビューを導出する。

export interface LatLng {
  lat: number;
  lng: number;
}

/** 東京都の自治体名から代表座標を引くための後方互換ビュー。 */
export const MUNICIPALITY_CENTERS: Record<Municipality, LatLng> = Object.fromEntries(
  TOKYO_MUNICIPALITY_REGISTRY.map((entry) => [entry.name, { lat: entry.lat, lng: entry.lng }]),
) as Record<Municipality, LatLng>;

/**
 * 現在地を最寄りの東京都区市町村へ対応付ける最大距離。島しょ部も一律に「しきい値内の
 * 最寄り中心」で扱う。小笠原村は父島の役場中心から母島まで約50kmあるため60kmとし、
 * 島民は自分の自治体中心に近い時だけ一致する一方、他県の都市は自然に除外される。
 * 都県境での近接一致は編集可能な入力欄へのソフトなプリフィルとして許容する。
 */
export const CURRENT_LOCATION_MAX_DISTANCE_KM = 60;

/** 最寄りの区市町村中心を返す。しきい値外なら推測せず `null` を返す。 */
export function findNearestMunicipality(
  point: LatLngLike,
  centers: Record<Municipality, LatLng> = MUNICIPALITY_CENTERS,
  maxDistanceKm = CURRENT_LOCATION_MAX_DISTANCE_KM,
): { municipality: Municipality; distanceKm: number } | null {
  let nearest: { municipality: Municipality; distanceKm: number } | null = null;
  for (const entry of MUNICIPALITY_REGISTRY) {
    const municipality = entry.name as Municipality;
    const distanceKm = haversineDistanceKm(point, centers[municipality]);
    if (nearest === null || distanceKm < nearest.distanceKm) nearest = { municipality, distanceKm };
  }
  return nearest !== null && nearest.distanceKm <= maxDistanceKm ? nearest : null;
}
