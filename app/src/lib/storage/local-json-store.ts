import type { z } from "zod";

// クライアント専用モジュール(window.localStorage を前提とする)。
// 同ディレクトリの r2.ts はサーバー専用(S3 互換ストレージ)であり役割が異なる。
//
// localStorage に保存された JSON を zod で検証して読み書きする、SSR安全・例外安全な
// プリミティブ群(NFR-31: 壊れたデータ・localStorage 利用不可の環境でも例外を投げず
// クラッシュしない)。ドメイン固有の後処理(値の変換・保存成功時のイベント発火等)は
// 各 `features/*/services/*.ts` 側に残し、このモジュールは検証済み JSON の読み書きのみに
// 責務を絞る。

/**
 * ブラウザ環境かどうか(SSR 安全のためのガード)。
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * localStorage の JSON 値を zod で検証して読む。
 * SSR / 未保存 / 壊れた JSON / スキーマ不一致 / localStorage 利用不可 の
 * いずれの場合も例外を投げず `null` を返す(NFR-31)。
 */
export function readLocalJson<T>(key: string, schema: z.ZodType<T>): T | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * JSON として書き込む。SSR / 容量超過 / プライベートブラウジング等では何もしない。
 * 実際に書き込めたかどうかを返す(書き込み成功時のみ副作用を起こしたい呼び出し側のため)。
 */
export function writeLocalJson(key: string, value: unknown): boolean {
  if (!isBrowser()) {
    return false;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // プライベートブラウジング等で保存できない場合も安全側にフォールバックする(NFR-31)。
    return false;
  }
}

/** 削除する。SSR / 例外時も何もせず、失敗しても例外を投げない。 */
export function removeLocalItem(key: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // プライベートブラウジング等で削除できない場合も安全側にフォールバックする(NFR-31)。
  }
}
