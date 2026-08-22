import { describe, expect, it } from "vitest";

import { BANNED_WORDS } from "@/lib/copy/banned-words";
import {
  PROCEDURE_REFERENCE_LINKS,
  PROCEDURES_TIMELINE_STAGES,
} from "@/features/procedures-guide/constants/procedures-timeline";

/**
 * 就学・転居後手続きタイムラインの静的データ構造の検証(TICKET-0057)。
 *
 * AC-4(静的コンテンツのみ・出し分けを行わない)を裏付けるため、データ構造自体が
 * 正しく組み立てられていることに加え、本チケットの厳守事項(根拠のない期日・手続き名を
 * 書かない)が将来の変更で崩れないよう、具体的な暦日パターンが含まれないことを回帰防止テストで
 * 固定する。
 */
describe("PROCEDURES_TIMELINE_STAGES", () => {
  it("すべての段階が1件以上の手続きを持つ(AC-1)", () => {
    expect(PROCEDURES_TIMELINE_STAGES.length).toBeGreaterThan(0);
    for (const stage of PROCEDURES_TIMELINE_STAGES) {
      expect(stage.procedures.length).toBeGreaterThan(0);
      for (const procedure of stage.procedures) {
        expect(procedure.name.length).toBeGreaterThan(0);
        expect(procedure.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("転居後の手続き(受給者証・障害福祉サービスの手続き等)を含む(AC-2)", () => {
    const allProcedureText = PROCEDURES_TIMELINE_STAGES.flatMap((stage) =>
      stage.procedures.flatMap((p) => [p.name, p.note]),
    ).join(" ");

    expect(allProcedureText).toMatch(/受給者証/);
    expect(allProcedureText).toMatch(/障害福祉サービス/);
  });

  it("転校・就学相談に関する手続きを含む(AC-1)", () => {
    const allProcedureNames = PROCEDURES_TIMELINE_STAGES.flatMap((stage) =>
      stage.procedures.map((p) => p.name),
    ).join(" ");

    expect(allProcedureNames).toMatch(/就学相談/);
  });

  it("非診断表現の禁止語(診断/判定等)を含まない", () => {
    for (const stage of PROCEDURES_TIMELINE_STAGES) {
      for (const text of [stage.label, stage.description, ...stage.procedures.flatMap((p) => [p.name, p.note])]) {
        for (const word of BANNED_WORDS) {
          expect(text.includes(word)).toBe(false);
        }
      }
    }
  });

  it("【厳守事項の回帰防止】根拠のない具体的な暦日(月・日・週)を一切含まない", () => {
    // 「◯月」「◯週目」「◯日まで」等の具体的な期日表現を検出する(捏造した期日を書かないことの
    // 機械的な担保)。本文中で使ってよいのは相対的な時期区分(段階の label)のみとする。
    const datePattern = /([0-9０-９一二三四五六七八九十]+)\s*(月|週目|日まで|日以内)/;

    for (const stage of PROCEDURES_TIMELINE_STAGES) {
      expect(stage.description).not.toMatch(datePattern);
      for (const procedure of stage.procedures) {
        expect(procedure.note).not.toMatch(datePattern);
      }
    }
  });

  it("根拠が足りない具体的な期限・必要書類は『自治体窓口で確認』へ誘導する", () => {
    // すべての手続き項目ではなく、期限・必要書類に触れている項目については、
    // 必ず自治体窓口への確認誘導が併記されていることを確認する。
    const proceduresWithDeadlineMention = PROCEDURES_TIMELINE_STAGES.flatMap((stage) => stage.procedures).filter(
      (p) => /期限|必要書類/.test(p.note),
    );

    expect(proceduresWithDeadlineMention.length).toBeGreaterThan(0);
    for (const procedure of proceduresWithDeadlineMention) {
      expect(procedure.note).toMatch(/自治体|窓口/);
    }
  });
});

describe("PROCEDURE_REFERENCE_LINKS", () => {
  it("実在が確認できるドメインのみを参照する(捏造したURLを含まない)", () => {
    const allowedHosts = ["www.rehab.go.jp", "catalog.data.metro.tokyo.lg.jp"];

    expect(PROCEDURE_REFERENCE_LINKS.length).toBeGreaterThan(0);
    for (const link of PROCEDURE_REFERENCE_LINKS) {
      const host = new URL(link.url).hostname;
      expect(allowedHosts).toContain(host);
    }
  });

  it("すべてのリンクが https を使う", () => {
    for (const link of PROCEDURE_REFERENCE_LINKS) {
      expect(link.url.startsWith("https://")).toBe(true);
    }
  });
});
