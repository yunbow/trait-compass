import { openDB, type IDBPDatabase } from "idb";

import type { CategoryScores, OverlapCounts, TraitScores } from "@/features/survey/services/scoring";

/**
 * 履歴ストア(TICKET-0025)。結果画面で明示的に保存操作をした場合のみ、
 * カテゴリ・特性スコア・日時を IndexedDB に保存する。
 *
 * - AC-3(FR-055): アクセスには軽量ラッパー `idb` を用いる。
 * - AC-2(FR-051, NFR-32): 保存する情報はカテゴリスコア・特性スコア・gray-zone件数・
 *   重なり件数・日時のみで、回答生値・自由記述・年齢・地域は一切含まない
 *   (`HistoryEntry` にフィールドとして存在しないため、呼び出し側から混入させる
 *   余地が無い。`share-codec.ts` と同じ設計方針)。
 * - AC-6(NFR-32): localStorage(進行状態・設定、settings.ts)とは独立した
 *   IndexedDB ストアとして実装し、データ保存先を分離する。
 *
 * NFR-24 の補足(判断点): NFR-24 が指す「メモリ内バッファ+バッチ flush」は
 * QA 評価ログ(大量・高頻度の逐次書き込み)を想定した要件であり、本チケットが扱う
 * 「結果画面での1件保存」には該当しない。1回の保存操作につき IndexedDB への
 * put は最大1件であり、バッファリングしても速度上の利益が無いばかりか実装が
 * 複雑化しユーザー体感の遅延(保存直後に一覧へ反映されない等)を招くリスクがある
 * ため、`saveResult` は即時 `put` する方式を採用する。将来 QA ログ機能(NFR-39)を
 * 実装する際に、そちらでバッファ+flush 方式を別途導入する。
 */

const DB_NAME = "nd-history";
const DB_VERSION = 1;
const STORE_NAME = "results";

/**
 * 履歴1件分のレコード。`ScoreSurveyResult`(scoring.ts)のうち保存対象の
 * フィールドのみを持つ(回答生値 `answers` はそもそも受け取らない)。
 */
export interface HistoryEntry {
  /** レコード ID(keyPath)。`crypto.randomUUID()` で採番する。 */
  id: string;
  /** 保存日時(ISO 8601 文字列)。 */
  savedAt: string;
  categoryScores: CategoryScores;
  traitScores: TraitScores;
  grayZoneCount: number;
  overlapCounts: OverlapCounts;
}

/** `saveResult` に渡す入力。`id`/`savedAt` は省略可能(省略時は自動採番)。 */
export type HistoryEntryInput = Omit<HistoryEntry, "id" | "savedAt"> & Partial<Pick<HistoryEntry, "id" | "savedAt">>;

function isIndexedDbAvailable(): boolean {
  // SSR(Node.js)・IndexedDB 非対応環境のいずれでも安全に false を返す(NFR-31 と同じ方針)。
  return typeof indexedDB !== "undefined";
}

/** `openDB` が(ブロック等で)応答せず永久に保留状態になった場合の見切り時間(ms)。 */
const OPEN_TIMEOUT_MS = 5000;

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * `openDB` を待つが、`OPEN_TIMEOUT_MS` 以内に解決しない場合はタイムアウト扱いにする。
 * `dbPromise` は失敗時に必ずクリアし、次回呼び出しで再度 `openDB` をやり直せるようにする
 * (失敗した Promise を永久にキャッシュし続けると、以後この端末での保存・一覧取得が
 * ページ再読み込みまで無限に固まったままになるため)。
 */
function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    const opened = openDB(DB_NAME, DB_VERSION, {
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

/**
 * テスト専用リセット関数。`openDB` の結果(接続)をモジュールスコープでキャッシュ
 * しているため、fake-indexeddb を使うテスト間で DB を切り替えられるよう
 * 各テストの `afterEach` で呼び出す。
 */
export function __resetHistoryStoreForTests(): void {
  dbPromise = null;
}

/**
 * 履歴1件を保存する(即時 `put`。上記 NFR-24 の判断点を参照)。
 * SSR・IndexedDB 利用不可・書き込み失敗のいずれの場合も例外を投げず `false` を返す。
 */
export async function saveResult(input: HistoryEntryInput): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    return false;
  }
  try {
    const entry: HistoryEntry = {
      id: input.id ?? crypto.randomUUID(),
      savedAt: input.savedAt ?? new Date().toISOString(),
      categoryScores: input.categoryScores,
      traitScores: input.traitScores,
      grayZoneCount: input.grayZoneCount,
      overlapCounts: input.overlapCounts,
    };
    const db = await getDb();
    await db.put(STORE_NAME, entry);
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存済みの履歴を日時(`savedAt`)降順で全件返す(AC-5 の前提: 履歴画面(TICKET-0026)の
 * 一覧表示に使う)。SSR・IndexedDB 利用不可・読み込み失敗時は空配列を返す。
 */
export async function listResults(): Promise<HistoryEntry[]> {
  if (!isIndexedDbAvailable()) {
    return [];
  }
  try {
    const db = await getDb();
    const all = (await db.getAll(STORE_NAME)) as HistoryEntry[];
    return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

/**
 * 履歴を1件削除する(AC-5)。SSR・IndexedDB 利用不可・削除失敗時は `false` を返す。
 */
export async function deleteResult(id: string): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    return false;
  }
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * 履歴を全件削除する(AC-5、FR-054 の「全データ削除ボタン」・NFR-37 の実体)。
 * SSR・IndexedDB 利用不可・削除失敗時は `false` を返す。
 */
export async function clearAll(): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    return false;
  }
  try {
    const db = await getDb();
    await db.clear(STORE_NAME);
    return true;
  } catch {
    return false;
  }
}
