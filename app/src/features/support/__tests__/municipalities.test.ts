import { describe, expect, it } from "vitest";

import { MUNICIPALITIES } from "@/features/support/constants/municipalities";
import {
  resolveMunicipality,
  TOKYO_MUNICIPALITY_REGISTRY,
} from "@/features/support/constants/municipality-registry";

describe("TOKYO_MUNICIPALITY_REGISTRY", () => {
  it("東京都62区市町村すべてを含む(FR-022)", () => {
    expect(TOKYO_MUNICIPALITY_REGISTRY).toHaveLength(62);
  });

  it("code は一意の東京都5桁コードで、name は一意", () => {
    const codes = TOKYO_MUNICIPALITY_REGISTRY.map((entry) => entry.code);
    const names = TOKYO_MUNICIPALITY_REGISTRY.map((entry) => entry.name);

    expect(new Set(codes).size).toBe(62);
    expect(codes.every((code) => /^13\d{3}$/.test(code))).toBe(true);
    expect(new Set(names).size).toBe(62);
  });

  it("並びは区→市→町村の順(先頭は千代田区、末尾は町村部)", () => {
    const names = TOKYO_MUNICIPALITY_REGISTRY.map((entry) => entry.name);
    expect(names[0]).toBe("千代田区");
    expect(names.at(-1)).toBe("小笠原村");

    const wardEndIndex = names.findIndex((name) => !name.endsWith("区"));
    const cityEndIndex = names.findIndex((name, index) => index >= wardEndIndex && !name.endsWith("市"));

    // 区が連続した後に市が連続し、その後に町村が続く(区・市の入り混じりが無い)。
    expect(names.slice(0, wardEndIndex).every((name) => name.endsWith("区"))).toBe(true);
    expect(names.slice(wardEndIndex, cityEndIndex).every((name) => name.endsWith("市"))).toBe(true);
    expect(
      names.slice(cityEndIndex).every((name) => name.endsWith("町") || name.endsWith("村")),
    ).toBe(true);
  });

  it("全行が東京都に属し、座標は日本域内の有限値かつ重複しない", () => {
    const coordinates = new Set<string>();
    for (const entry of TOKYO_MUNICIPALITY_REGISTRY) {
      expect(entry.prefectureCode).toBe("13");
      expect(entry.prefectureName).toBe("東京都");
      expect(Number.isFinite(entry.lat)).toBe(true);
      expect(Number.isFinite(entry.lng)).toBe(true);
      expect(entry.lat).toBeGreaterThanOrEqual(20);
      expect(entry.lat).toBeLessThanOrEqual(46);
      expect(entry.lng).toBeGreaterThanOrEqual(122);
      expect(entry.lng).toBeLessThanOrEqual(154);

      const coordinate = `${entry.lat},${entry.lng}`;
      expect(coordinates.has(coordinate), `${entry.name} の座標が重複している`).toBe(false);
      coordinates.add(coordinate);
    }
  });

  it("MUNICIPALITIES はレジストリの name 列から導出される", () => {
    expect(MUNICIPALITIES).toEqual(TOKYO_MUNICIPALITY_REGISTRY.map((entry) => entry.name));
  });

  it("広域コード・広域名称は自治体として解決しない", () => {
    expect(resolveMunicipality("13000")).toBeNull();
    expect(resolveMunicipality("東京都")).toBeNull();
  });

  it("特別区(23区)を含む", () => {
    expect(TOKYO_MUNICIPALITY_REGISTRY.filter((entry) => entry.name.endsWith("区"))).toHaveLength(23);
  });

  it("市部(26市)を含む", () => {
    expect(TOKYO_MUNICIPALITY_REGISTRY.filter((entry) => entry.name.endsWith("市"))).toHaveLength(26);
  });

  it("町村部(13町村)を含む", () => {
    const townsAndVillages = TOKYO_MUNICIPALITY_REGISTRY.filter(
      (entry) => entry.name.endsWith("町") || entry.name.endsWith("村"),
    );
    expect(townsAndVillages).toHaveLength(13);
  });
});
