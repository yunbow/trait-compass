import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  __resetHistoryStoreForTests,
  clearAll,
  deleteResult,
  listResults,
  saveResult,
  type HistoryEntryInput,
} from "@/features/history/services/history-store";
import type { CategoryScores, OverlapCounts, TraitScores } from "@/features/survey/services/scoring";

const EMPTY_CATEGORY_SCORES: CategoryScores = {
  communication: 80,
  "social-reading": null,
  "emotion-regulation": null,
  "impulse-memory": null,
  "executive-function": null,
  "kindness-misread": null,
  sensory: null,
  motor: null,
  learning: null,
  "restricted-repetitive": null,
};

const SAMPLE_TRAIT_SCORES: TraitScores = { ASD: 80, ADHD: null, LD: null, DCD: null };
const SAMPLE_OVERLAP_COUNTS: OverlapCounts = {};

function buildInput(overrides: Partial<HistoryEntryInput> = {}): HistoryEntryInput {
  return {
    categoryScores: EMPTY_CATEGORY_SCORES,
    traitScores: SAMPLE_TRAIT_SCORES,
    grayZoneCount: 0,
    overlapCounts: SAMPLE_OVERLAP_COUNTS,
    ...overrides,
  };
}

afterEach(async () => {
  // fake-indexeddb はプロセス内でデータベースを保持し続けるため、テスト間で
  // データが残らないよう明示的に全削除する。接続を開いたまま `deleteDatabase()` を
  // 呼ぶと(実ブラウザ同様)ブロックされて解決しなくなるため、削除ではなく
  // `clearAll()` でレコードのみ空にする方式を取る。
  await clearAll();
  __resetHistoryStoreForTests();
});

describe("saveResult / listResults", () => {
  it("保存した履歴を savedAt 降順で取得できる(AC-5)", async () => {
    const okOld = await saveResult(buildInput({ id: "old", savedAt: "2026-01-01T00:00:00.000Z" }));
    const okNew = await saveResult(buildInput({ id: "new", savedAt: "2026-06-01T00:00:00.000Z" }));
    expect(okOld).toBe(true);
    expect(okNew).toBe(true);

    const results = await listResults();
    expect(results.map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("id/savedAt を省略した場合は自動採番される", async () => {
    const ok = await saveResult(buildInput());
    expect(ok).toBe(true);

    const results = await listResults();
    expect(results).toHaveLength(1);
    expect(typeof results[0].id).toBe("string");
    expect(results[0].id.length).toBeGreaterThan(0);
    expect(() => new Date(results[0].savedAt).toISOString()).not.toThrow();
  });

  it("保存する情報はスコア・件数・日時のみで、回答生値・自由記述に相当するフィールドを含まない(AC-2, NFR-32)", async () => {
    await saveResult(buildInput({ id: "shape-check" }));
    const [entry] = await listResults();

    expect(Object.keys(entry).sort()).toEqual(
      ["categoryScores", "grayZoneCount", "id", "overlapCounts", "savedAt", "traitScores"].sort(),
    );
  });

  it("未保存時は空配列を返す", async () => {
    expect(await listResults()).toEqual([]);
  });
});

describe("deleteResult", () => {
  it("指定した id のみを削除する(AC-5)", async () => {
    await saveResult(buildInput({ id: "keep" }));
    await saveResult(buildInput({ id: "remove" }));

    const ok = await deleteResult("remove");

    expect(ok).toBe(true);
    const results = await listResults();
    expect(results.map((entry) => entry.id)).toEqual(["keep"]);
  });
});

describe("clearAll", () => {
  it("全件削除する(AC-5, FR-054/NFR-37 の全データ削除ボタンの実体)", async () => {
    await saveResult(buildInput({ id: "a" }));
    await saveResult(buildInput({ id: "b" }));

    const ok = await clearAll();

    expect(ok).toBe(true);
    expect(await listResults()).toEqual([]);
  });
});

describe("SSR 安全性(NFR-31 と同じ方針)", () => {
  it("IndexedDB が利用できない環境では例外を投げず false / 空配列を返す", async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error テストのため意図的に undefined にする
    delete globalThis.indexedDB;
    __resetHistoryStoreForTests();

    try {
      expect(await saveResult(buildInput())).toBe(false);
      expect(await listResults()).toEqual([]);
      expect(await deleteResult("anything")).toBe(false);
      expect(await clearAll()).toBe(false);
    } finally {
      globalThis.indexedDB = original;
      __resetHistoryStoreForTests();
    }
  });
});
