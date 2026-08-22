/** 制御文字(改行・タブを除く)を除去する。DBに保存する自由記述は表示前提ではないが、
 *  将来レビューツールで開く可能性を考慮し、最低限のサニタイズとして適用する。
 *
 *  `facility-report/route.ts` と `content-report/route.ts` の2ルートで完全一致していた実装を
 *  抽出したもの。実装(正規表現)は不変。 */
export function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
