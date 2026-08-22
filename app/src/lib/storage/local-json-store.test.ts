import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isBrowser, readLocalJson, removeLocalItem, writeLocalJson } from "@/lib/storage/local-json-store";

// このテストは実装前(TDD red)の段階で書いている。
// `local-json-store.ts` はまだ存在しないため、上記 import は解決できずコンパイル/実行に失敗する。
// 実装後は progress.ts / settings.ts / support-input-storage.ts の既存テストと同じ観点
// (SSR安全・壊れたJSON・スキーマ不一致・localStorage例外)をこのプリミティブ単体でカバーする。

const TestSchema = z.object({ foo: z.string() });
type TestValue = z.infer<typeof TestSchema>;

const KEY = "test-local-json-store-key";
const VALID_VALUE: TestValue = { foo: "bar" };

afterEach(() => {
  // 先に unstubAllGlobals() を呼び window を復元してから localStorage を操作する。
  // 逆順だと、window を undefined にスタブしたテストの直後に window.localStorage.clear()
  // が「Cannot read properties of undefined」で例外を投げ、unstubAllGlobals() 自体が
  // 実行されずに window が undefined のまま後続テストへ漏れてしまう。
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("isBrowser", () => {
  it("window が存在する環境(jsdom)では true を返す", () => {
    expect(isBrowser()).toBe(true);
  });

  it("window が存在しない環境(SSR)では false を返す", () => {
    vi.stubGlobal("window", undefined);
    expect(isBrowser()).toBe(false);
  });
});

describe("readLocalJson", () => {
  it("未保存の場合は null を返す", () => {
    expect(readLocalJson(KEY, TestSchema)).toBeNull();
  });

  it("保存済みの値がスキーマに合致する場合はパース済みの値を返す", () => {
    window.localStorage.setItem(KEY, JSON.stringify(VALID_VALUE));
    expect(readLocalJson(KEY, TestSchema)).toEqual(VALID_VALUE);
  });

  it("壊れた JSON の場合は例外を投げず null を返す(NFR-31)", () => {
    window.localStorage.setItem(KEY, "{not-json");
    expect(() => readLocalJson(KEY, TestSchema)).not.toThrow();
    expect(readLocalJson(KEY, TestSchema)).toBeNull();
  });

  it("スキーマに一致しない値の場合は null を返す", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ foo: 123 }));
    expect(readLocalJson(KEY, TestSchema)).toBeNull();
  });

  it("SSR(window未定義)では null を返し localStorage には触れない", () => {
    window.localStorage.setItem(KEY, JSON.stringify(VALID_VALUE));
    vi.stubGlobal("window", undefined);
    expect(readLocalJson(KEY, TestSchema)).toBeNull();
  });

  it("localStorage.getItem が例外を投げてもクラッシュせず null を返す(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked in private browsing");
    });
    expect(() => readLocalJson(KEY, TestSchema)).not.toThrow();
    expect(readLocalJson(KEY, TestSchema)).toBeNull();
  });

  it("localStorage 自体が利用不可(getter が例外を投げる)場合も null を返す", () => {
    // 一部のプライベートブラウジング実装では window.localStorage へのアクセス自体が
    // 例外を投げることがある(setItem/getItem の呼び出し前の時点で失敗するケース)。
    vi.stubGlobal("localStorage", undefined);
    expect(() => readLocalJson(KEY, TestSchema)).not.toThrow();
  });
});

describe("writeLocalJson", () => {
  it("保存に成功した場合は true を返し、値が読み出せる", () => {
    expect(writeLocalJson(KEY, VALID_VALUE)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "")).toEqual(VALID_VALUE);
  });

  it("SSR(window未定義)では false を返し何もしない", () => {
    vi.stubGlobal("window", undefined);
    expect(writeLocalJson(KEY, VALID_VALUE)).toBe(false);
  });

  it("localStorage.setItem が例外を投げても false を返しクラッシュしない(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeLocalJson(KEY, VALID_VALUE)).not.toThrow();
    expect(writeLocalJson(KEY, VALID_VALUE)).toBe(false);
  });

  it("スキーマを検証しない任意の JSON 化可能な値を書き込める(検証は読み出し側の責務)", () => {
    expect(writeLocalJson(KEY, { arbitrary: [1, 2, 3] })).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "")).toEqual({ arbitrary: [1, 2, 3] });
  });
});

describe("removeLocalItem", () => {
  it("保存済みの値を削除する", () => {
    window.localStorage.setItem(KEY, JSON.stringify(VALID_VALUE));
    removeLocalItem(KEY);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("SSR(window未定義)では何もせず例外を投げない", () => {
    vi.stubGlobal("window", undefined);
    expect(() => removeLocalItem(KEY)).not.toThrow();
  });

  it("localStorage.removeItem が例外を投げてもクラッシュしない(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => removeLocalItem(KEY)).not.toThrow();
  });

  it("未保存のキーを削除しても例外を投げない", () => {
    expect(() => removeLocalItem("never-saved-key")).not.toThrow();
  });
});
