import { describe, expect, it } from "vitest";

import {
  buildDatasetFreshnessNotes,
  formatFetchedAtDate,
} from "@/features/support/services/dataset-freshness";
import type { FacilityFreshnessSource } from "@/features/support/services/dataset-freshness";

function makeSource(overrides: Partial<FacilityFreshnessSource> = {}): FacilityFreshnessSource {
  return {
    datasetId: "ds-tokyo-fukushi-shisetsu",
    datasetTitle: "発達障害支援機関の情報",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    ...overrides,
  };
}

describe("formatFetchedAtDate", () => {
  it("ISO 8601 の日時を「20XX/XX/XX」形式に整形する(TICKET-0033 AC-1)", () => {
    expect(formatFetchedAtDate("2026-07-01T00:00:00.000Z")).toBe("2026/07/01");
  });

  it("月・日を2桁ゼロ埋めする", () => {
    expect(formatFetchedAtDate("2026-01-05T12:34:56.000Z")).toBe("2026/01/05");
  });

  it("不正な日時文字列の場合は「不明」を返す(安全側)", () => {
    expect(formatFetchedAtDate("not-a-date")).toBe("不明");
  });
});

describe("buildDatasetFreshnessNotes", () => {
  it("施設0件の場合は空配列を返す", () => {
    expect(buildDatasetFreshnessNotes([])).toEqual([]);
  });

  it("同一データセットの複数施設は1件に重複排除する", () => {
    const facilities = [
      makeSource({ datasetId: "ds-a", datasetTitle: "データセットA" }),
      makeSource({ datasetId: "ds-a", datasetTitle: "データセットA" }),
    ];

    const notes = buildDatasetFreshnessNotes(facilities);

    expect(notes).toHaveLength(1);
    expect(notes[0].datasetId).toBe("ds-a");
  });

  it("異なるデータセットが混在する場合は出現順にそれぞれ1件ずつ返す", () => {
    const facilities = [
      makeSource({ datasetId: "ds-a", datasetTitle: "データセットA" }),
      makeSource({ datasetId: "ds-b", datasetTitle: "データセットB" }),
      makeSource({ datasetId: "ds-a", datasetTitle: "データセットA" }),
    ];

    const notes = buildDatasetFreshnessNotes(facilities);

    expect(notes.map((n) => n.datasetId)).toEqual(["ds-a", "ds-b"]);
  });

  it("fetchedAt を整形した formattedDate を持つ", () => {
    const notes = buildDatasetFreshnessNotes([makeSource({ fetchedAt: "2026-07-04T00:00:00.000Z" })]);
    expect(notes[0].formattedDate).toBe("2026/07/04");
  });

  it("frozen フラグを引き継ぐ(FR-034 AC-6、TICKET-0033 AC-2)", () => {
    const notes = buildDatasetFreshnessNotes([
      makeSource({ datasetId: "ds-kodomo-dx-registry", frozen: true }),
    ]);
    expect(notes[0].frozen).toBe(true);
  });
});
