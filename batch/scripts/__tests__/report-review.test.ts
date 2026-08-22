import { describe, expect, it } from "vitest";

import { buildListSql, buildStatusUpdateSql, parseTargetFlag } from "../report-review.mjs";

const VALID_ID = "b1f7c8a0-1234-4abc-8def-0123456789ab";

describe("buildListSql", () => {
  it("facility_reports: status='new' を作成日時降順で取得するSELECTを組み立てる", () => {
    const sql = buildListSql("facility_reports");
    expect(sql).toBe(
      "SELECT id, created_at, facility_name, municipality, report_category, closure_status, corrected_value, detail_text FROM facility_reports WHERE status='new' ORDER BY created_at DESC",
    );
  });

  it("content_reports: status='new' を作成日時降順で取得するSELECTを組み立てる", () => {
    const sql = buildListSql("content_reports");
    expect(sql).toBe(
      "SELECT id, created_at, target_type, target_label, municipality, report_category, corrected_value, detail_text FROM content_reports WHERE status='new' ORDER BY created_at DESC",
    );
  });
});

describe("buildStatusUpdateSql", () => {
  it("UUID形式のidであればUPDATE文を組み立てる(status_updated_atも同時更新、migration 0027)", () => {
    const sql = buildStatusUpdateSql("facility_reports", VALID_ID, "done");
    expect(sql).toBe(
      `UPDATE facility_reports SET status='done', status_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='${VALID_ID}'`,
    );
  });

  it("dismissedステータスも組み立てられる", () => {
    const sql = buildStatusUpdateSql("content_reports", VALID_ID, "dismissed");
    expect(sql).toBe(
      `UPDATE content_reports SET status='dismissed', status_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='${VALID_ID}'`,
    );
  });

  it("UUID形式でないidは例外を投げる(SQLインジェクション対策)", () => {
    expect(() => buildStatusUpdateSql("facility_reports", "not-a-uuid", "done")).toThrow(/UUID形式ではありません/);
  });

  it("SQLメタ文字を含むidは例外を投げる(UUID形式チェックで弾かれる)", () => {
    expect(() => buildStatusUpdateSql("facility_reports", "'; DROP TABLE facility_reports; --", "done")).toThrow(
      /UUID形式ではありません/,
    );
  });
});

describe("parseTargetFlag", () => {
  it("--remote のみ指定した場合は --remote を返す", () => {
    expect(parseTargetFlag(["--remote"])).toBe("--remote");
  });

  it("--local のみ指定した場合は --local を返す", () => {
    expect(parseTargetFlag(["--local"])).toBe("--local");
  });

  it("両方とも未指定の場合は例外を投げる", () => {
    expect(() => parseTargetFlag([])).toThrow(/--local または --remote/);
  });

  it("両方とも指定された場合は例外を投げる", () => {
    expect(() => parseTargetFlag(["--local", "--remote"])).toThrow(/--local または --remote/);
  });
});
