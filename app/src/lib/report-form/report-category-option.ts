/**
 * 掲載情報の訂正・更新報告フォーム共通の「カテゴリ選択肢」の型(値+日本語ラベル)。
 *
 * `content-report/services/report-categories.ts` のジェネリック
 * `ContentReportCategoryOption<T>` を正として抽出したもの。facility-report 側の同型の型も
 * これを参照する。カテゴリの値集合・ラベルデータ自体はここでは統合しない(feature側に残す)。
 */
export interface ReportCategoryOption<T extends string> {
  value: T;
  label: string;
}
