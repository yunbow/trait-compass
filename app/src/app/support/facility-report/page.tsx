import type { Metadata } from "next";

import { FullPageFallback } from "@/components/common/FullPageFallback";
import { SmartBackLinkButton } from "@/components/common/SmartBackLinkButton";
import { firstValue, resolveBackHref } from "@/components/common/report-form/back-href";
import { ReportPageShell } from "@/components/common/report-form/ReportPageShell";
import { FacilityReportForm } from "@/features/facility-report/components/FacilityReportForm";
import type { ReportableFacility } from "@/features/facility-report/schema/facility-report";
import { riskLevelToDisplayMode, truncateForSummary } from "@/features/support/services/facility-display";
import type { FacilityRow } from "@/features/support/services/facility-search";
import { fetchFacilityById } from "@/features/support/services/facility-search";
import { getDb } from "@/lib/db";
import { safeErrorKind } from "@/lib/errors/safe-error-kind";

export const metadata: Metadata = {
  title: "掲載情報の誤りを報告する | Trait Compass",
  robots: { index: false, follow: false },
};

interface FacilityReportPageProps {
  searchParams: Promise<{
    facilityId?: string | string[];
    back?: string | string[];
  }>;
}

/**
 * 掲載情報の誤り報告ページ(`/support/facility-report`、TICKET-0064)。
 *
 * もとは `FacilityCard` から開くダイアログ・プリミティブ(base-ui)ベースのモーダルだったが、
 * このアプリの「選択 → 条件付き入力 → 確認 → 送信 → 完了」という複数ステップフローの慣例
 * (PreparePanel/AiSummarySection/RecommendHintSection と同じく専用ページ+戻るリンク)に
 * 合わせ、専用ページへ変換した。
 *
 * `facilityId` は D1 から直接再取得する(FacilityCard が持つ表示用データをそのまま
 * 引き継がない)。取込元データの再取込によって facility id が古くなる(存在しなくなる)
 * ケースが実際にあるため、`fetchFacilityById` が null を返す場合は「対象が見つからない」旨の
 * 空状態を表示し、フォームは描画しない。
 *
 * リスク区分による住所・電話の出し分け(FR-027、facility-display.ts の `toFacilityDisplayData` と
 * 同じルール)は、検索結果一覧だけでなくこのページでも同様に適用する。このページは
 * `FacilityDisplayData` を経由せず D1 から直接取得するため、ここで改めて mode を判定し
 * summary モードでは住所・電話を null に落とす(別ルートだからといって事実情報の
 * 出し分けルールを緩めない)。
 *
 * `back` クエリ(未指定時は `/support` にフォールバック)は「戻る」の遷移先候補の1つに過ぎない。
 * `SmartBackLink`/`SmartBackLinkButton` はブラウザ履歴があれば `history.back()` を優先し、
 * URL に検索条件を含む値を埋め込む必要が無いようにしている(P0対応。以前は `FacilityCard` が
 * 遷移元(検索結果ページ)の URL(path+query、年齢・区市町村・相談分野タグ等の検索条件を含む)を
 * そのまま `back` に埋め込んでおり、報告ページの URL にも検索条件が二重に残っていた)。
 * `resolveBackHref` によるオープンリダイレクト対策(同一オリジンの相対パスのみ許可)は
 * 引き続き維持する。
 */
export default async function FacilityReportPage({ searchParams }: FacilityReportPageProps) {
  const raw = await searchParams;
  const facilityId = firstValue(raw.facilityId);
  const backHref = resolveBackHref(raw.back);

  let facilityRow: FacilityRow | null = null;
  if (facilityId) {
    try {
      const db = getDb();
      facilityRow = await fetchFacilityById(db, facilityId);
    } catch (error) {
      // セキュリティレビュー指摘: message・stack(D1の内部詳細を含み得る)は運用ログに
      // 渡さず、例外の種別のみに絞る(support/results/page.tsx と同じ方針)。
      console.error("[support/facility-report] 施設情報の取得に失敗しました。", safeErrorKind(error));
      facilityRow = null;
    }
  }

  if (facilityRow === null) {
    return (
      <FullPageFallback
        title="報告対象の相談先が見つかりませんでした。"
        description="掲載データが更新され、対象が変更・削除された可能性があります。"
        action={
          <SmartBackLinkButton fallbackHref={backHref} className="w-full max-w-xs">
            前の画面に戻る
          </SmartBackLinkButton>
        }
      />
    );
  }

  const mode = riskLevelToDisplayMode(facilityRow.riskLevel);
  const facility: ReportableFacility = {
    id: facilityRow.id,
    name: facilityRow.name,
    municipality: facilityRow.municipality,
    phone: mode === "full" ? facilityRow.phone : null,
    address: mode === "full" ? facilityRow.address : null,
    url: facilityRow.url,
    summary:
      facilityRow.description === null
        ? null
        : mode === "full"
          ? facilityRow.description
          : truncateForSummary(facilityRow.description),
  };

  return (
    <ReportPageShell
      backHref={backHref}
      targetHeading={facility.name}
      targetContext={`${facility.municipality} ／ ${facilityRow.categoryType}`}
    >
      <FacilityReportForm facility={facility} backHref={backHref} />
    </ReportPageShell>
  );
}
