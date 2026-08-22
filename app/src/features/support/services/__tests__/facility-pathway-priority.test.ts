import { describe, expect, it } from "vitest";

import { applyPathwayPriority } from "@/features/support/services/facility-pathway-priority";
import type { SupportPathwayStepData } from "@/features/support/services/support-pathway";

interface Row {
  name: string;
  isPathwayFacility: boolean;
}

function makeStep(overrides: Partial<Pick<SupportPathwayStepData, "actor">> = {}): Pick<SupportPathwayStepData, "actor"> {
  return { actor: null, ...overrides };
}

describe("applyPathwayPriority", () => {
  it("想定ルートのステップに登場する窓口を、その出現順で先頭に並べ替え isPathwayFacility=true にする", () => {
    const rows: Row[] = [
      { name: "施設C", isPathwayFacility: false },
      { name: "施設A", isPathwayFacility: false },
      { name: "施設B", isPathwayFacility: false },
    ];
    const pathwaySteps = [makeStep({ actor: "施設A" }), makeStep({ actor: "施設B" })];

    const result = applyPathwayPriority(rows, pathwaySteps);

    expect(result).toEqual([
      { name: "施設A", isPathwayFacility: true },
      { name: "施設B", isPathwayFacility: true },
      { name: "施設C", isPathwayFacility: false },
    ]);
  });

  it("想定ルートに登場しない施設は元の相対順序を維持したまま後方に続き、isPathwayFacility=false になる", () => {
    const rows: Row[] = [
      { name: "施設Z", isPathwayFacility: false },
      { name: "施設A", isPathwayFacility: false },
      { name: "施設Y", isPathwayFacility: false },
    ];
    const pathwaySteps = [makeStep({ actor: "施設A" })];

    const result = applyPathwayPriority(rows, pathwaySteps);

    expect(result).toEqual([
      { name: "施設A", isPathwayFacility: true },
      { name: "施設Z", isPathwayFacility: false },
      { name: "施設Y", isPathwayFacility: false },
    ]);
  });

  it("pathwaySteps が空配列の場合、順序を変えずに全件 isPathwayFacility=false になる", () => {
    const rows: Row[] = [
      { name: "施設A", isPathwayFacility: false },
      { name: "施設B", isPathwayFacility: false },
    ];

    const result = applyPathwayPriority(rows, []);

    expect(result).toEqual([
      { name: "施設A", isPathwayFacility: false },
      { name: "施設B", isPathwayFacility: false },
    ]);
  });

  it("pathwaySteps の actor が null の場合、そのステップは無視される", () => {
    const rows: Row[] = [
      { name: "施設A", isPathwayFacility: false },
      { name: "施設B", isPathwayFacility: false },
    ];
    const pathwaySteps = [makeStep({ actor: null }), makeStep({ actor: "施設B" })];

    const result = applyPathwayPriority(rows, pathwaySteps);

    expect(result).toEqual([
      { name: "施設B", isPathwayFacility: true },
      { name: "施設A", isPathwayFacility: false },
    ]);
  });

  it("pathwaySteps に同じ actor が複数回登場する場合、重複除去され初出のみが優先順位に使われる", () => {
    const rows: Row[] = [
      { name: "施設B", isPathwayFacility: false },
      { name: "施設A", isPathwayFacility: false },
    ];
    const pathwaySteps = [makeStep({ actor: "施設A" }), makeStep({ actor: "施設B" }), makeStep({ actor: "施設A" })];

    const result = applyPathwayPriority(rows, pathwaySteps);

    expect(result).toEqual([
      { name: "施設A", isPathwayFacility: true },
      { name: "施設B", isPathwayFacility: true },
    ]);
  });

  it("rows 側に同名の施設が複数件ある場合、元の rows 内での相対順序を維持したまま優先グループに含まれる", () => {
    const rows: Row[] = [
      { name: "施設A", isPathwayFacility: false },
      { name: "施設C", isPathwayFacility: false },
      { name: "施設A", isPathwayFacility: false },
    ];
    const pathwaySteps = [makeStep({ actor: "施設A" })];

    const result = applyPathwayPriority(rows, pathwaySteps);

    expect(result).toEqual([
      { name: "施設A", isPathwayFacility: true },
      { name: "施設A", isPathwayFacility: true },
      { name: "施設C", isPathwayFacility: false },
    ]);
  });

  it("入力(rows)を破壊的に変更しない(元の配列・オブジェクトを変更せず新しいオブジェクトを返す)", () => {
    const original: Row = { name: "施設A", isPathwayFacility: false };
    const rows: Row[] = [original, { name: "施設B", isPathwayFacility: false }];
    const frozenRows = Object.freeze([...rows]);
    const pathwaySteps = [makeStep({ actor: "施設A" })];

    const result = applyPathwayPriority(frozenRows, pathwaySteps);

    // 元の配列・オブジェクトは変更されない
    expect(frozenRows[0]).toBe(original);
    expect(original.isPathwayFacility).toBe(false);
    expect(rows[0].isPathwayFacility).toBe(false);
    // 返り値は新しいオブジェクト
    expect(result[0]).not.toBe(original);
    expect(result[0].isPathwayFacility).toBe(true);
  });
});
