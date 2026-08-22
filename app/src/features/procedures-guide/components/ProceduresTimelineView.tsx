import Link from "next/link";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { ExternalReferenceLink } from "@/features/procedures-guide/components/ExternalReferenceLink";
import { PROCEDURE_REFERENCE_LINKS, PROCEDURES_TIMELINE_STAGES } from "@/features/procedures-guide/constants/procedures-timeline";

/**
 * 就学・転居後手続きタイムライン静的ガイドの画面本体(TICKET-0057)。
 *
 * すべて `procedures-timeline.ts` のビルド時に確定した静的データを描画するだけの
 * プレゼンテーション部品(project-structure.md §7)。AI生成・D1動的取得・ユーザー入力に基づく
 * 出し分けは一切行わない(AC-4)。
 *
 * 具体的な暦日(月・週・提出期限)は本リポジトリ内に出典が無いため記載していない(捏造しない)。
 * そのため各手続きの説明文は「自治体窓口で確認してください」という誘導で締めくくられており、
 * 本画面の冒頭にもその方針を明記した注記を常設する。
 */
export function ProceduresTimelineView() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">就学・転居後手続きタイムライン</h1>
        <p className="text-sm text-muted-foreground">
          転校・就学相談や、転居にともなう福祉サービス・手当の手続きについて、一般的な流れをまとめた静的なご案内です。
        </p>
      </div>

      <DisclaimerNotice variant="compact" />

      <p role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
        具体的な期限・必要書類・提出先は自治体や状況によって異なります。このページでは正確な期日を示すことができないため、詳しくは各自治体の窓口でご確認ください。
      </p>

      <div className="flex flex-col gap-6">
        {PROCEDURES_TIMELINE_STAGES.map((stage) => (
          <section key={stage.id} aria-labelledby={`stage-${stage.id}-heading`} className="flex flex-col gap-3">
            <div>
              <h2 id={`stage-${stage.id}-heading`} className="text-base font-semibold text-foreground">
                {stage.label}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{stage.description}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {stage.procedures.map((procedure) => (
                <li key={procedure.name} className="rounded-lg border border-border px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{procedure.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{procedure.note}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="procedures-support-link-heading" className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        <h2 id="procedures-support-link-heading" className="text-sm font-semibold text-foreground">
          自治体の窓口をさがす
        </h2>
        <p className="text-sm text-muted-foreground">
          転居先の自治体ごとの相談窓口は、支援情報検索から確認できます。
        </p>
        <Link href="/support" className="w-fit text-sm underline underline-offset-4 text-foreground">
          相談窓口をさがす
        </Link>
      </section>

      <section aria-labelledby="procedures-reference-heading" className="flex flex-col gap-2">
        <h2 id="procedures-reference-heading" className="text-sm font-semibold text-foreground">
          参考情報
        </h2>
        <ul className="flex flex-col gap-2">
          {PROCEDURE_REFERENCE_LINKS.map((link) => (
            <li key={link.label} className="text-sm">
              <ExternalReferenceLink label={link.label} url={link.url} />
              <p className="text-xs text-muted-foreground">{link.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
