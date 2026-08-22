import { openDB, type IDBPDatabase } from "idb";

/**
 * QA 専用の行動ログ(TICKET-0030、AI ペルソナ UX テスト用)。
 *
 * NFR-39: `window.__ND_QA_LOGGING__ === true` の場合のみ有効化される。本番ビルドでは
 * このフラグを設定するコードが一切存在しないため常に `undefined` であり、`logQaEvent` は
 * 呼び出されても完全な no-op(バッファへの追加・IndexedDB オープン・タイマー起動のいずれも
 * 行わない)。Playwright のペルソナシナリオ(`e2e/persona/persona-survey.spec.ts`)が
 * `page.addInitScript(() => { window.__ND_QA_LOGGING__ = true })` でフラグを注入した
 * 場合にのみ、IndexedDB(`nd-qa-log` / `events` ストア)へ行動ログを書き込む。
 *
 * NFR-24: IndexedDB への逐次書き込みは低速(100件で16倍差の実測報告)なため、
 * メモリ内バッファに蓄積し、件数閾値・時間間隔・明示的な `flushQaLog()` 呼び出しの
 * いずれかでバッチ書き込みする方式にする(history-store.ts の即時 `put` 方式とは異なる
 * 用途。history-store.ts のコメント内の判断点を参照)。
 *
 * 本番コードへの組み込みは `SurveyRunner` からの薄いフック呼び出しのみとし、
 * ロギングの有効・無効判定ロジック自体はこのモジュールに閉じる(呼び出し側で
 * フラグを勝手に有効化する余地を作らない)。
 */

declare global {
  interface Window {
    /** QA 専用ログの有効化フラグ(NFR-39)。Playwright のペルソナシナリオのみが注入する。 */
    __ND_QA_LOGGING__?: boolean;
  }
}

export const QA_LOG_DB_NAME = "nd-qa-log";
const DB_VERSION = 1;
const STORE_NAME = "events";

/** 記録するイベント種別(TICKET-0030 の要求どおり)。 */
export const QA_LOG_EVENT_TYPES = ["question-shown", "answered", "back", "skip-confirm", "complete"] as const;
export type QaLogEventType = (typeof QA_LOG_EVENT_TYPES)[number];

export interface QaLogEvent {
  /** レコード ID(keyPath)。書き込み順を保証するため単調増加の連番を含む。 */
  id: string;
  type: QaLogEventType;
  /** 対象の設問 ID(ND-#### 形式)。設問に紐付かないイベント(complete 等)では省略。 */
  questionId?: string;
  /** ログ記録開始(このセッションで最初にイベントが発火した時刻)からの経過 ms。 */
  elapsedMs: number;
  /** 記録日時(ISO 8601 文字列)。 */
  timestamp: string;
}

/** バッファがこの件数に達したら即座に flush する。 */
const FLUSH_THRESHOLD = 20;
/** ロギング中は最大この間隔(ms)で定期的に flush する。 */
const FLUSH_INTERVAL_MS = 2000;

let buffer: QaLogEvent[] = [];
let dbPromise: Promise<IDBPDatabase> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionStartedAt: number | null = null;
let sequence = 0;

/** フラグが有効化されているかどうか(SSR・フラグ未注入のいずれでも false)。 */
export function isQaLoggingEnabled(): boolean {
  return typeof window !== "undefined" && window.__ND_QA_LOGGING__ === true;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** `openDB` が(ブロック等で)応答せず永久に保留状態になった場合の見切り時間(ms)。 */
const OPEN_TIMEOUT_MS = 5000;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    const opened = openDB(QA_LOG_DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
      blocked() {
        dbPromise = null;
      },
    });
    dbPromise = new Promise<IDBPDatabase>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("IndexedDB open timed out")), OPEN_TIMEOUT_MS);
      opened.then(
        (db) => {
          clearTimeout(timer);
          resolve(db);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function ensureFlushTimer(): void {
  if (flushTimer || typeof window === "undefined") {
    return;
  }
  flushTimer = setInterval(() => {
    void flushQaLog();
  }, FLUSH_INTERVAL_MS);
}

/**
 * イベントを記録する(SurveyRunner から呼ばれる薄いフック)。
 * フラグが無効な場合は完全な no-op(バッファに積むことすらしない)。
 */
export function logQaEvent(type: QaLogEventType, questionId?: string): void {
  if (!isQaLoggingEnabled()) {
    return;
  }
  if (sessionStartedAt === null) {
    sessionStartedAt = Date.now();
  }
  sequence += 1;
  buffer.push({
    id: `${Date.now()}-${sequence}`,
    type,
    questionId,
    elapsedMs: Date.now() - sessionStartedAt,
    timestamp: new Date().toISOString(),
  });
  ensureFlushTimer();
  if (buffer.length >= FLUSH_THRESHOLD) {
    void flushQaLog();
  }
}

/**
 * バッファの内容を IndexedDB へバッチ書き込みする。フラグが無効・バッファが空・
 * IndexedDB 利用不可のいずれかの場合は何もしない。書き込み失敗時も例外を投げない
 * (QA 専用ログの不具合で本編機能に影響を与えないため)。
 */
export async function flushQaLog(): Promise<void> {
  if (!isQaLoggingEnabled() || buffer.length === 0 || !isIndexedDbAvailable()) {
    return;
  }
  const toWrite = buffer;
  buffer = [];
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await Promise.all([...toWrite.map((event) => tx.store.put(event)), tx.done]);
  } catch {
    // QA 専用ログの書き込み失敗はユーザー体験に影響させないため握りつぶす。
  }
}

/** テスト・レポート集計用: 保存済みの全イベントを取得する。 */
export async function getAllQaLogEvents(): Promise<QaLogEvent[]> {
  if (!isIndexedDbAvailable()) {
    return [];
  }
  try {
    const db = await getDb();
    const all = (await db.getAll(STORE_NAME)) as QaLogEvent[];
    return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

/**
 * テスト専用: 保存済みの全イベントを削除する(ユニットテストの `afterEach` で使う)。
 * `indexedDB.deleteDatabase()` は開いたままの接続がある場合ブロックされ得るため、
 * 代わりに `history-store.ts` の `clearAll()` と同じ「ストアの中身だけ空にする」方式を使う。
 */
export async function __clearAllQaLogEventsForTests(): Promise<void> {
  if (!isIndexedDbAvailable()) {
    return;
  }
  const db = await getDb();
  await db.clear(STORE_NAME);
}

/**
 * テスト専用リセット関数。モジュールスコープの状態(バッファ・DB 接続・タイマー・
 * セッション開始時刻)をテスト間で共有させないため、各テストの `afterEach` で呼び出す。
 */
export function __resetQaLoggerForTests(): void {
  buffer = [];
  dbPromise = null;
  sessionStartedAt = null;
  sequence = 0;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/** テスト専用: 現在のバッファ内容(flush 前)を参照する。 */
export function __getQaLogBufferForTests(): readonly QaLogEvent[] {
  return buffer;
}
