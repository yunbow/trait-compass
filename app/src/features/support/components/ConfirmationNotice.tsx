import type { ConfirmationStatus } from "@/features/support/services/facility-search";

/**
 * 掲載内容の確認状態(`confirmationStatus`、migration 0034)に応じた利用前の注意喚起の文言。
 *
 * `confirmationStatus` は「掲載情報そのものが一次情報で確認済みか」を表す性質情報であり
 * (data/manual/schema/municipality.schema.ts の `ConfirmationStatusSchema` コメント
 * 「一次情報で確認済みか、未確認(電話照会等が必要)かを区別する」参照)、「施設の利用に
 * 電話確認が必要」という利用案内ではない(2026-08是正: FacilityCard の旧文言が前者を後者と
 * 混同させる表現になっていた)。"phone_required" は「掲載情報の検証に電話照会等が必要な
 * 状態」を意味するため、本注記でもその意味に留め、施設利用そのものへの案内と読めないようにする。
 *
 * "confirmed"・null(CKAN/オープンデータ由来でこの概念自体を持たない施設)の場合は
 * 注記不要のため null を返す(null を「未確認」と誤解させないため)。
 *
 * FacilityCard・相談メモ(prepare)・AI推薦(recommend)の各画面表示コンポーネントから共通で
 * 使う(文言の一元管理、外部レビュー指摘対応)。
 */
export function getConfirmationNoticeText(confirmationStatus: ConfirmationStatus | null): string | null {
  if (confirmationStatus === "phone_required") {
    return "掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。";
  }
  if (confirmationStatus === "unconfirmed") {
    return "掲載内容は未確認の情報です。利用前に窓口へ直接ご確認ください。";
  }
  return null;
}

/**
 * {@link getConfirmationNoticeText} の文言をバッジ状に表示する共有コンポーネント。
 * noDiagnosisOk バッジと同じく、リスク区分による出し分け(FR-027)の対象外として
 * 常に表示する想定(呼び出し側で mode 分岐しないこと)。
 */
export function ConfirmationNotice({ confirmationStatus }: { confirmationStatus: ConfirmationStatus | null }) {
  const text = getConfirmationNoticeText(confirmationStatus);
  if (!text) return null;

  return (
    <p className="w-fit rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
      {text}
    </p>
  );
}
