import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";

describe("ProvenanceLabel(TICKET-0062: AI回答の根拠出典区別表示)", () => {
  it("source='primary' の場合は「一次データ」を表示する", () => {
    render(<ProvenanceLabel source="primary" />);

    expect(screen.getByText("一次データ")).toBeTruthy();
  });

  it("source='ai' の場合は「AIによる要約(参考情報)」を表示する", () => {
    render(<ProvenanceLabel source="ai" />);

    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("primary と ai で異なる文言を表示し、事実情報/生成要約を区別できる(AC-1, AC-2)", () => {
    const { rerender } = render(<ProvenanceLabel source="primary" />);
    expect(screen.queryByText("AIによる要約(参考情報)")).toBeNull();

    rerender(<ProvenanceLabel source="ai" />);
    expect(screen.queryByText("一次データ")).toBeNull();
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("source='template' の場合は「選択項目から自動作成(AI不使用)」を表示する(P0対応: AI不使用のメモ生成であることを明示)", () => {
    render(<ProvenanceLabel source="template" />);

    expect(screen.getByText("選択項目から自動作成(AI不使用)")).toBeTruthy();
    expect(screen.queryByText("AIによる要約(参考情報)")).toBeNull();
  });
});
