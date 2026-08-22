import { describe, expect, it } from "vitest";

import {
  MunicipalityCodeSchema,
  MunicipalityEntrySchema,
  parseMunicipalityParam,
} from "@/features/support/schema/municipality-param";

describe("MunicipalityCodeSchema", () => {
  it("対応する5桁コードのみを受理する", () => {
    expect(MunicipalityCodeSchema.safeParse("13112").success).toBe(true);
    expect(MunicipalityCodeSchema.safeParse("世田谷区").success).toBe(false);
    expect(MunicipalityCodeSchema.safeParse("13000").success).toBe(false);
    expect(MunicipalityCodeSchema.safeParse("14100").success).toBe(false);
    expect(MunicipalityCodeSchema.safeParse("1311").success).toBe(false);
    expect(MunicipalityCodeSchema.safeParse("131120").success).toBe(false);
  });
});

describe("MunicipalityEntrySchema", () => {
  it("コードと旧名称を同一のレジストリエントリへ解決する", () => {
    const expected = expect.objectContaining({ code: "13112", name: "世田谷区" });
    expect(MunicipalityEntrySchema.safeParse("13112")).toMatchObject({ success: true, data: expected });
    expect(MunicipalityEntrySchema.safeParse("世田谷区")).toMatchObject({ success: true, data: expected });
  });

  it("未知の値と空文字列は受理しない", () => {
    expect(MunicipalityEntrySchema.safeParse("存在しない市").success).toBe(false);
    expect(MunicipalityEntrySchema.safeParse("").success).toBe(false);
  });
});

describe("parseMunicipalityParam", () => {
  it("コード・名称をレジストリエントリへ解決し、それ以外は null を返す", () => {
    expect(parseMunicipalityParam("13112")).toMatchObject({ code: "13112", name: "世田谷区" });
    expect(parseMunicipalityParam("世田谷区")).toMatchObject({ code: "13112", name: "世田谷区" });
    expect(parseMunicipalityParam(["13112", "13112"])).toBeNull();
    expect(parseMunicipalityParam(undefined)).toBeNull();
    expect(parseMunicipalityParam("存在しない市")).toBeNull();
  });
});
