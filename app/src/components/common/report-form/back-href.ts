const DEFAULT_BACK_HREF = "/support";

/**
 * `searchParams` の値(単一値・配列いずれもありうる Next.js の型)から先頭の値を取り出す。
 * `facility-report/page.tsx`・`content-report/page.tsx` で完全一致していた実装。
 */
export function firstValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * `back` クエリを検証する(オープンリダイレクト対策)。
 * `/` から始まり、かつ `//`(プロトコル相対 URL、例: `//evil.com`)では始まらない場合のみ
 * 同一オリジンの相対パスとみなして採用する。それ以外(絶対URL・プロトコル相対URL・
 * 欠損・空文字)はすべて `/support` にフォールバックする。
 *
 * `facility-report/page.tsx`・`content-report/page.tsx` で完全一致していた実装。もとは
 * 「共有モジュールが無いため」`content-report/page.tsx` 側にローカル複製していたが、
 * Phase 2 「2-10 ReportFormParts」でその前提が変わったため、feature間依存を避けられる
 * この共通モジュール(`src/components/common/report-form/`)へ抽出した。
 */
export function resolveBackHref(raw: string | string[] | undefined, fallback: string = DEFAULT_BACK_HREF): string {
  const value = firstValue(raw);
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
