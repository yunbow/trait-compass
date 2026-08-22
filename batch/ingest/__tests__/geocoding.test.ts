import { describe, expect, it, vi } from "vitest";

import {
  buildGeocodeUrl,
  GEOCODE_THROTTLE_MS,
  geocodeAddress,
  geocodeAddressesThrottled,
  GSI_GEOCODE_BASE_URL,
  isValidLatLng,
  parseGsiGeocodeResponse,
} from "../geocoding.mjs";

// ロジック共通化(design: batch-geocoding-single-source)により、これまで個別に存在していた
// batch/ingest/geocoding.ts 側のテストと batch/scripts/__tests__/geocoding.test.ts
// (batch/scripts/geocoding.mjs 側のテスト)を1本に統合したファイル。
// 統合先の実装本体 batch/ingest/geocoding.mjs と型宣言 batch/ingest/geocoding.d.mts は
// まだ作成されていないため、現時点では import 解決エラー(実行時)・型エラー(type-check)の
// どちらも起きる TDD の red 状態であることを想定している。
// 詳細: app/docs/logic-consolidation/batch-geocoding-single-source.md
//
// 移行完了後は本ファイルが geocoding のテストの唯一の正本となり、
// batch/scripts/__tests__/geocoding.test.ts は削除される想定。

describe("定数", () => {
  it("GSI_GEOCODE_BASE_URL は国土地理院(GSI)Geocoding API のベースURL", () => {
    expect(GSI_GEOCODE_BASE_URL).toBe("https://msearch.gsi.go.jp/address-search/AddressSearch");
  });

  it("GEOCODE_THROTTLE_MS は既定1000ms", () => {
    expect(GEOCODE_THROTTLE_MS).toBe(1000);
  });
});

describe("buildGeocodeUrl", () => {
  it("住所を URL エンコードして q パラメータに付与する", () => {
    const url = buildGeocodeUrl("東京都世田谷区XX 1-2-3");
    expect(url).toBe(`${GSI_GEOCODE_BASE_URL}?q=${encodeURIComponent("東京都世田谷区XX 1-2-3")}`);
    expect(url.startsWith("https://msearch.gsi.go.jp/address-search/AddressSearch?q=")).toBe(true);
  });

  it("特殊文字を含む住所も正しくエンコードする", () => {
    const url = buildGeocodeUrl("東京都new宿区1-2-3 & 4");
    expect(url).toBe(`${GSI_GEOCODE_BASE_URL}?q=${encodeURIComponent("東京都new宿区1-2-3 & 4")}`);
  });
});

describe("isValidLatLng", () => {
  it("日本のおおよその範囲内(緯度20〜46・経度122〜154)なら true", () => {
    expect(isValidLatLng({ lat: 35.6938, lng: 139.7036 })).toBe(true);
  });

  it("範囲の境界値(20/46/122/154)は true(境界は含む)", () => {
    expect(isValidLatLng({ lat: 20, lng: 122 })).toBe(true);
    expect(isValidLatLng({ lat: 46, lng: 154 })).toBe(true);
    expect(isValidLatLng({ lat: 20, lng: 154 })).toBe(true);
    expect(isValidLatLng({ lat: 46, lng: 122 })).toBe(true);
  });

  it("境界のすぐ外側は false", () => {
    expect(isValidLatLng({ lat: 19.999, lng: 139 })).toBe(false);
    expect(isValidLatLng({ lat: 46.001, lng: 139 })).toBe(false);
    expect(isValidLatLng({ lat: 35, lng: 121.999 })).toBe(false);
    expect(isValidLatLng({ lat: 35, lng: 154.001 })).toBe(false);
  });

  it("範囲外(海外の座標)は false", () => {
    expect(isValidLatLng({ lat: 40.7128, lng: -74.006 })).toBe(false); // ニューヨーク
  });

  it("NaN・非有限数は false", () => {
    expect(isValidLatLng({ lat: NaN, lng: 139.7036 })).toBe(false);
    expect(isValidLatLng({ lat: 35.6938, lng: Infinity })).toBe(false);
    expect(isValidLatLng({ lat: -Infinity, lng: 139.7036 })).toBe(false);
    expect(isValidLatLng({ lat: 35.6938, lng: NaN })).toBe(false);
  });
});

