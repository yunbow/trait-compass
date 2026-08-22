import { describe, expect, it } from "vitest";

import { parseDedupedListParam, parseKnownValueParam } from "@/features/support/services/parse-param-helpers";

describe("parseKnownValueParam", () => {
  const KNOWN_SET: ReadonlySet<string> = new Set(["foo", "bar"]);

  it("既知集合に含まれる文字列はそのまま返す", () => {
    expect(parseKnownValueParam("foo", KNOWN_SET)).toBe("foo");
  });

  it("未知の文字列は null", () => {
    expect(parseKnownValueParam("unknown", KNOWN_SET)).toBeNull();
  });

  it("未指定の場合は null", () => {
    expect(parseKnownValueParam(undefined, KNOWN_SET)).toBeNull();
  });

  it("配列(同名クエリの重複指定)は null", () => {
    expect(parseKnownValueParam(["foo", "bar"], KNOWN_SET)).toBeNull();
  });
});

describe("parseDedupedListParam", () => {
  it("undefined の場合は空配列を返す", () => {
    expect(parseDedupedListParam(undefined)).toEqual([]);
  });

  it("空文字の場合は空配列を返す", () => {
    expect(parseDedupedListParam("")).toEqual([]);
  });

  it("カンマ区切りの文字列を配列として返す", () => {
    expect(parseDedupedListParam("a,b")).toEqual(["a", "b"]);
  });

  it("配列(?key=a&key=b 相当)も受け付ける", () => {
    expect(parseDedupedListParam(["a", "b"])).toEqual(["a", "b"]);
  });

  it("前後の空白・空要素を無視する", () => {
    expect(parseDedupedListParam(" a ,,b ")).toEqual(["a", "b"]);
  });

  it("重複する値は1件にまとめる", () => {
    expect(parseDedupedListParam("a,a")).toEqual(["a"]);
  });

  it("配列入力でも重複する値は1件にまとめる", () => {
    expect(parseDedupedListParam(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("predicateを省略した場合は未知の値もそのまま残す", () => {
    expect(parseDedupedListParam("x,y")).toEqual(["x", "y"]);
  });

  it("predicateを渡した場合はそれを満たす値のみ残す", () => {
    const isFoo = (value: string): value is "foo" => value === "foo";
    expect(parseDedupedListParam("foo,bar,foo", isFoo)).toEqual(["foo"]);
  });

  it("空文字の要素のみの配列は空配列を返す", () => {
    expect(parseDedupedListParam(["", "  "])).toEqual([]);
  });
});
