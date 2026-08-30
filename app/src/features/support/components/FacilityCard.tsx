"use client";

import { ExternalLink, Flag, MapPin, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SourceCredit } from "@/components/common/SourceCredit";
import { AuxActionLink } from "@/features/support/components/CardAuxActions";
import { ConfirmationNotice } from "@/features/support/components/ConfirmationNotice";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";
import { getFacilitySubtypeDescription } from "@/features/support/services/facility-subtype-descriptions";
import { buildGoogleMapsSearchHref } from "@/features/support/services/google-maps-link";
import { cn } from "@/lib/utils";

interface FacilityCardProps {
  facility: FacilityDisplayData;
  /** 検索した地域と施設の対象地域が異なる場合、広域窓口であることを明確にする。 */
  selectedMunicipality?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
  onSubtypeClick?: (subtype: string) => void;
  subtypeActive?: boolean;
}

/**
 * 施設カード(FR-024, FR-026, FR-027)。
 * リスク区分に応じて表示内容を切り替える: mode="full"(低リスク)は住所・電話・説明文を
 * 全文表示、mode="summary"(中〜高リスク)はタイトル+要約+外部リンク誘導のみとする。
 * 出典クレジット(SourceCredit)は mode によらず展開操作なしで常時表示する(FR-026, NFR-54)。
 * 施設サブタイプがある場合は、`onSubtypeClick` があれば絞り込み操作に使い、地図ポップアップでは従来どおり識別用バッジとして表示する。
 * 既知の施設サブタイプには、施設名の下に補足説明を表示する。
 *
 * `id="facility-card-{id}"` + `tabIndex={-1}` は地図ピン(MapView)クリック時の
 * スクロール・フォーカス移動先として使う(FR-02A、TICKET-0028)。
 *
 * 「質問する」(TICKET-0048)は、訂正・更新と同じく `/support/ask` 専用ページへ遷移する
 * 方式に統一する。定型質問自体が D1 事実情報/低リスクデータの解説文層のみを根拠とするため、
 * mode="summary" (中〜高リスク)でも住所・電話等の非表示原則には抵触しない。
 *
 * `noDiagnosisOk` バッジ(TICKET-0050)は住所・電話等の事実情報とは異なり相談可否の性質情報
 * のため、「質問する」と同じく mode によらず常に表示する(FR-027 の出し分け対象外)。
 * 文言は窓口側の一般的な受付方針を示す非断定表現に留め、個別ケースでの相談可否を
 * 保証しない旨を明記する(AC-5)。
 *
 * 電話以外の連絡手段(`contactMethods`、TICKET-0051)は電話番号表示の直後に表示する(AC-3)。
 * 住所・電話と同じ「事実情報」の扱いのため mode="full" のみで値を持つ(facility-display.ts
 * 側で summary は null に落とす)。値が無い(null)場合は何も描画しない(AC-4、「連絡手段
 * なし」と誤読させない)。
 *
 * 掲載内容の確認状態(`confirmationStatus`、migration 0034)は noDiagnosisOk バッジと同じく
 * mode によらず常に表示する(`ConfirmationNotice` 共有コンポーネント、外部レビュー指摘対応で
 * 相談メモ(prepare)・AI推薦(recommend)の各画面表示コンポーネントと文言を一元化した)。
 * "confirmationStatus" は「掲載情報そのものが一次情報で確認済みか」を表す性質情報であり、
 * 「施設利用に電話確認が必要」という利用案内ではない(2026-08是正、ConfirmationNotice.tsx
 * 参照)。"phone_required"・"unconfirmed" の場合のみ利用前の注意喚起を表示し、"confirmed"・
 * null(CKAN/オープンデータ由来でこの概念を持たない施設)の場合は何も表示しない(null を
 * 「未確認」と誤解させないため)。
 */
