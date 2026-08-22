import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConditionPill, ConditionPillList } from "@/components/common/ConditionPill";

describe("ConditionPill", () => {
  it("variant=card かつ label ありの場合、ラベルと値を別々のspanで表示する", () => {
    render(<ConditionPill label="地域" value="新宿区" />);

    const label = screen.getByText("地域");
    const value = screen.getByText("新宿区");
    expect(label.className).toBe("text-xs text-muted-foreground");
    expect(value.className).toBe("font-medium text-foreground");
    expect(label.parentElement?.className).toBe("inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1");
  });

  it("variant=card かつ label 無しの場合、値のみを1つのspanで表示する", () => {
    render(<ConditionPill value="発達" />);

    const value = screen.getByText("発達");
    expect(value.className).toBe("rounded-full bg-card px-2.5 py-1 text-xs text-foreground");
  });

  it("variant=outline かつ label ありの場合、「ラベル 値」の1つのspanで表示する", () => {
    render(<ConditionPill variant="outline" label="年齢" value="18歳未満" />);

    const pill = screen.getByText("年齢 18歳未満");
    expect(pill.className).toBe("rounded-full border border-primary/30 bg-background px-2 py-1 text-xs text-foreground");
  });

  it("variant=outline かつ label 無しの場合、値のみを1つのspanで表示する", () => {
    render(<ConditionPill variant="outline" value="新宿区" />);

    const pill = screen.getByText("新宿区");
    expect(pill.className).toBe("rounded-full border border-primary/30 bg-background px-2 py-1 text-xs text-foreground");
  });
});

describe("ConditionPillList", () => {
  it("タグが3件以下の場合、全件をそのままピル表示する", () => {
    render(<ConditionPillList tags={["発達", "不登校", "経済的困窮"]} />);

    expect(screen.getByText("発達")).toBeTruthy();
    expect(screen.getByText("不登校")).toBeTruthy();
    expect(screen.getByText("経済的困窮")).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("タグが4件以上の場合、先頭3件と「+n件」の1ピルにまとめる", () => {
    render(<ConditionPillList tags={["発達", "不登校", "経済的困窮", "いじめ", "虐待"]} />);

    expect(screen.getByText("発達")).toBeTruthy();
    expect(screen.getByText("不登校")).toBeTruthy();
    expect(screen.getByText("経済的困窮")).toBeTruthy();
    expect(screen.queryByText("いじめ")).toBeNull();
    expect(screen.queryByText("虐待")).toBeNull();
    expect(screen.getByText("+2件")).toBeTruthy();
  });
});
