import { describe, expect, it } from "vitest";

import { buildSchoolAnswer } from "@/features/ask-ai/services/school-answer";
import type { SchoolWithDetails } from "@/features/support/services/school-info";

const BASE_SCHOOL: SchoolWithDetails = {
  id: "school-001",
  municipality: "台東区",
  name: "台東第一小学校",
  level: "elementary",
  address: "東京都台東区1-1-1",
  phone: "03-1234-5678",
  url: "https://example.city.taito.lg.jp/school1",
  fixedClasses: [],
  resourceRoom: undefined,
  sources: [{ label: "台東区教育委員会 学校要覧", url: "https://example.com/1", confirmedOn: "2026-07-01" }],
};

describe("buildSchoolAnswer", () => {
  describe("school-fixed-class", () => {
    it("固定学級の障害種別・状態を日本語ラベルへ変換して回答する(内部コード値をそのまま出さない)", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        fixedClasses: [{ disabilityType: "autism_emotional", status: "unconfirmed" }],
      };

      const { answer } = buildSchoolAnswer("school-fixed-class", school);

      expect(answer).toContain("自閉症・情緒障害");
      expect(answer).toContain("未確認");
      expect(answer).not.toContain("autism_emotional");
      expect(answer).not.toContain("(unconfirmed)");
    });

    it("confirmed状態のクラスは状態表記を付けない", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        fixedClasses: [{ disabilityType: "intellectual", status: "confirmed" }],
      };

      const { answer } = buildSchoolAnswer("school-fixed-class", school);

      expect(answer).toContain("知的障害");
      expect(answer).not.toContain("確認済み");
      expect(answer).not.toContain("未確認の情報を学校へ直接ご確認ください");
    });

    it("固定学級が無い場合は非該当の案内文を返す", () => {
      const { answer } = buildSchoolAnswer("school-fixed-class", BASE_SCHOOL);
      expect(answer).toContain("現在確認できていません");
    });

    it("className・複数クラスがある場合はすべて反映する", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        fixedClasses: [
          { disabilityType: "intellectual", className: "たんぽぽ学級", status: "confirmed" },
          { disabilityType: "autism_emotional", status: "phone_required" },
        ],
      };

      const { answer } = buildSchoolAnswer("school-fixed-class", school);

      expect(answer).toContain("知的障害・たんぽぽ学級");
      expect(answer).toContain("自閉症・情緒障害(要電話確認)");
    });
  });

  describe("school-resource-room", () => {
    it("拠点校の場合はその旨を回答する", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        resourceRoom: { hasResourceRoom: true, isHubSchool: true, groupName: "第一グループ" },
      };
      const { answer } = buildSchoolAnswer("school-resource-room", school);
      expect(answer).toContain("拠点校");
      expect(answer).toContain("第一グループ");
    });

    it("巡回対象校(拠点校でない)の場合は拠点校名を案内する", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        resourceRoom: { hasResourceRoom: true, isHubSchool: false, hubSchoolName: "台東第二小学校" },
      };
      const { answer } = buildSchoolAnswer("school-resource-room", school);
      expect(answer).toContain("台東第二小学校");
      expect(answer).toContain("巡回");
    });

    it("特別支援教室が無い/未設定の場合は非該当の案内文を返す", () => {
      const { answer } = buildSchoolAnswer("school-resource-room", BASE_SCHOOL);
      expect(answer).toContain("現在確認できていません");
    });
  });

  describe("school-contact", () => {
    it("電話・住所の両方がある場合は両方案内する", () => {
      const { answer } = buildSchoolAnswer("school-contact", BASE_SCHOOL);
      expect(answer).toContain("03-1234-5678");
      expect(answer).toContain("東京都台東区1-1-1");
    });

    it("電話・住所のいずれも無い場合はフォールバック文を返す", () => {
      const school: SchoolWithDetails = { ...BASE_SCHOOL, phone: undefined, address: undefined };
      const { answer } = buildSchoolAnswer("school-contact", school);
      expect(answer).toContain("現在確認できません");
    });
  });

  describe("school-overview", () => {
    it("固定学級・特別支援教室の両方がある場合は両方を挙げる", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        fixedClasses: [{ disabilityType: "intellectual", status: "confirmed" }],
        resourceRoom: { hasResourceRoom: true, isHubSchool: true },
      };
      const { answer } = buildSchoolAnswer("school-overview", school);
      expect(answer).toContain("固定学級");
      expect(answer).toContain("特別支援教室");
    });

    it("支援体制の情報が無い場合はフォールバック文を返す", () => {
      const { answer } = buildSchoolAnswer("school-overview", BASE_SCHOOL);
      expect(answer).toContain("限られています");
    });
  });

  describe("sources", () => {
    it("学校自体のsourcesと固定級のsourcesを重複排除して統合する", () => {
      const school: SchoolWithDetails = {
        ...BASE_SCHOOL,
        sources: [{ label: "共通出典", url: "https://example.com/shared", confirmedOn: "2026-07-01" }],
        fixedClasses: [
          {
            disabilityType: "intellectual",
            status: "confirmed",
            sources: [
              { label: "共通出典", url: "https://example.com/shared", confirmedOn: "2026-07-01" },
              { label: "固定級出典", url: "https://example.com/fixed", confirmedOn: "2026-07-02" },
            ],
          },
        ],
      };

      const { sources } = buildSchoolAnswer("school-overview", school);

      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.credit)).toEqual(
        expect.arrayContaining([expect.stringContaining("共通出典"), expect.stringContaining("固定級出典")]),
      );
    });
  });

  it("未知のquestionIdは例外を投げる(zodで事前に弾かれている前提の実装バグ早期検知)", () => {
    expect(() => buildSchoolAnswer("unknown-question", BASE_SCHOOL)).toThrow();
  });
});
