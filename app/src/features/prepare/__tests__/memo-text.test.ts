import { describe, expect, it } from "vitest";

import { buildPrepareMemoText } from "@/features/prepare/services/memo-text";
import type { PrepareResponse } from "@/features/prepare/schema/prepare";

const BASE_MEMO: PrepareResponse = {
  summary: "困りごとの要約テキスト",
  checklist: ["伝えること1"],
  flow: ["流れ1"],
  questions: ["質問1"],
  facilities: [],
  isFallback: false,
  fallbackMessage: null,
};

describe("buildPrepareMemoText", () => {
  it("見出し・要約・チェックリスト・流れ・質問候補をすべて含む", () => {
    const text = buildPrepareMemoText(BASE_MEMO);

    expect(text).toContain("【相談メモ】");
    expect(text).toContain("困りごとの要約テキスト");
    expect(text).toContain("・伝えること1");
    expect(text).toContain("・流れ1");
    expect(text).toContain("・質問1");
  });

  it("窓口候補が無い場合は「窓口候補」の見出しを含めない", () => {
    const text = buildPrepareMemoText(BASE_MEMO);
    expect(text).not.toContain("■ 窓口候補");
  });

  it("窓口候補がある場合は事実情報(D1由来)を含める", () => {
    const memo: PrepareResponse = {
      ...BASE_MEMO,
      facilities: [
        {
          id: "fac-1",
          name: "テスト相談窓口",
          municipality: "世田谷区",
          address: "東京都世田谷区1-1-1",
          phone: "03-0000-0000",
          url: "https://example.com",
          sourceCredit: "出典: テストデータセット(テスト組織)、cc-by-4.0",
          sourceUrl: "https://example.com/dataset",
          confirmationStatus: null,
          confirmedOn: null,
        },
      ],
    };

    const text = buildPrepareMemoText(memo);
    expect(text).toContain("■ 窓口候補");
    expect(text).toContain("テスト相談窓口(世田谷区)");
    expect(text).toContain("03-0000-0000");
    expect(text).toContain("出典: テストデータセット(テスト組織)、cc-by-4.0");
  });

  it("isFallback かつ fallbackMessage がある場合は末尾に含める", () => {
    const memo: PrepareResponse = { ...BASE_MEMO, isFallback: true, fallbackMessage: "広域窓口を表示しています。" };
    const text = buildPrepareMemoText(memo);
    expect(text).toContain("広域窓口を表示しています。");
  });

  describe("confirmationStatus に応じた注意喚起", () => {
    const buildMemoWithFacilityStatus = (confirmationStatus: PrepareResponse["facilities"][number]["confirmationStatus"]): PrepareResponse => ({
      ...BASE_MEMO,
      facilities: [
        {
          id: "fac-1",
          name: "テスト相談窓口",
          municipality: "世田谷区",
          address: "東京都世田谷区1-1-1",
          phone: "03-0000-0000",
          url: "https://example.com",
          sourceCredit: "出典: テストデータセット(テスト組織)、cc-by-4.0",
          sourceUrl: "https://example.com/dataset",
          confirmationStatus,
          confirmedOn: null,
        },
      ],
    });

    it("phone_required の場合は電話確認の注意喚起文を含める", () => {
      const text = buildPrepareMemoText(buildMemoWithFacilityStatus("phone_required"));
      expect(text).toContain("掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。");
    });

    it("unconfirmed の場合は未確認情報の注意喚起文を含める", () => {
      const text = buildPrepareMemoText(buildMemoWithFacilityStatus("unconfirmed"));
      expect(text).toContain("掲載内容は未確認の情報です。利用前に窓口へ直接ご確認ください。");
    });

    it("confirmed の場合は注意喚起文を含めない", () => {
      const text = buildPrepareMemoText(buildMemoWithFacilityStatus("confirmed"));
      expect(text).not.toContain("利用前に");
    });

    it("confirmationStatus が null の場合は注意喚起文を含めない", () => {
      const text = buildPrepareMemoText(buildMemoWithFacilityStatus(null));
      expect(text).not.toContain("利用前に");
    });
  });
});
