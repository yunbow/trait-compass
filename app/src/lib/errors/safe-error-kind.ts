/**
 * console.error 等の運用ログへ渡してよい、例外の「種別」だけを返す(NFR-36の考え方の延長)。
 * Error インスタンスなら name(例: "TypeError")、それ以外は typeof の結果を返す。
 * message・stack は D1 等の内部詳細(バインドしたクエリ値を含み得る)を含む可能性があるため
 * 意図的に含めない(セキュリティレビュー指摘: Cloudflare Observability に残る運用ログの
 * 情報漏洩面を最小化する)。
 */
export function safeErrorKind(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
