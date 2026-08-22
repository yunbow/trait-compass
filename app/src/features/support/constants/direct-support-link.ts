/**
 * セルフチェックを経由せず `/support`(相談分野タグ無し=全件マッチ)へ直接遷移するための
 * リンク先(TICKET-0038 AC-1)。
 *
 * タグ無しアクセスは `/support` 側でも「全般」扱いとして解釈される(既存の
 * parseSupportTagsParam・FacilityResultsView の `tags` 空配列時の挙動と対応)ため、
 * ここでは意図的にクエリパラメータを付けない。
 *
 * トップ画面の独立副導線(`DirectSupportLink`, TICKET-0038)と、アンケート開始前の
 * 保護者向け注記内リンク(TICKET-0040)の双方から同じ遷移先を参照する単一の定数として、
 * ハードコードの二重定義を避ける。
 */
export const SUPPORT_DIRECT_HREF = "/support";
