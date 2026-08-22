import { describe, expect, it } from "vitest";

import { buildGoogleMapsSearchHref } from "@/features/support/services/google-maps-link";

describe("buildGoogleMapsSearchHref", () => {
  it("lat/lngがある場合は座標をそのままクエリに使う(建物名を含む住所テキストのジオコーディング失敗を避けるため)", () => {
    const href = buildGoogleMapsSearchHref({
      lat: 35.71705372,
      lng: 139.79449092,
      address: "東京都台東区浅草３−９−２　ランドール浅草１０２",
      fallbackQuery: "台東区相談支援センターつなぐ",
    });

    expect(href).toBe("https://www.google.com/maps/search/?api=1&query=35.71705372%2C139.79449092");
  });

  it("lat/lngが無くaddressがある場合はaddressを使う", () => {
    const href = buildGoogleMapsSearchHref({
      lat: null,
      lng: null,
      address: "東京都世田谷区XX",
      fallbackQuery: "世田谷区ダミー相談窓口",
    });

    expect(href).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("東京都世田谷区XX")}`);
  });

  it("lat/lng・addressのいずれも無い場合はfallbackQueryを使う", () => {
    const href = buildGoogleMapsSearchHref({
      lat: null,
      lng: null,
      address: null,
      fallbackQuery: "世田谷区ダミー相談窓口",
    });

    expect(href).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("世田谷区ダミー相談窓口")}`);
  });

  it("lat/lngの片方のみ設定されている場合はaddress/fallbackQueryへfall backする(lat/lng不完全は使わない)", () => {
    const href = buildGoogleMapsSearchHref({
      lat: 35.71705372,
      lng: null,
      address: "東京都世田谷区XX",
      fallbackQuery: "世田谷区ダミー相談窓口",
    });

    expect(href).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("東京都世田谷区XX")}`);
  });
});
