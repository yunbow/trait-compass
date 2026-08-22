import { describe, expect, it } from "vitest";

import {
  CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH,
  CONTENT_REPORT_DETAIL_MAX_LENGTH,
  ContentReportRequestSchema,
} from "@/features/content-report/schema/content-report";

const PATHWAY_BASE = { targetType: "pathway" as const, targetId: "path-001", category: "contact" as const };
const SCHOOL_BASE = { targetType: "school" as const, targetId: "school-001", category: "phone" as const };
const GUIDE_BASE = {
  targetType: "guide" as const,
  municipality: "台東区" as const,
  tab: "相談窓口" as const,
  lifestage: null,
  category: "content" as const,
};

describe("ContentReportRequestSchema", () => {
  it("各対象種別の基本形は妥当とする", () => {
    expect(ContentReportRequestSchema.safeParse(PATHWAY_BASE).success).toBe(true);
    expect(ContentReportRequestSchema.safeParse(SCHOOL_BASE).success).toBe(true);
    expect(ContentReportRequestSchema.safeParse(GUIDE_BASE).success).toBe(true);
  });

  describe("対象種別ごとのカテゴリ許可リスト", () => {
    it("pathway は school 専用カテゴリを拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "phone" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "fixed-class" }).success).toBe(false);
    });

    it("pathway は outdated(掲載情報が古い・内容が更新されている)を受理する(P0対応)", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "outdated" }).success).toBe(true);
    });

    it("school は pathway/guide 専用カテゴリを拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "contact" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "outdated" }).success).toBe(false);
    });

    it("guide は pathway/school 専用カテゴリを拒否する(例: phone は guide では不正)", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "phone" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "contact" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "fixed-class" }).success).toBe(false);
    });

    it("school は school 専用カテゴリ(fixed-class/resource-room/school-status)を受理する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "fixed-class" }).success).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "resource-room" }).success).toBe(true);
      expect(
        ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "school-status", detailText: "統合されたようです" })
          .success,
      ).toBe(true);
    });

    it("guide は guide 専用カテゴリ(outdated)を受理する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "outdated" }).success).toBe(true);
    });
  });

  describe("detailText 必須カテゴリ(unclear/other/school-status)", () => {
    it("pathway の unclear/other は detailText 必須", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "unclear" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "unclear", detailText: "" }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "unclear", detailText: "分かりにくいです" }).success,
      ).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "other" }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "other", detailText: "その他の理由" }).success,
      ).toBe(true);
    });

    it("school の unclear/other/school-status は detailText 必須", () => {
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "unclear" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "other" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "school-status" }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, category: "school-status", detailText: "閉校したようです" })
          .success,
      ).toBe(true);
    });

    it("guide の unclear/other は detailText 必須", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "unclear" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "other" }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, category: "other", detailText: "情報が古いです" }).success,
      ).toBe(true);
    });

    it("空白のみの detailText は未指定と同様に拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, category: "unclear", detailText: "   " }).success).toBe(
        false,
      );
    });
  });

  describe("strict() 違反(未知のキー)", () => {
    it("各対象種別で未知のキーを含む body を拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, extra: "nope" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, extra: "nope" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, extra: "nope" }).success).toBe(false);
    });

    it("targetType=guide に targetId を含めると拒否する(pathway/schoolのみのフィールド)", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, targetId: "path-001" }).success).toBe(false);
    });

    it("targetType=pathway に municipality/tab/lifestage を含めると拒否する(guideのみのフィールド)", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, tab: "相談窓口" }).success).toBe(false);
    });
  });

  describe("最大文字数", () => {
    it("correctedValue/detailText の最大文字数を超えると拒否する", () => {
      const tooLongCorrected = "あ".repeat(CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH + 1);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, correctedValue: tooLongCorrected }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({
          ...PATHWAY_BASE,
          correctedValue: "あ".repeat(CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH),
        }).success,
      ).toBe(true);

      const tooLongDetail = "い".repeat(CONTENT_REPORT_DETAIL_MAX_LENGTH + 1);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, detailText: tooLongDetail }).success).toBe(false);
      expect(
        ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, detailText: "い".repeat(CONTENT_REPORT_DETAIL_MAX_LENGTH) })
          .success,
      ).toBe(true);
    });
  });

  describe("ハニーポット(website)", () => {
    it("任意で、値があっても形式エラーにはしない", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, website: "" }).success).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, website: "http://spam.example" }).success).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, website: "http://spam.example" }).success).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, website: "http://spam.example" }).success).toBe(true);
    });
  });

  describe("targetId / 対象識別子の妥当性", () => {
    it("pathway/school の targetId が空文字・長すぎる場合は拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, targetId: "" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, targetId: "a".repeat(65) }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...SCHOOL_BASE, targetId: "" }).success).toBe(false);
    });

    it("guide の municipality/tab が未知の値の場合は拒否する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, municipality: "架空市" }).success).toBe(false);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, tab: "架空タブ" }).success).toBe(false);
    });

    it("guide の lifestage は null を許容する", () => {
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, lifestage: null }).success).toBe(true);
      expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, lifestage: "preschool" }).success).toBe(true);
    });
  });

  it("未知の targetType は拒否する", () => {
    expect(ContentReportRequestSchema.safeParse({ ...PATHWAY_BASE, targetType: "facility" }).success).toBe(false);
  });

  it("guide の municipality に東京都外の実在する市区町村『横浜市』を指定すると拒否する", () => {
    expect(ContentReportRequestSchema.safeParse({ ...GUIDE_BASE, municipality: "横浜市" }).success).toBe(false);
  });
});
