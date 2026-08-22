import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FullPageFallback } from "@/components/common/FullPageFallback";
import { NoAnswersFallback } from "@/components/common/NoAnswersFallback";

/**
 * full-page-fallback-consolidation 移行計画(docs/ui-consolidation/full-page-fallback-consolidation.md)の
 * 検証用テスト。
 *
 * 調査時点(2026-08-12)の事実関係:
 * - `FullPageFallback`(移行先)は既に実装・テスト済み(`components/common/FullPageFallback.test.tsx`、
 *   co-location)。propsDesign(title/description/action)のレンダリングパターン・エッジケースは
 *   そちらで既にカバーされているため、ここで重複するテストは書かない。
 * - 未着手なのは「消費側3箇所(ResultView の空回答分岐・BrokenShareResultView・
 *   NoAnswersFallback)が `FullPageFallback` の実装を再発明している」状態の解消そのもの。
 *   このファイルは、その移行が (a) 見た目上のドリフトを起こさないこと(回帰防止)、
 *   (b) migrationNotes に明記された「NoAnswersFallback に DisclaimerNotice が追加される」という
 *   意図的な変更を実際に満たすこと、を確認する。
 *
 * ResultView 本体(空回答分岐・BrokenShareResultView)の表示内容は
 * `features/result/__tests__/result-view.test.tsx` で既にテキストベースの回帰テストが存在するため
 * (「まだ回答がありません」「共有 URL を読み込めませんでした。」等)、ここでは重複させない。
 */
describe("full-page-fallback-consolidation: FullPageFallback 側の未カバー箇所", () => {
  it("action に複数要素(Fragment)を渡した場合、両方とも表示する(migrationNotes: 複数ボタンを渡せる前提)", () => {
    render(
      <FullPageFallback
        title="タイトル"
        description="説明"
        action={
          <>
            <button type="button">チェックを始める</button>
            <button type="button">トップへ戻る</button>
          </>
        }
      />,
    );

    expect(screen.getByRole("button", { name: "チェックを始める" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "トップへ戻る" })).toBeTruthy();
  });
});

describe("full-page-fallback-consolidation: NoAnswersFallback の移行後あるべき姿(RED: 未移行の現状では失敗する)", () => {
  it("非診断免責(DisclaimerNotice)を表示する(FullPageFallback へ委譲後に得られるはずの挙動。NFR-52)", () => {
    // 現状の NoAnswersFallback.tsx は DisclaimerNotice を描画していない(FullPageFallback の
    // 独自再実装であり、免責表示だけが漏れている)。migrationNotes が「現状の抜け漏れ修正」と
    // 明記する通り、FullPageFallback へ委譲する薄いラッパーに書き換えた時点でこのテストは
    // 通るようになる想定。書き換え前の時点では red で問題ない。
    render(<NoAnswersFallback />);

    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("移行前後で見出し・説明文・2つの導線ボタンの文言は変えない(回帰防止のゴールデンマスター)", () => {
    render(<NoAnswersFallback />);

    expect(screen.getByText("まだ回答がありません。")).toBeTruthy();
    expect(screen.getByText("アンケートに回答すると、この機能が使えます。")).toBeTruthy();

    const startLink = screen.getByRole("button", { name: "チェックを始める" });
    expect(startLink.getAttribute("href")).toBe("/survey");

    const backLink = screen.getByRole("button", { name: "結果画面へ戻る" });
    expect(backLink.getAttribute("href")).toBe("/result");
  });

  it("移行前後で main のフォーカス管理(id=main-content, tabIndex=-1)を変えない(回帰防止)", () => {
    const { container } = render(<NoAnswersFallback />);

    const main = container.querySelector("main");
    expect(main?.id).toBe("main-content");
    expect(main?.getAttribute("tabindex")).toBe("-1");
  });
});
