import { describe, expect, it } from "vitest";

import {
  containsCausalAssertion,
  containsFabricatedFacilityName,
  containsFabricatedPhone,
  containsFabricatedUrl,
} from "@/features/recommend/services/fact-guard";

describe("containsFabricatedPhone", () => {
  it("電話番号らしき文字列が無ければ false", () => {
    expect(containsFabricatedPhone("親身に相談に乗ってくれる窓口です。", "03-1234-5678")).toBe(false);
  });

  it("実際の電話番号と一致する場合は false(単なる引用)", () => {
    expect(containsFabricatedPhone("お電話は 03-1234-5678 までどうぞ。", "03-1234-5678")).toBe(false);
  });

  it("実際の電話番号と異なる電話番号らしき文字列を含む場合は true(捏造とみなす)", () => {
    expect(containsFabricatedPhone("お電話は 090-9999-9999 までどうぞ。", "03-1234-5678")).toBe(true);
  });

  it("D1 に電話番号が無い(null)のに電話番号らしき文字列を含む場合は true", () => {
    expect(containsFabricatedPhone("お電話は 090-9999-9999 までどうぞ。", null)).toBe(true);
  });
});

describe("containsFabricatedUrl(TICKET-0024, Faithfulness評価)", () => {
  it("URL らしき文字列が無ければ false", () => {
    expect(containsFabricatedUrl("親身に相談に乗ってくれる窓口です。", ["https://example.setagaya.tokyo.jp/soudan"])).toBe(
      false,
    );
  });

  it("許可集合に含まれる URL の引用は false", () => {
    expect(
      containsFabricatedUrl("詳細は https://example.setagaya.tokyo.jp/soudan をご覧ください。", [
        "https://example.setagaya.tokyo.jp/soudan",
      ]),
    ).toBe(false);
  });

  it("文末の句読点付きでも許可集合に含まれれば false", () => {
    expect(
      containsFabricatedUrl("詳細はこちら(https://example.setagaya.tokyo.jp/soudan)。", [
        "https://example.setagaya.tokyo.jp/soudan",
      ]),
    ).toBe(false);
  });

  it("許可集合に無い URL を含む場合は true(捏造とみなす)", () => {
    expect(containsFabricatedUrl("詳細は https://fake.example.com/scam をご覧ください。", ["https://example.setagaya.tokyo.jp/soudan"])).toBe(
      true,
    );
  });
});

describe("containsFabricatedFacilityName(TICKET-0024, Faithfulness評価)", () => {
  it("他施設名を含まなければ false", () => {
    expect(
      containsFabricatedFacilityName("対人関係の相談に力を入れている窓口です。", "世田谷区 発達障がい相談支援センター(ダミー)", [
        "新宿区 発達障害者支援窓口(ダミー)",
      ]),
    ).toBe(false);
  });

  it("対象施設自身の名前を含んでいても false(取り違えではない)", () => {
    expect(
      containsFabricatedFacilityName(
        "世田谷区 発達障がい相談支援センター(ダミー)が合いそうです。",
        "世田谷区 発達障がい相談支援センター(ダミー)",
        ["新宿区 発達障害者支援窓口(ダミー)"],
      ),
    ).toBe(false);
  });

  it("他施設名を含む場合は true(施設の取り違え)", () => {
    expect(
      containsFabricatedFacilityName(
        "新宿区 発達障害者支援窓口(ダミー)にご相談ください。",
        "世田谷区 発達障がい相談支援センター(ダミー)",
        ["新宿区 発達障害者支援窓口(ダミー)"],
      ),
    ).toBe(true);
  });
});

describe("containsCausalAssertion(TICKET-0060, SNS-D05: 相関と因果の峻別)", () => {
  it("「〜のため△△が原因です」型の因果断定を検出する", () => {
    expect(containsCausalAssertion("不注意の傾向が高いためADHDが原因です。")).toBe(true);
  });

  it("「〜が原因であり」型の因果断定を検出する", () => {
    expect(containsCausalAssertion("感覚の過敏さが原因であり、環境調整が必要です。")).toBe(true);
  });

  it("「〜によって引き起こされ」型の因果断定を検出する", () => {
    expect(containsCausalAssertion("特性によって引き起こされる行動だと考えられます。")).toBe(true);
  });

  it("通常の解説文(因果断定の語を含まない)は検出しない", () => {
    expect(
      containsCausalAssertion("落ち着いた環境で相談できる点が、今の悩みに合いそうです。"),
    ).toBe(false);
  });

  it("カテゴリ説明文相当の中立的な記述は検出しない", () => {
    expect(
      containsCausalAssertion(
        "感覚処理の違いにより生じる、周囲からは理解されにくい反応・行動のパターンを扱うカテゴリです。",
      ),
    ).toBe(false);
  });

  it("否定・非該当を明示する文脈(「原因ではありません」)は誤検出しない(AC-5)", () => {
    expect(
      containsCausalAssertion("不注意の傾向が高いため、これが原因というわけではありません。"),
    ).toBe(false);
  });

  it("専門家への相談を促す文(「かどうかは」)は誤検出しない(AC-5、copy-guidelines.md §1 の例外規定と同じ考え方)", () => {
    expect(
      containsCausalAssertion("診断や治療が必要かどうかは、医療機関や専門の相談窓口にご確認ください。"),
    ).toBe(false);
  });
});
