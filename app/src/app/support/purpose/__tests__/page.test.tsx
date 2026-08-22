import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SupportPurposePage from "@/app/support/purpose/page";
import { PURPOSE_OPTIONS_BY_LIFESTAGE } from "@/features/support/constants/purpose-options";

// PurposeSelectionForm(クライアントコンポーネント)が useRouter() を呼ぶため、
// support-input-form.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SupportPurposePage", () => {
  it("lifestageが不正な場合は差し戻し表示になる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ lifestage: "unknown", municipality: "新宿区" }),
      }),
    );

    expect(screen.getByText("検索条件を確認できませんでした。")).toBeTruthy();
    expect(screen.getByText("年齢と区市町村を選び直してください。")).toBeTruthy();
  });

  it("lifestageが欠損している場合は差し戻し表示になる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ municipality: "新宿区" }),
      }),
    );

    expect(screen.getByText("検索条件を確認できませんでした。")).toBeTruthy();
  });

  it("municipalityがMUNICIPALITIESに無い値の場合も差し戻し表示になる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ lifestage: "preschool", municipality: "存在しない市" }),
      }),
    );

    expect(screen.getByText("検索条件を確認できませんでした。")).toBeTruthy();
  });

  it("municipalityが欠損している場合も差し戻し表示になる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ lifestage: "preschool" }),
      }),
    );

    expect(screen.getByText("検索条件を確認できませんでした。")).toBeTruthy();
  });

  it("正常な場合、PurposeSelectionFormがlifestageLabel等の正しいpropsでレンダリングされる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ lifestage: "preschool", municipality: "新宿区" }),
      }),
    );

    // lifestageLabel(「この条件で探します」の年齢バッジ)が解決されている
    expect(screen.getByText("未就学児")).toBeTruthy();

    // ageGroup(preschool→child)を元にした目的一覧(PURPOSE_OPTIONS_BY_LIFESTAGE.preschool)が表示される
    for (const option of PURPOSE_OPTIONS_BY_LIFESTAGE.preschool) {
      expect(screen.getByText(option.label)).toBeTruthy();
    }

    // 戻るリンクに lifestage/municipality が引き継がれている
    const backLink = screen.getByRole("link", { name: "← 年齢・地域の選択に戻る" });
    expect(backLink.getAttribute("href")).toBe(
      `/support?${new URLSearchParams({ municipality: "13104", lifestage: "preschool" }).toString()}`,
    );
  });

  it("municipality にコードを指定しても名前指定と同じpropsで正常にレンダリングされる", async () => {
    render(
      await SupportPurposePage({
        searchParams: Promise.resolve({ lifestage: "preschool", municipality: "13104" }),
      }),
    );

    expect(screen.getByText("未就学児")).toBeTruthy();
    for (const option of PURPOSE_OPTIONS_BY_LIFESTAGE.preschool) {
      expect(screen.getByText(option.label)).toBeTruthy();
    }
    const backLink = screen.getByRole("link", { name: "← 年齢・地域の選択に戻る" });
    expect(backLink.getAttribute("href")).toBe(
      `/support?${new URLSearchParams({ municipality: "13104", lifestage: "preschool" }).toString()}`,
    );
  });
});
