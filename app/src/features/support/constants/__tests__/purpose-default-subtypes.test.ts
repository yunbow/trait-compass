import { describe, expect, it } from "vitest";

import { getPurposeDefaultSubtype } from "@/features/support/constants/purpose-default-subtypes";

describe("getPurposeDefaultSubtype", () => {
  it("未就学児の「児童発達支援・療育を利用したい」は児童発達支援を既定subtypeとする", () => {
    expect(getPurposeDefaultSubtype("preschool", "use-day-service")).toBe("児童発達支援");
  });

  it("小学生・中学生の「放課後等デイサービスを利用したい」は放課後等デイサービスを既定subtypeとする", () => {
    expect(getPurposeDefaultSubtype("elementary-junior-high", "use-day-service")).toBe("放課後等デイサービス");
  });

  it("高校生の「放課後等デイサービスを継続利用したい」は放課後等デイサービスを既定subtypeとする", () => {
    expect(getPurposeDefaultSubtype("high-school", "use-day-service")).toBe("放課後等デイサービス");
  });

  it("対応表に無い目的の場合は undefined を返す", () => {
    expect(getPurposeDefaultSubtype("preschool", "consult-development")).toBeUndefined();
    expect(getPurposeDefaultSubtype("elementary-junior-high", "certificate-info")).toBeUndefined();
  });

  it("対応表に無いライフステージの場合は undefined を返す", () => {
    expect(getPurposeDefaultSubtype("university-vocational", "use-day-service")).toBeUndefined();
    expect(getPurposeDefaultSubtype("working-adult", "use-day-service")).toBeUndefined();
  });
});
