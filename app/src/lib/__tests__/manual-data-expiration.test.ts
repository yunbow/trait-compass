import { describe, expect, it } from "vitest";

import {
  computeManualExpiresAt,
  isManualDataExpired,
  MANUAL_DATA_VALID_DAYS,
} from "@/lib/manual-data-expiration";

describe("MANUAL_DATA_VALID_DAYS", () => {
  it("365日である(全データ種別一律)", () => {
    expect(MANUAL_DATA_VALID_DAYS).toBe(365);
  });
});

describe("isManualDataExpired", () => {
  it("364日経過(有効期限内)は false", () => {
    const now = new Date("2027-07-31T00:00:00.000Z"); // 2026-08-01 から364日後
    expect(isManualDataExpired("2026-08-01T00:00:00.000Z", now)).toBe(false);
  });

  it("365日ちょうど(境界、超過のみを対象とする)は false", () => {
    const now = new Date("2027-08-01T00:00:00.000Z"); // 2026-08-01 から365日後
    expect(isManualDataExpired("2026-08-01T00:00:00.000Z", now)).toBe(false);
  });

  it("366日経過(365日超過)は true", () => {
    const now = new Date("2027-08-02T00:00:00.000Z"); // 2026-08-01 から366日後
    expect(isManualDataExpired("2026-08-01T00:00:00.000Z", now)).toBe(true);
  });

  it("31日〜365日の範囲(旧30日stale閾値を超えるが有効期限内)は false(AC-2回帰確認の前提)", () => {
    const now = new Date("2026-09-01T00:00:00.000Z"); // 2026-08-01 から31日後
    expect(isManualDataExpired("2026-08-01T00:00:00.000Z", now)).toBe(false);
  });

  it("不正な日時文字列は true を返す(安全側)", () => {
    expect(isManualDataExpired("not-a-date")).toBe(true);
  });
});

describe("computeManualExpiresAt", () => {
  it("fetchedAt + 365日 を ISO 8601 で返す", () => {
    expect(computeManualExpiresAt("2026-07-13T00:00:00.000Z")).toBe("2027-07-13T00:00:00.000Z");
  });

  it("不正な日時文字列は null を返す", () => {
    expect(computeManualExpiresAt("not-a-date")).toBeNull();
  });
});