export function FacilityCard({ facility, selectedMunicipality, selectable = false, selected = false, onSelectedChange, onSubtypeClick, subtypeActive = false }: FacilityCardProps) {
  const isOutsideSelectedMunicipality = selectedMunicipality && facility.municipality !== selectedMunicipality;
  const informationLabel = facility.categoryType === "相談窓口" ? "窓口" : "情報";
  const subtypeDescription = getFacilitySubtypeDescription(facility.facilitySubtype);
  const mapHref = buildGoogleMapsSearchHref({ lat: facility.lat, lng: facility.lng, address: facility.address, fallbackQuery: `${facility.municipality}${facility.name}` });
  const showMapButton = facility.categoryType === "相談窓口" || facility.categoryType === "福祉ガイド";
  // 掲載情報の誤り報告(TICKET-0064)。専用ページ(/support/facility-report)に施設IDのみを渡す。
  // 「戻る」の遷移先は SmartBackLink(facility-report/page.tsx)がブラウザ履歴から解決するため、
  // ここで検索結果ページの現在のURL(年齢・区市町村・相談分野タグ等の検索条件を含む)を
  // back クエリへ埋め込む必要は無い(P0対応: 検索条件の二重露出を避ける)。
  const reportHref = `/support/facility-report?facilityId=${encodeURIComponent(facility.id)}`;
  const askHref = `/support/ask?targetType=facility&targetId=${encodeURIComponent(facility.id)}`;

  return (
    <article
      id={`facility-card-${facility.id}`}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {selectable && (
        <label className="flex w-fit items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} className="size-4 rounded border-border" aria-label={`${facility.name}を比較対象に追加`} />
          比較対象に追加
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {facility.facilitySubtype && (
            onSubtypeClick ? (
              <button
                type="button"
                aria-pressed={subtypeActive}
                onClick={() => onSubtypeClick(facility.facilitySubtype!)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  subtypeActive ? "bg-primary/10 font-medium text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {facility.facilitySubtype}
              </button>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {facility.facilitySubtype}
              </span>
            )
          )}
          {facility.matchesTags && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">相談分野に関連</span>}
          {isOutsideSelectedMunicipality && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">広域の窓口</span>}
        </div>
        <span className="text-xs text-muted-foreground">{facility.municipality}</span>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">{facility.name}</h2>
        {subtypeDescription && <p className="text-xs text-muted-foreground">{subtypeDescription}</p>}
        {isOutsideSelectedMunicipality && <p className="text-xs text-muted-foreground">選択地域外の広域{informationLabel}です。</p>}
      </div>

      {facility.categoryType === "相談窓口" && facility.noDiagnosisOk && (
        <p className="w-fit rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          診断がなくても相談できるとされています。個別の相談可否は窓口へご確認ください。
        </p>
      )}

      <ConfirmationNotice confirmationStatus={facility.confirmationStatus} />

      {facility.mode === "full" ? (
        <div className="flex flex-col gap-2 text-sm text-foreground">
          {facility.summary && <p className="line-clamp-3 text-muted-foreground">{facility.summary}</p>}
          <div className="flex flex-col gap-1.5 text-sm">
            {facility.address && <p className="flex items-start gap-1.5 text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{facility.address}</p>}
            {facility.phone && <p className="flex items-center gap-1.5 text-muted-foreground"><Phone aria-hidden="true" className="size-4 shrink-0" />{facility.phone}</p>}
          </div>
          {facility.contactMethods && (
            <details className="text-muted-foreground">
              <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">電話以外の連絡手段</summary>
              <p className="mt-1">{facility.contactMethods}</p>
            </details>
          )}
        </div>
      ) : (
        facility.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{facility.summary}</p>
      )}

      {(facility.phone || facility.url || showMapButton) && (
        <div className="flex flex-col gap-2">
          {facility.phone && (
            <Button render={<a href={`tel:${facility.phone.replace(/[^0-9+]/g, "")}`} />} nativeButton={false} size="lg" className="w-full">
              <Phone aria-hidden="true" />
              電話する
            </Button>
          )}
          {(facility.url || showMapButton) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {facility.url && (
                <Button render={<a href={facility.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant={facility.phone ? "outline" : "default"} size="lg" className="w-full sm:flex-1">
                  <ExternalLink aria-hidden="true" />
                  {facility.mode === "full" ? "詳細を見る" : "公式サイトで確認する"}
                </Button>
              )}
              {showMapButton && (
                <Button render={<a href={mapHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant={(facility.phone || facility.url) ? "outline" : "default"} size="lg" className="w-full sm:flex-1">
                  <MapPin aria-hidden="true" />
                  地図で探す
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <SourceCredit credit={facility.sourceCredit} sourceUrl={facility.sourceUrl} />

      <div className="border-t border-border pt-3">
        <div role="group" aria-label={`${facility.name}の補助操作`} className="grid grid-cols-2 gap-1">
          <AuxActionLink href={reportHref} ariaLabel={`${facility.name}の掲載情報の訂正・更新を報告`} icon={<Flag aria-hidden="true" className="size-3.5" />}>訂正・更新</AuxActionLink>
          <AuxActionLink href={askHref} ariaLabel={`${facility.name}の掲載情報について質問する`} icon={<MessageCircle aria-hidden="true" className="size-3.5" />}>質問する</AuxActionLink>
        </div>
      </div>
    </article>
  );
}
