import { describe, expect, it } from "vitest";

import {
  computeStaleDays,
  evaluateDatasetStatus,
  STALE_THRESHOLD_DAYS,
} from "@/features/support/services/dataset-status";
import { MANUAL_SURVEY_LICENSE } from "@/lib/manual-data-expiration";

const OPEN_DATA_LICENSE = "cc-by-4.0";

describe("computeStaleDays", () => {
  it("経過日数を切り捨てて計算する", () => {
    const now = new Date("2026-07-04T00:00:00.000Z");
    expect(computeStaleDays("2026-07-01T00:00:00.000Z", now)).toBe(3);
  });

  it("端数(1日未満)は切り捨てる", () => {
    const now = new Date("2026-07-04T23:00:00.000Z");
    expect(computeStaleDays("2026-07-01T00:00:00.000Z", now)).toBe(3);
  });

  it("未来日時(未取得扱い)は0を返す(負値にしない)", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    expect(computeStaleDays("2026-07-04T00:00:00.000Z", now)).toBe(0);
  });

  it("不正な日時文字列は Infinity を返す(安全側)", () => {
    expect(computeStaleDays("not-a-date")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("evaluateDatasetStatus", () => {
  const now = new Date("2026-07-04T00:00:00.000Z");

  it("is_alive=1 かつ閾値内なら isStale=false", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-a", isAlive: 1, fetchedAt: "2026-07-01T00:00:00.000Z", license: OPEN_DATA_LICENSE },
      now,
    );
    expect(result).toEqual({
      id: "ds-a",
      isAlive: true,
      fetchedAt: "2026-07-01T00:00:00.000Z",
      staleDays: 3,
      isStale: false,
      kind: "open-data-unhealthy",
    });
  });

  it("is_alive=0 の場合、閾値内でも isStale=true(死活監視で不達を検知、FR-029)", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-dead", isAlive: 0, fetchedAt: "2026-07-01T00:00:00.000Z", license: OPEN_DATA_LICENSE },
      now,
    );
    expect(result.isAlive).toBe(false);
    expect(result.isStale).toBe(true);
    expect(result.kind).toBe("open-data-unhealthy");
  });

  it("fetched_at が既定閾値(30日)を超えたら isStale=true(NFR-62)", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-old", isAlive: 1, fetchedAt: "2026-06-01T00:00:00.000Z", license: OPEN_DATA_LICENSE },
      now,
    );
    expect(result.staleDays).toBeGreaterThan(STALE_THRESHOLD_DAYS);
    expect(result.isStale).toBe(true);
    expect(result.kind).toBe("open-data-unhealthy");
  });

  it("staleDays が閾値ちょうどの場合は isStale=false(超過のみを対象とする境界値)", () => {
    const now2 = new Date("2026-07-31T00:00:00.000Z");
    const result = evaluateDatasetStatus(
      { id: "ds-boundary", isAlive: 1, fetchedAt: "2026-07-01T00:00:00.000Z", license: OPEN_DATA_LICENSE },
      now2,
      30,
    );
    expect(result.staleDays).toBe(30);
    expect(result.isStale).toBe(false);
  });

  it("カスタム閾値を指定できる", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-custom", isAlive: 1, fetchedAt: "2026-07-01T00:00:00.000Z", license: OPEN_DATA_LICENSE },
      now,
      2,
    );
    expect(result.staleDays).toBe(3);
    expect(result.isStale).toBe(true);
  });

  // AC-2(最優先の回帰確認): 手動調査データ(MANUAL_SURVEY_LICENSE)は30日stale閾値の対象外。
  // 台東区・葛飾区・江戸川区で実際に発生していた誤検知(調査から31日経過した時点で広域窓口の
  // みへ縮退してしまうバグ)の回帰テスト。
  it("手動調査データはfetched_atが30日を超えていてもisStale=false(30日stale閾値の対象外)", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-13106-manual-survey-programs", isAlive: 1, fetchedAt: "2026-06-01T00:00:00.000Z", license: MANUAL_SURVEY_LICENSE },
      now,
    );
    expect(result.staleDays).toBeGreaterThan(STALE_THRESHOLD_DAYS);
    expect(result.isStale).toBe(false);
    expect(result.kind).toBe("manual-expired");
  });

  it("手動調査データはfetched_atが365日を超えるとisStale=true、kind=manual-expired", () => {
    const now2 = new Date("2027-07-03T00:00:00.000Z"); // 2026-07-01 から366日後
    const result = evaluateDatasetStatus(
      { id: "ds-13106-manual-survey-programs", isAlive: 1, fetchedAt: "2026-07-01T00:00:00.000Z", license: MANUAL_SURVEY_LICENSE },
      now2,
    );
    expect(result.isStale).toBe(true);
    expect(result.kind).toBe("manual-expired");
  });

  it("手動調査データはis_alive=0でも365日以内ならisStale=false(死活監視の対象外)", () => {
    const result = evaluateDatasetStatus(
      { id: "ds-13106-manual-survey-programs", isAlive: 0, fetchedAt: "2026-07-01T00:00:00.000Z", license: MANUAL_SURVEY_LICENSE },
      now,
    );
    expect(result.isStale).toBe(false);
  });
});
