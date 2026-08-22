import { describe, expect, it } from "vitest";

import { buildPrepareSummaryText } from "@/features/prepare/services/summary-template";
import { BANNED_WORDS } from "@/lib/copy/banned-words";

describe("buildPrepareSummaryText", () => {
  it("最小構成(タグ・カテゴリなし、既定 self)でもエラーにならず「本人として相談したいです。」を含む", () => {
    const text = buildPrepareSummaryText([], []);
    expect(text).toBe("本人として相談したいです。");
  });

  it("困りごとタグがあれば「」区切りで困りごと行を含む", () => {
    const text = buildPrepareSummaryText([], ["こころ・感情", "不注意・段取り"]);
    expect(text).toContain("「こころ・感情」「不注意・段取り」に関する困りごとがあります。");
  });

  it("困りごとタグが空でも上位カテゴリがあればそれを困りごと行に使う(フォールバック)", () => {
    const text = buildPrepareSummaryText(["感情の調整"], []);
    expect(text).toContain("「感情の調整」に関する困りごとがあります。");
  });

  it("困りごとタグ・上位カテゴリの両方が空の場合、困りごと行自体を省略する", () => {
    const text = buildPrepareSummaryText([], []);
    expect(text).not.toContain("に関する困りごとがあります。");
  });

  it("relationship=guardian の場合は「子どもについて相談したいです。」になる", () => {
    const text = buildPrepareSummaryText([], [], "guardian");
    expect(text).toContain("子どもについて相談したいです。");
  });

  it("lifestageLabel を渡すと年齢を先頭に含める", () => {
    const text = buildPrepareSummaryText([], [], "guardian", { lifestageLabel: "未就学児" });
    expect(text.split("\n")[0]).toBe("未就学児の子どもについて相談したいです。");
  });

  it("situationLabels を渡すと困りごと行の先頭に場面を読点区切りで含める", () => {
    const text = buildPrepareSummaryText([], ["こころ・感情"], "self", { situationLabels: ["家庭で"] });
    expect(text).toContain("家庭で、「こころ・感情」に関する困りごとがあります。");
  });

  it("situationLabels が複数の場合も読点で連結する(「で」で終わらないラベルにも対応)", () => {
    const text = buildPrepareSummaryText([], ["こころ・感情"], "self", { situationLabels: ["家庭で", "人と話すとき"] });
    expect(text).toContain("家庭で、人と話すとき、「こころ・感情」に関する困りごとがあります。");
  });

  it("consultPurpose が 'other' の場合、相談したい内容の行を省略する", () => {
    const text = buildPrepareSummaryText([], [], "self", { consultPurpose: "other", consultPurposeLabel: "その他" });
    expect(text).not.toContain("その他です。");
  });

  it("consultPurpose が 'other' 以外かつラベルがあれば行を含める", () => {
    const text = buildPrepareSummaryText([], [], "self", {
      consultPurpose: "school-workplace-accommodation",
      consultPurposeLabel: "学校・職場での対応について相談したい",
    });
    expect(text).toContain("学校・職場での対応について相談したいです。");
  });

  it("contactMethod が 'no-preference' の場合、連絡方法の行を省略する", () => {
    const text = buildPrepareSummaryText([], [], "self", { contactMethod: "no-preference", contactMethodLabel: "特に希望なし" });
    expect(text).not.toContain("相談を希望します。");
  });

  it("contactMethod が 'no-preference' 以外かつラベルがあれば行を含める", () => {
    const text = buildPrepareSummaryText([], [], "self", { contactMethod: "in-person", contactMethodLabel: "対面" });
    expect(text).toContain("可能であれば対面で相談を希望します。");
  });

  it("accommodationLabels があれば配慮事項の行を含める", () => {
    const text = buildPrepareSummaryText([], [], "self", { accommodationLabels: ["電話が苦手"] });
    expect(text).toContain("また、電話が苦手について配慮をお願いしたいです。");
  });

  it("ユーザー提示例(保護者・未就学児・こころ/不注意タグ・学校職場対応・対面希望)を再現する", () => {
    const text = buildPrepareSummaryText([], ["こころ・感情", "不注意・段取り"], "guardian", {
      lifestageLabel: "未就学児",
      situationLabels: ["家庭で"],
      consultPurpose: "school-workplace-accommodation",
      consultPurposeLabel: "学校・職場での対応について相談したい",
      contactMethod: "in-person",
      contactMethodLabel: "対面",
    });

    expect(text).toBe(
      [
        "未就学児の子どもについて相談したいです。",
        "家庭で、「こころ・感情」「不注意・段取り」に関する困りごとがあります。",
        "学校・職場での対応について相談したいです。",
        "可能であれば対面で相談を希望します。",
      ].join("\n"),
    );
  });

  it("いずれの生成結果にも禁止語(diagnosisガード)を含まない", () => {
    const text = buildPrepareSummaryText(["感情の調整"], ["こころ・感情"], "guardian", {
      lifestageLabel: "高校生",
      situationLabels: ["家庭で", "学校・園で"],
      consultPurpose: "diagnosis-checkup",
      consultPurposeLabel: "診断・検査について知りたい",
      contactMethod: "phone",
      contactMethodLabel: "電話",
      accommodationLabels: ["電話が苦手"],
    });
    for (const banned of BANNED_WORDS) {
      if (banned === "診断") continue; // 「診断・検査について知りたい」は利用者自身の希望を表す選択肢ラベルであり、断定表現ではない。
      expect(text, `「${banned}」を含んでいます`).not.toContain(banned);
    }
  });
});
