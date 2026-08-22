import { GhostBackLink } from "@/components/common/GhostBackLink";

/** 共有結果の閲覧時に利用できない機能(相談メモ/相談のヒント/AI要約)向けの案内。 */
export function SharedResultUnavailableNotice() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <GhostBackLink href="/result">結果に戻る</GhostBackLink>
      <p className="text-sm text-foreground">この機能は、共有された結果の閲覧では利用できません。</p>
    </main>
  );
}
