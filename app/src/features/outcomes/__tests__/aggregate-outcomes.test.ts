import { describe, expect, it } from "vitest";

import {
  aggregateBridgeSummary,
  aggregateKpiSummary,
  aggregateUnclearReasonBreakdown,
  buildImprovementSummary,
  combineReportCounts,
  selectPublishedComments,
  type FeedbackRatingCountRow,
  type FeedbackUnclearReasonCountRow,
  type RawFeedbackCommentRow,
  type UsageCountRow,
} from "@/features/outcomes/services/aggregate-outcomes";

describe("aggregateKpiSummary", () => {
  it("回答が1件も無い場合、割合・集計期間は null になる(捏造禁止)", () => {
    const result = aggregateKpiSummary([]);

    expect(result).toEqual({
      totalResponses: 0,
      clearOrPartialCount: 0,
      clearOrPartialPercentage: null,
      earliestDate: null,
    });
  });

  it("count=0 の行のみの場合も回答0件として扱う", () => {
    const rows: FeedbackRatingCountRow[] = [
      { date: "2026-08-01", source: "support-results", rating: "clear", count: 0 },
    ];

    const result = aggregateKpiSummary(rows);

    expect(result.totalResponses).toBe(0);
    expect(result.clearOrPartialPercentage).toBeNull();
  });

  it("clear+partial の合計割合を整数%(四捨五入)で算出する", () => {
    const rows: FeedbackRatingCountRow[] = [
      { date: "2026-08-01", source: "support-results", rating: "clear", count: 5 },
      { date: "2026-08-02", source: "support-results", rating: "partial", count: 2 },
      { date: "2026-08-03", source: "result-prepare", rating: "unclear", count: 3 },
    ];

    const result = aggregateKpiSummary(rows);

    expect(result.totalResponses).toBe(10);
    expect(result.clearOrPartialCount).toBe(7);
    // 7/10 = 70%(丸め誤差の無いケース)
    expect(result.clearOrPartialPercentage).toBe(70);
    expect(Number.isInteger(result.clearOrPartialPercentage)).toBe(true);
  });

  it("小数点以下は Math.round で四捨五入する(2/3 = 66.6...% -> 67%)", () => {
    const rows: FeedbackRatingCountRow[] = [
      { date: "2026-08-01", source: "support-results", rating: "clear", count: 2 },
      { date: "2026-08-01", source: "support-results", rating: "unclear", count: 1 },
    ];

    const result = aggregateKpiSummary(rows);

    expect(result.clearOrPartialPercentage).toBe(67);
  });

  it("最古の date を集計期間の開始として返す", () => {
    const rows: FeedbackRatingCountRow[] = [
      { date: "2026-08-10", source: "support-results", rating: "clear", count: 1 },
      { date: "2026-08-01", source: "result-prepare", rating: "partial", count: 1 },
      { date: "2026-08-05", source: "support-results", rating: "unclear", count: 1 },
    ];

    const result = aggregateKpiSummary(rows);

    expect(result.earliestDate).toBe("2026-08-01");
  });
});

describe("aggregateUnclearReasonBreakdown", () => {
  it("理由別に合計し、件数の多い順に並べる", () => {
    const rows: FeedbackUnclearReasonCountRow[] = [
      { date: "2026-08-01", reason: "info-gap", count: 3 },
      { date: "2026-08-02", reason: "first-step", count: 5 },
      { date: "2026-08-02", reason: "info-gap", count: 1 },
    ];

    const result = aggregateUnclearReasonBreakdown(rows);

    expect(result).toEqual([
      { reason: "first-step", count: 5 },
      { reason: "info-gap", count: 4 },
    ]);
  });

  it("count=0 の理由は結果に含めない", () => {
    const rows: FeedbackUnclearReasonCountRow[] = [{ date: "2026-08-01", reason: "other", count: 0 }];

    expect(aggregateUnclearReasonBreakdown(rows)).toEqual([]);
  });

  it("行が1件も無い場合は空配列", () => {
    expect(aggregateUnclearReasonBreakdown([])).toEqual([]);
  });
});

describe("aggregateBridgeSummary", () => {
  it("延べ到達数が0件でも0として返す(カウンタの実数、事実として表示してよい)", () => {
    expect(aggregateBridgeSummary([])).toEqual({ supportResultsTotal: 0, resultPrepareTotal: 0 });
  });

  it("support-results・result-prepare それぞれの SUM(count) を算出する", () => {
    const rows: UsageCountRow[] = [
      { date: "2026-08-01", screen: "support-results", count: 10 },
      { date: "2026-08-02", screen: "support-results", count: 5 },
      { date: "2026-08-01", screen: "result-prepare", count: 3 },
    ];

    expect(aggregateBridgeSummary(rows)).toEqual({ supportResultsTotal: 15, resultPrepareTotal: 3 });
  });

  it("対象外の screen 値が紛れ込んでいても無視する(SQL側WHEREの防御の二重化)", () => {
    const rows: UsageCountRow[] = [
      { date: "2026-08-01", screen: "top", count: 100 },
      { date: "2026-08-01", screen: "support-results", count: 1 },
    ];

    expect(aggregateBridgeSummary(rows)).toEqual({ supportResultsTotal: 1, resultPrepareTotal: 0 });
  });
});

describe("selectPublishedComments", () => {
  it("published=1 かつ publish_consent=1 の行のみを返す(片方だけの行は除外する)", () => {
    const rows: RawFeedbackCommentRow[] = [
      { id: "1", createdDate: "2026-08-01", commentText: "公開OK", publishConsent: true, published: true },
      { id: "2", createdDate: "2026-08-02", commentText: "同意はあるが未公開", publishConsent: true, published: false },
      { id: "3", createdDate: "2026-08-03", commentText: "公開フラグのみ(同意なし)", publishConsent: false, published: true },
      { id: "4", createdDate: "2026-08-04", commentText: "どちらも無し", publishConsent: false, published: false },
    ];

    const result = selectPublishedComments(rows);

    expect(result).toEqual([{ id: "1", createdDate: "2026-08-01", commentText: "公開OK" }]);
  });

  it("コメントが1件も無い場合は空配列", () => {
    expect(selectPublishedComments([])).toEqual([]);
  });

  it("limit 件数までに切り詰める", () => {
    const rows: RawFeedbackCommentRow[] = Array.from({ length: 8 }, (_, i) => ({
      id: `${i}`,
      createdDate: `2026-08-0${i + 1}`,
      commentText: `コメント${i}`,
      publishConsent: true,
      published: true,
    }));

    expect(selectPublishedComments(rows, 5)).toHaveLength(5);
  });
});

describe("combineReportCounts", () => {
  it("facility_reports と content_reports の集計を合算する", () => {
    const result = combineReportCounts({ total: 10, done: 4 }, { total: 3, done: 1 });

    expect(result).toEqual({ total: 13, done: 5 });
  });

  it("両方0件でも0として合算する", () => {
    expect(combineReportCounts({ total: 0, done: 0 }, { total: 0, done: 0 })).toEqual({ total: 0, done: 0 });
  });
});

describe("buildImprovementSummary", () => {
  it("coverage・datasets・report集計をまとめる", () => {
    const result = buildImprovementSummary({
      coverageSummary: { municipalitiesWithData: 12, totalMunicipalities: 62, totalFacilities: 340 },
      datasetsCount: 7,
      reportCounts: { total: 20, done: 8 },
    });

    expect(result).toEqual({
      municipalitiesWithData: 12,
      totalMunicipalities: 62,
      totalFacilities: 340,
      datasetsCount: 7,
      reportsTotal: 20,
      reportsDone: 8,
    });
  });
});
