import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hasAnsweredFeedback, markFeedbackAnswered } from "@/features/feedback/services/session";

describe("feedback session(nd-feedback-answered)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("初期状態(未回答)ではfalseを返す", () => {
    expect(hasAnsweredFeedback()).toBe(false);
  });

  it("markFeedbackAnswered後はhasAnsweredFeedbackがtrueを返す", () => {
    markFeedbackAnswered();

    expect(hasAnsweredFeedback()).toBe(true);
  });

  it("sessionStorageにキーnd-feedback-answeredとして'1'を保存する", () => {
    markFeedbackAnswered();

    expect(window.sessionStorage.getItem("nd-feedback-answered")).toBe("1");
  });

  it("sessionStorage.setItemが例外を投げても握りつぶす(プライベートブラウジング等)", () => {
    const original = window.sessionStorage.setItem.bind(window.sessionStorage);
    window.sessionStorage.setItem = () => {
      throw new Error("quota exceeded");
    };

    expect(() => markFeedbackAnswered()).not.toThrow();

    window.sessionStorage.setItem = original;
  });

  it("sessionStorage.getItemが例外を投げた場合はfalse(安全側)を返す", () => {
    const original = window.sessionStorage.getItem.bind(window.sessionStorage);
    window.sessionStorage.getItem = () => {
      throw new Error("blocked");
    };

    expect(hasAnsweredFeedback()).toBe(false);

    window.sessionStorage.getItem = original;
  });
});
