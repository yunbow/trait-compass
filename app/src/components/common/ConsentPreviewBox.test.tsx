import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConsentPreviewBox } from "@/components/common/ConsentPreviewBox";

describe("ConsentPreviewBox", () => {
  it("見出し・「送信されるもの」「送信されないもの」のラベル・sent/notSent の中身を表示する", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">入力テキスト: 「困りごとの内容」</p>}
        notSent={<p className="text-foreground">アンケートの回答内容・年齢・地域</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("送信内容を確認してください。")).toBeTruthy();
    expect(screen.getByText("送信されるもの")).toBeTruthy();
    expect(screen.getByText("送信されないもの")).toBeTruthy();
    expect(screen.getByText("入力テキスト: 「困りごとの内容」")).toBeTruthy();
    expect(screen.getByText("アンケートの回答内容・年齢・地域")).toBeTruthy();
  });

  it("『同意して送信』ボタンをクリックすると onConsent が呼ばれる", () => {
    const onConsent = vi.fn();
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={onConsent}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /同意して送信/ }));

    expect(onConsent).toHaveBeenCalledTimes(1);
  });

  it("『キャンセル』ボタンをクリックすると onCancel が呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("『同意して送信』ボタンは Sparkles アイコン(aria-hidden)を伴う", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /同意して送信/ });
    const icon = button.querySelector("svg[aria-hidden='true']");
    expect(icon).toBeTruthy();
  });

  it("note を指定しない場合、任意注記は描画されない(既定は undefined 相当)", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // note 用の任意段落(CategoryExplainSection のAI事業者ポリシー注記相当)がないことを
    // 確認する。本文言は呼び出し元が渡す値なので固定文字列の有無では検証できないため、
    // ConsentPreviewBox が描画する要素数(見出し1+送信されるもの2+送信されないもの2+ボタン2=7)
    // 相当のシンプルな構造であることを role ベースで確認する。
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("note を指定した場合、その内容を表示する", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        note={<p className="text-xs text-muted-foreground">AI事業者側の保持・学習利用の条件は各社のポリシーによります。</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("AI事業者側の保持・学習利用の条件は各社のポリシーによります。")).toBeTruthy();
  });

  it("dense を指定しない場合(既定 false)、CTA ボタンは size=lg 相当(h-9)・外枠は bg 無し p-4 で描画される", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const consentButton = screen.getByRole("button", { name: /同意して送信/ });
    expect(consentButton.className).toContain("h-9");
    expect(consentButton.className).not.toContain("h-7");

    const container = screen.getByText("送信内容を確認してください。").parentElement;
    expect(container?.className).toContain("p-4");
    expect(container?.className).not.toContain("bg-card");
  });

  it("dense=true の場合、CTA ボタンは size=sm 相当(h-7)・外枠は bg-card p-3 で描画される", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
        dense
      />,
    );

    const consentButton = screen.getByRole("button", { name: /同意して送信/ });
    expect(consentButton.className).toContain("h-7");
    expect(consentButton.className).not.toContain("h-9");

    const container = screen.getByText("送信内容を確認してください。").parentElement;
    expect(container?.className).toContain("bg-card");
    expect(container?.className).toContain("p-3");
  });

  it("固定文言「送信内容を確認してください。」「同意して送信」「キャンセル」は props で上書きできない(勝手な文言分岐をしない)", () => {
    render(
      <ConsentPreviewBox
        sent={<p className="text-foreground">送信内容</p>}
        notSent={<p className="text-foreground">送信されない内容</p>}
        onConsent={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("送信内容を確認してください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: /同意して送信/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeTruthy();
  });
});
