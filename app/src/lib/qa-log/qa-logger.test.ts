import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __clearAllQaLogEventsForTests,
  __getQaLogBufferForTests,
  __resetQaLoggerForTests,
  flushQaLog,
  getAllQaLogEvents,
  isQaLoggingEnabled,
  logQaEvent,
} from "@/lib/qa-log/qa-logger";

afterEach(async () => {
  // フラグを一時的に有効化してでも flush・クリアできるようにする
  // (フラグ off のテストではバッファが空なので flush 自体は no-op)。
  window.__ND_QA_LOGGING__ = true;
  await flushQaLog();
  await __clearAllQaLogEventsForTests();
  __resetQaLoggerForTests();
  delete window.__ND_QA_LOGGING__;
  vi.useRealTimers();
});

beforeEach(() => {
  delete window.__ND_QA_LOGGING__;
});

describe("isQaLoggingEnabled", () => {
  it("window.__ND_QA_LOGGING__ が true でない限り false を返す(NFR-39)", () => {
    expect(isQaLoggingEnabled()).toBe(false);

    window.__ND_QA_LOGGING__ = true;
    expect(isQaLoggingEnabled()).toBe(true);

    // truthy な値でも `=== true` でない限り無効とみなす(誤って文字列 "true" 等が
    // 混入しても発火しないようにするための厳格な等価比較)。
    // @ts-expect-error テストのため意図的に non-boolean を代入する
    window.__ND_QA_LOGGING__ = "true";
    expect(isQaLoggingEnabled()).toBe(false);
  });
});

describe("logQaEvent: フラグ off のときの no-op(NFR-39)", () => {
  it("フラグが未設定の場合、バッファに積まれず IndexedDB にも書き込まれない", async () => {
    logQaEvent("question-shown", "ND-0001");
    logQaEvent("answered", "ND-0001");

    expect(__getQaLogBufferForTests()).toEqual([]);

    await flushQaLog();
    expect(await getAllQaLogEvents()).toEqual([]);
  });

  it("フラグが false の場合も no-op", async () => {
    window.__ND_QA_LOGGING__ = false;
    logQaEvent("complete");

    expect(__getQaLogBufferForTests()).toEqual([]);
    await flushQaLog();
    expect(await getAllQaLogEvents()).toEqual([]);
  });
});

describe("logQaEvent: フラグ on のときの記録・バッファ flush(NFR-24)", () => {
  beforeEach(() => {
    window.__ND_QA_LOGGING__ = true;
  });

  it("記録したイベントはまずメモリバッファに積まれ、IndexedDB にはまだ書かれない", async () => {
    logQaEvent("question-shown", "ND-0001");

    expect(__getQaLogBufferForTests()).toHaveLength(1);
    expect(await getAllQaLogEvents()).toEqual([]);
  });

  it("flushQaLog() を呼ぶとバッファの内容が IndexedDB に書き込まれ、バッファは空になる", async () => {
    logQaEvent("question-shown", "ND-0001");
    logQaEvent("answered", "ND-0001");
    logQaEvent("back");

    await flushQaLog();

    expect(__getQaLogBufferForTests()).toEqual([]);
    const events = await getAllQaLogEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["question-shown", "answered", "back"]);
    expect(events[0].questionId).toBe("ND-0001");
    expect(typeof events[0].elapsedMs).toBe("number");
    expect(() => new Date(events[0].timestamp).toISOString()).not.toThrow();
  });

  it("バッファが閾値(20件)に達すると自動的に flush される", async () => {
    for (let i = 0; i < 20; i++) {
      logQaEvent("answered", `ND-${String(i).padStart(4, "0")}`);
    }
    // 自動 flush は非同期(void flushQaLog())のため、完了を待つ。
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await getAllQaLogEvents()).toHaveLength(20);
  });

  it("複数イベント後の elapsedMs はセッション開始からの経過時間として単調増加する", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-07-04T00:00:00.000Z");
    vi.setSystemTime(base);

    logQaEvent("question-shown", "ND-0001");
    vi.setSystemTime(new Date(base.getTime() + 500));
    logQaEvent("answered", "ND-0001");
    vi.setSystemTime(new Date(base.getTime() + 1200));
    logQaEvent("complete");

    vi.useRealTimers();
    await flushQaLog();

    const events = await getAllQaLogEvents();
    expect(events.map((e) => e.elapsedMs)).toEqual([0, 500, 1200]);
  });
});
