import { describe, expect, it } from "vitest";

import { PURPOSE_OTHER_ID } from "@/features/support/constants/purpose-options";
import { parseSupportPurposeParam } from "@/features/support/services/parse-support-purpose";

describe("parseSupportPurposeParam", () => {
  it("実在する具体的な目的idはそのまま返す", () => {
    expect(parseSupportPurposeParam("use-day-service")).toBe("use-day-service");
  });

  it("PURPOSE_OTHER_ID(それ以外)はそのまま返す", () => {
    expect(parseSupportPurposeParam(PURPOSE_OTHER_ID)).toBe(PURPOSE_OTHER_ID);
  });

  it("未知の文字列は null", () => {
    expect(parseSupportPurposeParam("unknown-purpose")).toBeNull();
  });

  it("未指定の場合は null", () => {
    expect(parseSupportPurposeParam(undefined)).toBeNull();
  });

  it("配列(同名クエリの重複指定)は null", () => {
    expect(parseSupportPurposeParam(["use-day-service", "consult-employment"])).toBeNull();
  });
});
