import type { ReactNode } from "react";

import { SmartBackLink } from "@/components/common/SmartBackLink";

interface ReportPageShellProps {
  /** ページ見出し。 */
  heading?: string;
  /** 対象サマリーカードのラベル。 */
  targetLabel?: string;
  /** history.back()が使えない場合の戻り先(resolveBackHref済み)。 */
  backHref: string;
  /** 報告対象の名称(施設名・学校名・ルート名など)。 */
  targetHeading: string;
  /** 対象の補足(「台東区 ／ 小学校」など)。 */
  targetContext: string;
  /** 報告フォーム本体。 */
  children: ReactNode;
}

/**
 * 掲載情報の報告ページ(/support/facility-report・/support/content-report)共通の画面枠。
 * 戻る導線・h1・対象サマリーカードが2ページで逐語一致しており、aria-labelledbyと
 * 見出しidの対応も手動で二重管理されていたため集約する。/support/ask でも共用するため、
 * 見出し文言を props で差し替え可能にしている。
 */
export function ReportPageShell({
  heading = "掲載情報の訂正・更新を報告",
  targetLabel = "報告する掲載情報",
  backHref,
  targetHeading,
  targetContext,
  children,
}: ReportPageShellProps) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <SmartBackLink fallbackHref={backHref}>検索結果に戻る</SmartBackLink>
      <h1 className="text-xl font-bold text-foreground">{heading}</h1>
      <section aria-labelledby="report-target-heading" className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <p className="text-xs font-medium text-primary">{targetLabel}</p>
        <h2 id="report-target-heading" className="mt-1 text-base font-semibold text-foreground">{targetHeading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{targetContext}</p>
      </section>
      {children}
    </main>
  );
}
