import { describe, expect, it } from "vitest";

import { safeErrorKind } from "@/lib/errors/safe-error-kind";

describe("safeErrorKind(運用ログに渡してよい例外種別のみを返す)", () => {
  it("Error インスタンスは name を返す(message・stackは含めない)", () => {
    expect(safeErrorKind(new TypeError("secret bound value: 世田谷区"))).toBe("TypeError");
    expect(safeErrorKind(new Error("SQLite error: near value 世田谷区"))).toBe("Error");
  });

  it("Error でない値は typeof を返す", () => {
    expect(safeErrorKind("plain string")).toBe("string");
    expect(safeErrorKind(42)).toBe("number");
    expect(safeErrorKind(undefined)).toBe("undefined");
    expect(safeErrorKind(null)).toBe("object");
  });

  it("戻り値に元のmessageを含めない(情報漏洩防止)", () => {
    const result = safeErrorKind(new Error("municipality=世田谷区 の取得に失敗"));
    expect(result).not.toContain("世田谷区");
  });
});
