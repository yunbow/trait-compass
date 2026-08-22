import type { Page } from "@playwright/test";

/**
 * QA 専用ログ(IndexedDB `nd-qa-log`、src/lib/qa-log/qa-logger.ts)の中身をブラウザ
 * コンテキストから読み出す共通ヘルパー(TICKET-0030)。
 *
 * アプリ側の実装詳細(idb ラッパー等)に依存させず、テスト側では素の `indexedDB` API を
 * `page.evaluate` 経由で直接叩く。persona-survey.spec.ts(フラグ ON)と
 * qa-log-disabled.spec.ts(フラグ OFF の回帰テスト、NFR-39)の双方から利用する。
 */

const QA_LOG_DB_NAME = "nd-qa-log";
const QA_LOG_STORE_NAME = "events";

export interface QaLogEventRecord {
  id: string;
  type: string;
  questionId?: string;
  elapsedMs: number;
  timestamp: string;
}

/**
 * `nd-qa-log` データベースが(このオリジンに)存在するかどうかを、`indexedDB.databases()`
 * で確認する。フラグ OFF の回帰テスト(NFR-39)で「そもそも DB が作られていない」ことを
 * 確認するために使う。`indexedDB.open()` で存在確認すると、未存在時に空の DB を新規作成する
 * 副作用があるため、あえて `databases()` を使う(Playwright の Chromium では利用可能)。
 */
export async function qaLogDatabaseExists(page: Page): Promise<boolean> {
  return page.evaluate(async (dbName) => {
    if (typeof indexedDB.databases !== "function") {
      return false;
    }
    const databases = await indexedDB.databases();
    return databases.some((db) => db.name === dbName);
  }, QA_LOG_DB_NAME);
}

/**
 * 保存済みの QA ログイベントを全件取得する。DB・オブジェクトストアが存在しない場合は
 * 空配列を返す(この関数自体は `indexedDB.open()` を使うため、未存在時に空の DB が
 * 新規作成される副作用があるが、中身は常に空のまま=結果には影響しない)。
 */
export async function readQaLogEvents(page: Page): Promise<QaLogEventRecord[]> {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<QaLogEventRecord[]>((resolve) => {
        const openRequest = indexedDB.open(dbName);
        openRequest.onerror = () => resolve([]);
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(storeName, "readonly");
          const getAllRequest = tx.objectStore(storeName).getAll();
          getAllRequest.onsuccess = () => {
            db.close();
            resolve(getAllRequest.result as QaLogEventRecord[]);
          };
          getAllRequest.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
    { dbName: QA_LOG_DB_NAME, storeName: QA_LOG_STORE_NAME },
  );
}
