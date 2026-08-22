import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProceduresGuidePage from "@/app/procedures-guide/page";

describe("ProceduresGuidePage", () => {
  it("静的なタイムラインガイドを表示する(D1アクセス無し)", () => {
    render(<ProceduresGuidePage />);
    expect(screen.getByText("就学・転居後手続きタイムライン")).toBeTruthy();
  });
});
