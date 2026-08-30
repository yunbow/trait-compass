"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { SourceCredit } from "@/components/common/SourceCredit";
import { FULLSCREEN_OVERLAY_CLASSNAME, FullscreenToggleButton } from "@/features/support/components/FullscreenToggleButton";
import { useFullscreen } from "@/features/support/hooks/use-fullscreen";
import { formatConfirmedOnDate, type FacilityDisplayData } from "@/features/support/services/facility-display";
import { cn } from "@/lib/utils";

export function FacilityCompareView({ facilities, onBack }: { facilities: FacilityDisplayData[]; onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const { fullscreen, toggle } = useFullscreen();
  const value = (text: string | null) => text ?? "—";

  return (
    <section
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? "施設の比較" : undefined}
      className={cn("flex flex-col gap-4", fullscreen && FULLSCREEN_OVERLAY_CLASSNAME)}
    >
      <Button type="button" variant="outline" className="self-start" onClick={onBack}>一覧に戻る</Button>
      <div className="flex items-center justify-between gap-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">施設の比較</h2>
        <FullscreenToggleButton fullscreen={fullscreen} onToggle={toggle} expandLabel="比較表を拡大" />
      </div>
      <div className={cn("overflow-auto", fullscreen && "min-h-0 flex-1")}>
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr><th scope="col" className="min-w-32 border border-border bg-muted p-3">項目</th>{facilities.map((facility) => <th key={facility.id} scope="col" className="min-w-[220px] border border-border p-3"><div>{facility.name}</div><span className="font-normal text-muted-foreground">{facility.municipality}</span></th>)}</tr></thead>
          <tbody>
            <CompareRow label="診断なし相談可" facilities={facilities} render={(facility) => facility.noDiagnosisOk ? "相談できるとされています" : "—"} />
            <CompareRow label="情報の確認状態" facilities={facilities} render={(facility) => formatConfirmationStatus(facility)} />
            <CompareRow label="住所" facilities={facilities} render={(facility) => value(facility.address)} />
            <CompareRow label="電話" facilities={facilities} render={(facility) => facility.phone ? <a className="underline underline-offset-2" href={`tel:${facility.phone.replace(/[^0-9+]/g, "")}`}>{facility.phone}</a> : "—"} />
            <CompareRow label="電話以外の連絡手段" facilities={facilities} render={(facility) => value(facility.contactMethods)} />
            <CompareRow label="概要" facilities={facilities} render={(facility) => value(facility.summary)} />
            <CompareRow label="公式サイト" facilities={facilities} render={(facility) => facility.url ? <a href={facility.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">{facility.mode === "full" ? "詳細を見る" : "詳しくは公式サイトで確認する"}</a> : "—"} />
            <CompareRow label="出典" facilities={facilities} render={(facility) => <SourceCredit credit={facility.sourceCredit} sourceUrl={facility.sourceUrl} />} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * 「情報の確認状態」行の表示文言を組み立てる純関数(migration 0034)。noDiagnosisOk と同じく
 * リスク区分(mode)によらない性質情報のため、mode に応じた出し分けは行わない。
 *
 * `confirmationStatus` は「掲載情報そのものが一次情報で確認済みか」を表す性質情報であり、
 * 「施設利用に電話確認が必要」という利用案内ではない(2026-08是正、
 * ConfirmationNotice.tsx・FacilityCard.tsx 参照)。"phone_required" の文言もこの意味に
 * 留め、掲載情報の検証待ちであることを示す。
 */
function formatConfirmationStatus(facility: FacilityDisplayData): string {
  if (facility.confirmationStatus === "confirmed") {
    return facility.confirmedOn ? `確認済み(${formatConfirmedOnDate(facility.confirmedOn)}時点)` : "確認済み";
  }
  if (facility.confirmationStatus === "phone_required") return "電話確認待ち";
  if (facility.confirmationStatus === "unconfirmed") return "未確認";
  return "—";
}

function CompareRow({ label, facilities, render }: { label: string; facilities: FacilityDisplayData[]; render: (facility: FacilityDisplayData) => React.ReactNode }) {
  return <tr><th scope="row" className="border border-border bg-muted p-3 font-medium">{label}</th>{facilities.map((facility) => <td key={facility.id} className="border border-border p-3 align-top">{render(facility)}</td>)}</tr>;
}
