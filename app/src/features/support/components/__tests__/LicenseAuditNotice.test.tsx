import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LicenseAuditNotice } from "@/features/support/components/LicenseAuditNotice";
import type { LicenseAuditStatus } from "@/features/support/components/SchoolInfoSection";

function makeAudit(overrides: Partial<LicenseAuditStatus> = {}): LicenseAuditStatus {
  return {
    schoolClassData: "not_applicable",
    consultationWindowData: "not_applicable",
    zoningData: "not_applicable",
    highSchoolData: "not_applicable",
    ...overrides,
  };
}

describe("LicenseAuditNotice", () => {
  it("licenseAuditがnull/undefinedの場合は何も表示しない", () => {
    const { container: withNull } = render(<LicenseAuditNotice municipality="台東区" licenseAudit={null} />);
    expect(withNull.firstChild).toBeNull();

    const { container: withUndefined } = render(<LicenseAuditNotice municipality="台東区" />);
    expect(withUndefined.firstChild).toBeNull();
  });

  it("4キーすべてが投入・公開可のステータスの場合は何も表示しない", () => {
    const { container } = render(
      <LicenseAuditNotice
        municipality="台東区"
        licenseAudit={makeAudit({ schoolClassData: "ccby_replaced", consultationWindowData: "permission_granted" })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("permission_pendingのカテゴリのみ、自治体名を差し込んだ理由を表示する", () => {
    render(<LicenseAuditNotice municipality="台東区" licenseAudit={makeAudit({ schoolClassData: "permission_pending" })} />);

    expect(screen.getByText("特別支援学級・特別支援教室の設置状況:", { exact: false })).toBeTruthy();
    expect(screen.getByText("台東区への許諾申請中のため、現在掲載していません。", { exact: false })).toBeTruthy();
    expect(screen.queryByText("相談窓口情報:", { exact: false })).toBeNull();
  });

  it("非掲載理由が複数ある場合はカテゴリごとに一覧表示する", () => {
    render(
      <LicenseAuditNotice
        municipality="千代田区"
        licenseAudit={makeAudit({
          schoolClassData: "permission_pending",
          consultationWindowData: "ccby_available",
          zoningData: "tokyo_restricted",
          highSchoolData: "permission_denied",
        })}
      />,
    );

    expect(screen.getByText("千代田区への許諾申請中のため、現在掲載していません。", { exact: false })).toBeTruthy();
    expect(screen.getByText("代替データの反映作業中のため、現在掲載していません。", { exact: false })).toBeTruthy();
    expect(screen.getByText("東京都提供データのため、今回は掲載対象外としています。", { exact: false })).toBeTruthy();
    expect(screen.getByText("掲載許諾が得られなかったため、現在掲載していません。", { exact: false })).toBeTruthy();
  });

  // 2026-08是正: 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts)超過。
  describe("manualDataExpiration(有効期限365日超過、2026-08是正)", () => {
    it("期限切れ+permission_grantedカテゴリの行が出る(AC-4)", () => {
      render(
        <LicenseAuditNotice
          municipality="台東区"
          licenseAudit={makeAudit({ schoolClassData: "permission_granted" })}
          manualDataExpiration={{ formattedExpiresAt: "2027/07/13", isExpired: true }}
        />,
      );

      expect(screen.getByText("特別支援学級・特別支援教室の設置状況:", { exact: false })).toBeTruthy();
      expect(
        screen.getByText("調査データの有効期限(2027/07/13)を過ぎたため、現在掲載していません。最新の情報は各公式サイトでご確認ください。", { exact: false }),
      ).toBeTruthy();
    });

    it("期限切れ+ccby_replacedカテゴリの行も出る", () => {
      render(
        <LicenseAuditNotice
          municipality="台東区"
          licenseAudit={makeAudit({ consultationWindowData: "ccby_replaced" })}
          manualDataExpiration={{ formattedExpiresAt: "2027/07/13", isExpired: true }}
        />,
      );

      expect(screen.getByText("相談窓口情報:", { exact: false })).toBeTruthy();
      expect(screen.getByText(/調査データの有効期限\(2027\/07\/13\)を過ぎたため/)).toBeTruthy();
    });

    it("期限内(isExpired=false)の場合は既存表示のみで、期限切れ行は追加しない", () => {
      render(
        <LicenseAuditNotice
          municipality="台東区"
          licenseAudit={makeAudit({ schoolClassData: "permission_granted" })}
          manualDataExpiration={{ formattedExpiresAt: "2027/07/13", isExpired: false }}
        />,
      );

      expect(screen.queryByText(/調査データの有効期限/)).toBeNull();
    });

    it("not_applicableのカテゴリは期限切れでも行を追加しない", () => {
      render(
        <LicenseAuditNotice
          municipality="台東区"
          licenseAudit={makeAudit({ schoolClassData: "not_applicable" })}
          manualDataExpiration={{ formattedExpiresAt: "2027/07/13", isExpired: true }}
        />,
      );

      expect(screen.queryByText(/調査データの有効期限/)).toBeNull();
    });

    it("manualDataExpirationが無い(undefined)場合は従来どおりの表示のみ", () => {
      const { container } = render(
        <LicenseAuditNotice municipality="台東区" licenseAudit={makeAudit()} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