describe("parseGsiGeocodeResponse", () => {
  it("正常なレスポンス(先頭候補の coordinates=[lng, lat])を { lat, lng } に変換する", () => {
    const json = [
      {
        geometry: { type: "Point", coordinates: [139.702971, 35.690921] },
        type: "Feature",
        properties: { addressCode: "13104", title: "東京都新宿区XX" },
      },
    ];
    expect(parseGsiGeocodeResponse(json)).toEqual({ lat: 35.690921, lng: 139.702971 });
  });

  it("候補が複数ある場合は先頭のみを採用する", () => {
    const json = [
      { geometry: { coordinates: [139.1, 35.1] } },
      { geometry: { coordinates: [140.2, 36.2] } },
    ];
    expect(parseGsiGeocodeResponse(json)).toEqual({ lat: 35.1, lng: 139.1 });
  });

  it("空配列(該当なし)は null", () => {
    expect(parseGsiGeocodeResponse([])).toBeNull();
  });

  it("配列でないレスポンス・null・undefined は null", () => {
    expect(parseGsiGeocodeResponse({ error: "not found" })).toBeNull();
    expect(parseGsiGeocodeResponse(null)).toBeNull();
    expect(parseGsiGeocodeResponse(undefined)).toBeNull();
    expect(parseGsiGeocodeResponse("not an array")).toBeNull();
  });

  it("geometry.coordinates が欠けている/短い場合は null", () => {
    expect(parseGsiGeocodeResponse([{}])).toBeNull();
    expect(parseGsiGeocodeResponse([{ geometry: {} }])).toBeNull();
    expect(parseGsiGeocodeResponse([{ geometry: { coordinates: [139.7] } }])).toBeNull();
    expect(parseGsiGeocodeResponse([{ geometry: { coordinates: [] } }])).toBeNull();
  });

  it("coordinates が数値でない場合は null", () => {
    expect(parseGsiGeocodeResponse([{ geometry: { coordinates: ["a", "b"] } }])).toBeNull();
    expect(parseGsiGeocodeResponse([{ geometry: { coordinates: [null, null] } }])).toBeNull();
  });

  it("座標が日本の範囲外(異常値)の場合は null(isValidLatLng との連携)", () => {
    expect(parseGsiGeocodeResponse([{ geometry: { coordinates: [-74.006, 40.7128] } }])).toBeNull();
  });
});

describe("geocodeAddress", () => {
  it("成功時は parseGsiGeocodeResponse の結果を返す", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ geometry: { coordinates: [139.7, 35.6] } }]), { status: 200 }),
    );

    const result = await geocodeAddress("東京都新宿区XX", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ lat: 35.6, lng: 139.7 });
    expect(fetchImpl).toHaveBeenCalledWith(buildGeocodeUrl("東京都新宿区XX"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("非 200 応答は null(例外を投げない)", async () => {
    const fetchImpl = vi.fn(async () => new Response("Not Found", { status: 404 }));
    const result = await geocodeAddress("存在しない住所", fetchImpl as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("fetch が例外を投げても null を返す(FR-02A: 失敗は null で続行)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    });
    const result = await geocodeAddress("東京都新宿区XX", fetchImpl as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("JSON パースに失敗しても null を返す", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 }));
    const result = await geocodeAddress("東京都新宿区XX", fetchImpl as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it("該当なし(空配列)の場合も null", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const result = await geocodeAddress("該当なしの住所", fetchImpl as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});

describe("geocodeAddressesThrottled", () => {
  it("1件ずつ順番にジオコーディングし、id と結果を対応付けて返す", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      // url は buildGeocodeUrl でエンコード済みのため、デコードしてから住所文字列を判定する。
      if (decodeURIComponent(url).includes("成功")) {
        return new Response(JSON.stringify([{ geometry: { coordinates: [139.7, 35.6] } }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const sleepImpl = vi.fn(async () => {});

    const outcomes = await geocodeAddressesThrottled(
      [
        { id: "fac-001", address: "成功する住所" },
        { id: "fac-002", address: "失敗する住所" },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl },
    );

    expect(outcomes).toEqual([
      { id: "fac-001", latLng: { lat: 35.6, lng: 139.7 } },
      { id: "fac-002", latLng: null },
    ]);
  });

  it("1件の失敗が後続の処理を止めない(全件失敗でも件数・順序を保つ)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    });
    const sleepImpl = vi.fn(async () => {});

    const outcomes = await geocodeAddressesThrottled(
      [
        { id: "fac-001", address: "住所1" },
        { id: "fac-002", address: "住所2" },
        { id: "fac-003", address: "住所3" },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl },
    );

    expect(outcomes.map((o) => o.id)).toEqual(["fac-001", "fac-002", "fac-003"]);
    expect(outcomes.every((o) => o.latLng === null)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("スロットル(sleepImpl)は各件の間にのみ呼ばれ、最後の1件の後には呼ばれない", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const sleepImpl = vi.fn(async () => {});

    await geocodeAddressesThrottled(
      [
        { id: "fac-001", address: "住所1" },
        { id: "fac-002", address: "住所2" },
        { id: "fac-003", address: "住所3" },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl, throttleMs: 7 },
    );

    // 3件 → 待機は間の2回のみ(件数-1)。throttleMs を指定した場合はその値を使う。
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(7);
  });

  it("throttleMs 省略時は既定の GEOCODE_THROTTLE_MS を使う", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const sleepImpl = vi.fn(async () => {});

    await geocodeAddressesThrottled(
      [
        { id: "fac-001", address: "住所1" },
        { id: "fac-002", address: "住所2" },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl },
    );

    expect(sleepImpl).toHaveBeenCalledWith(GEOCODE_THROTTLE_MS);
  });

  it("対象が0件の場合は fetch も sleep も呼ばれない", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const sleepImpl = vi.fn(async () => {});

    const outcomes = await geocodeAddressesThrottled([], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl,
    });

    expect(outcomes).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("対象が1件の場合は sleep が呼ばれない", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    const sleepImpl = vi.fn(async () => {});

    await geocodeAddressesThrottled([{ id: "fac-001", address: "住所1" }], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl,
    });

    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("fetchImpl・sleepImpl を省略しても呼び出し自体は成立する(既定実装への差し替え確認は他ケースで担保)", async () => {
    // 実ネットワーク・実タイマーを避けるため対象0件のケースのみで既定引数の型的な整合を確認する。
    const outcomes = await geocodeAddressesThrottled([]);
    expect(outcomes).toEqual([]);
  });
});
