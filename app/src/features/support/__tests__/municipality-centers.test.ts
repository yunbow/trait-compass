import { describe, expect, it } from "vitest";

import { MUNICIPALITIES } from "@/features/support/constants/municipalities";
import {
  CURRENT_LOCATION_MAX_DISTANCE_KM,
  findNearestMunicipality,
  MUNICIPALITY_CENTERS,
} from "@/features/support/constants/municipality-centers";
import { haversineDistanceKm } from "@/features/support/services/distance";

describe("MUNICIPALITY_CENTERS の健全性", () => {
  it("MUNICIPALITIES(62区市町村)すべてのキーを網羅する", () => {
    for (const municipality of MUNICIPALITIES) {
      expect(MUNICIPALITY_CENTERS[municipality]).toBeDefined();
    }
    expect(Object.keys(MUNICIPALITY_CENTERS)).toHaveLength(MUNICIPALITIES.length);
  });

});

describe("findNearestMunicipality", () => {
  it("区中心と近傍の点を最寄り区市町村に対応付ける", () => {
    expect(findNearestMunicipality(MUNICIPALITY_CENTERS["新宿区"])?.municipality).toBe("新宿区");
    expect(findNearestMunicipality({ lat: 35.685, lng: 139.7036 })?.municipality).toBe("新宿区");
  });

  it("島しょ部を一律のしきい値で扱う", () => {
    expect(findNearestMunicipality({ lat: 33.11, lng: 139.79 })?.municipality).toBe("八丈町");
    expect(findNearestMunicipality({ lat: 26.64, lng: 142.16 })?.municipality).toBe("小笠原村");
  });

  it("東京都外は推測せずnullを返し、ちょうどしきい値は含める", () => {
    expect(findNearestMunicipality({ lat: 34.6937, lng: 135.5023 })).toBeNull();
    const center = MUNICIPALITY_CENTERS["新宿区"];
    const atThreshold = { lat: center.lat + CURRENT_LOCATION_MAX_DISTANCE_KM / 111.195, lng: center.lng };
    const distance = haversineDistanceKm(center, atThreshold);
    const sameCenter = Object.fromEntries(MUNICIPALITIES.map((municipality) => [municipality, center])) as typeof MUNICIPALITY_CENTERS;
    expect(findNearestMunicipality(atThreshold, sameCenter, distance)?.municipality).toBe("千代田区");
  });
});
