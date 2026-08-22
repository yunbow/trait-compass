import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// InfoPageShell 内の SmartBackLink(クライアントコンポーネント)が useRouter() を呼ぶため、
// data-sources/__tests__/page.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { OutcomesView } from "@/features/outcomes/components/OutcomesView";
import type {
  BridgeSummary,
  ImprovementSummary,
  KpiSummary,
  PublishedComment,
  UnclearReasonSummary,
} from "@/features/outcomes/services/aggregate-outcomes";

const EMPTY_KPI: KpiSummary = {
  totalResponses: 0,
  clearOrPartialCount: 0,
  clearOrPartialPercentage: null,
  earliestDate: null,
};

const EMPTY_BRIDGE: BridgeSummary = { supportResultsTotal: 0, resultPrepareTotal: 0 };

const BASE_IMPROVEMENT: ImprovementSummary = {
  municipalitiesWithData: 12,
  totalMunicipalities: 62,
  totalFacilities: 340,
  datasetsCount: 7,
  reportsTotal: 20,
  reportsDone: 8,
};

function renderView(overrides: {
  kpi?: KpiSummary;
  unclearBreakdown?: UnclearReasonSummary[];
  bridge?: BridgeSummary;
  comments?: PublishedComment[];
  improvement?: ImprovementSummary;
} = {}) {
  return render(
    <OutcomesView
      backHref="/"
      kpi={overrides.kpi ?? EMPTY_KPI}
      unclearBreakdown={overrides.unclearBreakdown ?? []}
      bridge={overrides.bridge ?? EMPTY_BRIDGE}
      comments={overrides.comments ?? []}
      improvement={overrides.improvement ?? BASE_IMPROVEMENT}
    />,
  );
}

describe("OutcomesView", () => {
  it("回答数0件のとき、割合(%)を表示せず収集中の文言を表示する", () => {
    renderView();

    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText(/回答を収集中です。/)).toBeTruthy();
  });

  it("回答数が1件以上のとき、割合(%)と集計定義文を表示する", () => {
    const kpi: KpiSummary = {
      totalResponses: 10,
      clearOrPartialCount: 7,
      clearOrPartialPercentage: 70,
      earliestDate: "2026-08-01",
    };

    renderView({ kpi });

    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText(/次に何をすればよいか分かりましたか/)).toBeTruthy();
    expect(screen.getByText(/回答数 10/)).toBeTruthy();
    expect(screen.queryByText(/回答を収集中です。/)).toBeNull();
  });

  it("「まだ分からない」の理由内訳は回答数>0かつ内訳が1件以上のときのみ表示する", () => {
    const kpi: KpiSummary = {
      totalResponses: 3,
      clearOrPartialCount: 1,
      clearOrPartialPercentage: 33,
      earliestDate: "2026-08-01",
    };

    renderView({ kpi, unclearBreakdown: [{ reason: "info-gap", count: 2 }] });

    // ウィジェット側(FEEDBACK_UNCLEAR_REASON_OPTIONS)で利用者に実際に提示される選択肢文言と一致させる。
    expect(screen.getByText(/情報が足りない/)).toBeTruthy();
  });

  it("利用者の声が0件のとき、誠実な空状態文言を表示する", () => {
    renderView();

    expect(
      screen.getByText(
        "掲載できる利用者の声はまだありません。お寄せいただいたコメントは、公開許可をいただいたもののみ、内容を確認したうえで掲載します。",
      ),
    ).toBeTruthy();
  });

  it("利用者の声が1件以上のとき、コメント本文と年月を表示する", () => {
    renderView({
      comments: [{ id: "c1", createdDate: "2026-08-19", commentText: "相談先がすぐ見つかりました" }],
    });

    expect(screen.getByText("相談先がすぐ見つかりました")).toBeTruthy();
    expect(screen.getByText("2026年8月にいただいた声")).toBeTruthy();
  });

  it("橋渡しの延べ到達数は0件でもそのまま数値を表示する(カウンタの実数)", () => {
    renderView();

    expect(screen.getByText("支援情報一覧の延べ到達数")).toBeTruthy();
    expect(screen.getByText("相談メモ画面の延べ到達数")).toBeTruthy();
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  it("改善と広がりのセクションに対応自治体数・登録データ数・掲載データセット数・報告受付件数を表示する", () => {
    renderView();

    expect(screen.getByText("対応自治体数")).toBeTruthy();
    expect(screen.getByText("登録データ数")).toBeTruthy();
    expect(screen.getByText("相談窓口・支援制度・福祉ガイド等を含む(学校情報は含まない)")).toBeTruthy();
    expect(screen.getByText("掲載データセット数")).toBeTruthy();
    expect(screen.getByText("掲載情報の報告受付件数")).toBeTruthy();
    expect(screen.getByText("うち確認・反映済み 8件")).toBeTruthy();
  });

  it("計測方針の透明性説明を表示する", () => {
    renderView();

    expect(
      screen.getByText("回答は日付と選択肢のみを集計し、氏名・IPアドレスなど個人を特定できる情報は保存しません。"),
    ).toBeTruthy();
  });
});
