import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfirmationNotice, getConfirmationNoticeText } from "@/features/support/components/ConfirmationNotice";

describe("getConfirmationNoticeText(外部レビュー指摘対応)", () => {
  it("confirmationStatus='phone_required' の場合、掲載内容の電話確認が未完了である旨の文言を返す(施設利用に電話確認が必要という誤解を招く文言にしない)", () => {
    expect(getConfirmationNoticeText("phone_required")).toBe(
      "掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。",
    );
  });

  it("confirmationStatus='unconfirmed' の場合、未確認の情報である旨の文言を返す", () => {
    expect(getConfirmationNoticeText("unconfirmed")).toBe(
      "掲載内容は未確認の情報です。利用前に窓口へ直接ご確認ください。",
    );
  });

  it("confirmationStatus='confirmed' の場合、null を返す(注記不要)", () => {
    expect(getConfirmationNoticeText("confirmed")).toBeNull();
  });

  it("confirmationStatus=null(CKAN/オープンデータ由来でこの概念を持たない施設)の場合、null を返す", () => {
    expect(getConfirmationNoticeText(null)).toBeNull();
  });
});

describe("ConfirmationNotice", () => {
  it("confirmationStatus='phone_required' の場合、注意書きを表示する", () => {
    render(<ConfirmationNotice confirmationStatus="phone_required" />);
    expect(screen.getByText("掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。")).toBeTruthy();
  });

  it("confirmationStatus='confirmed' の場合、何も表示しない", () => {
    const { container } = render(<ConfirmationNotice confirmationStatus="confirmed" />);
    expect(container.textContent).toBe("");
  });

  it("confirmationStatus=null の場合、何も表示しない", () => {
    const { container } = render(<ConfirmationNotice confirmationStatus={null} />);
    expect(container.textContent).toBe("");
  });
});
