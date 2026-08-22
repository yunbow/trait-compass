import { describe, expect, it } from "vitest";

import { parseResultsSearchParams } from "@/features/support/schema/results-search-params";

describe("parseResultsSearchParams", () => {
  it("age/municipality が既知の値の場合は success=true でそのまま返す", () => {
    const result = parseResultsSearchParams({ age: "child", municipality: "世田谷区" });
    expect(result).toEqual({ success: true, data: { age: "child", municipality: expect.objectContaining({ name: "世田谷区", code: "13112" }) } });
  });

  it("municipality にコードを直接指定しても success=true でレジストリエントリへ解決する", () => {
    const result = parseResultsSearchParams({ age: "child", municipality: "13112" });
    expect(result).toEqual({
      success: true,
      data: { age: "child", municipality: expect.objectContaining({ code: "13112", name: "世田谷区" }) },
    });
  });

  it("municipality に未対応の5桁コードを指定すると success=false", () => {
    expect(parseResultsSearchParams({ age: "child", municipality: "99999" })).toEqual({ success: false });
  });

  it("age が未知の値の場合は success=false(/support への空状態誘導、FR-021)", () => {
    expect(parseResultsSearchParams({ age: "minor", municipality: "世田谷区" })).toEqual({ success: false });
  });

  it("municipality が62区市町村に含まれない場合は success=false(FR-022)", () => {
    expect(parseResultsSearchParams({ age: "adult", municipality: "架空市" })).toEqual({ success: false });
  });

  it("municipality に広域を表す '東京都' を直接指定しても失敗する(フォーム経由の値のみを許可)", () => {
    expect(parseResultsSearchParams({ age: "adult", municipality: "東京都" })).toEqual({ success: false });
  });

  it("age・municipality いずれも未指定の場合は success=false", () => {
    expect(parseResultsSearchParams({})).toEqual({ success: false });
  });

  it("age/municipality が配列(クエリ重複指定)の場合は success=false(安全側)", () => {
    expect(parseResultsSearchParams({ age: ["child", "adult"], municipality: "世田谷区" })).toEqual({
      success: false,
    });
    expect(parseResultsSearchParams({ age: "child", municipality: ["世田谷区", "新宿区"] })).toEqual({
      success: false,
    });
  });

  it("municipality に東京都外の実在する市区町村『横浜市』を指定すると success=false", () => {
    expect(parseResultsSearchParams({ age: "adult", municipality: "横浜市" })).toEqual({ success: false });
  });
});
