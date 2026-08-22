import { describe, expect, it } from "vitest";

import { haversineDistanceKm, sortByDistanceFromCenter } from "@/features/support/services/distance";

describe("haversineDistanceKm", () => {
  it("同一地点の距離は 0", () => {
    const point = { lat: 35.6938, lng: 139.7036 };
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 6);
  });

  it("新宿区役所〜世田谷区役所のおおよその距離(実測値に近い約8〜9km)を計算する", () => {
    const shinjuku = { lat: 35.6938, lng: 139.7036 };
    const setagaya = { lat: 35.6467, lng: 139.6531 };
    const distance = haversineDistanceKm(shinjuku, setagaya);
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(12);
  });

  it("対称(a→b と b→a で同じ距離)", () => {
    const a = { lat: 35.6938, lng: 139.7036 };
    const b = { lat: 35.5614, lng: 139.7161 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });
});

describe("sortByDistanceFromCenter", () => {
  const center = { lat: 35.6938, lng: 139.7036 }; // 新宿区役所付近

  it("中心からの距離が近い順に並び替える", () => {
    const items = [
      { id: "far", lat: 35.5614, lng: 139.7161 }, // 大田区(遠い)
      { id: "near", lat: 35.694, lng: 139.7038 }, // ほぼ同じ地点(近い)
    ];

    const sorted = sortByDistanceFromCenter(items, center);
    expect(sorted.map((i) => i.id)).toEqual(["near", "far"]);
  });

  it("lat/lng が null の項目は距離計算せず末尾へ回す(除外はしない)", () => {
    const items = [
      { id: "no-coords", lat: null, lng: null },
      { id: "has-coords", lat: 35.694, lng: 139.7038 },
    ];

    const sorted = sortByDistanceFromCenter(items, center);
    expect(sorted.map((i) => i.id)).toEqual(["has-coords", "no-coords"]);
    expect(sorted).toHaveLength(2);
  });

  it("lat/lng が無い項目同士は元の相対順序を維持する(安定ソート)", () => {
    const items = [
      { id: "no-coords-a", lat: null, lng: null },
      { id: "no-coords-b", lat: null, lng: null },
    ];

    const sorted = sortByDistanceFromCenter(items, center);
    expect(sorted.map((i) => i.id)).toEqual(["no-coords-a", "no-coords-b"]);
  });

  it("入力配列を破壊しない", () => {
    const items = [
      { id: "a", lat: 35.5614, lng: 139.7161 },
      { id: "b", lat: 35.694, lng: 139.7038 },
    ];
    const original = [...items];

    sortByDistanceFromCenter(items, center);

    expect(items).toEqual(original);
  });
});
