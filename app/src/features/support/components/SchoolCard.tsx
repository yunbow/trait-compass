"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Flag, MapPin, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuxActionButton, AuxActionLink, AuxActionPanel, SourceList } from "@/features/support/components/CardAuxActions";
import { CONFIRMATION_STATUS_LABELS, DISABILITY_TYPE_LABELS, SCHOOL_LEVEL_LABELS } from "@/features/support/constants/school-labels";
import { dedupeSources } from "@/features/support/services/dedupe-sources";
import { buildGoogleMapsSearchHref } from "@/features/support/services/google-maps-link";
import { cn } from "@/lib/utils";
import type { MunicipalitySurvey, SourceRef } from "../../../../../data/manual/schema/municipality.schema";

export { CONFIRMATION_STATUS_LABELS, DISABILITY_TYPE_LABELS, SCHOOL_LEVEL_LABELS };

/**
 * `sources` は元スキーマ(withSources、必須配列)を除外したうえで、D1由来の任意フィールドとして
 * `id`/`sources` を additive に足し戻す。`id` は D1 `schools.id`(掲載情報の訂正・更新報告
 * (content-report)・AskAiPanel の再取得キーに使う、school-info.ts 参照)で、テストの手組み
 * fixture 等では省略されうるため任意とする。既存の `schoolId(school)`(`${level}:${name}`)による
 * 比較選択・地図フォーカス・DOM id 用の複合キーはこの `id` の追加後も変更しない。
 */
export type School = Omit<MunicipalitySurvey["elementarySchools"][number], "sources"> & {
  id?: string;
  sources?: SourceRef[];
};


export function schoolId(school: School) { return `${school.level}:${school.name}`; }

export function getHubSchoolName(school: School, schools: School[] = []) {
  const resourceRoom = school.resourceRoom;
  if (resourceRoom?.hubSchoolName) return resourceRoom.hubSchoolName;
  const groupName = resourceRoom?.groupName?.split("(")[0];
  return schools.find((candidate) => candidate.resourceRoom?.isHubSchool && candidate.resourceRoom.groupName?.startsWith(groupName ?? ""))?.name ?? "";
}

/** 特別支援教室バッジの表示文言。拠点校名が特定できない場合は「巡回()」という空カッコを避ける。 */
export function formatResourceRoomLabel(school: School, schools: School[] = []) {
  const resourceRoom = school.resourceRoom;
  if (!resourceRoom?.hasResourceRoom) return null;
  if (resourceRoom.isHubSchool) return "拠点校";
  const hubSchoolName = getHubSchoolName(school, schools);
  return hubSchoolName ? `巡回(${hubSchoolName})` : "巡回指導(拠点校不明)";
}

/** SchoolCardの分類バッジ群と同じ値を返す(バッジのクリック絞り込みで「この学校が
 * どのタグを持つか」を判定するために、バッジの描画ロジックと1対1で対応させる)。 */
export function schoolBadgeTags(school: School, schools: School[] = []): string[] {
  const tags = [SCHOOL_LEVEL_LABELS[school.level]];
  const resourceRoom = school.resourceRoom;
  const resourceRoomLabel = formatResourceRoomLabel(school, schools);
  if (resourceRoomLabel) tags.push(resourceRoomLabel);
  if (resourceRoom?.groupName) tags.push(resourceRoom.groupName);
  if (school.fixedClasses.length === 0) {
    tags.push("固定級なし");
  } else {
    for (const fixedClass of school.fixedClasses) {
      tags.push(`${DISABILITY_TYPE_LABELS[fixedClass.disabilityType]}${fixedClass.className ? `・${fixedClass.className}` : ""}・${CONFIRMATION_STATUS_LABELS[fixedClass.status]}`);
    }
  }
  return tags;
}

interface TagBadgeProps { label: string; className: string; onTagClick?: (tag: string) => void; activeTags?: string[]; }

function TagBadge({ label, className, onTagClick, activeTags = [] }: TagBadgeProps) {
  if (!onTagClick) return <span className={className}>{label}</span>;
  const isActive = activeTags.includes(label);
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => onTagClick(label)}
      className={cn(className, "cursor-pointer outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", isActive ? "bg-primary/10 text-primary ring-1 ring-primary/40" : "hover:opacity-80")}
    >
      {label}
    </button>
  );
}

export function FixedClassBadges({ school, onTagClick, activeTags }: { school: School; onTagClick?: (tag: string) => void; activeTags?: string[] }) {
  if (school.fixedClasses.length === 0) return <TagBadge label="固定級なし" className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" onTagClick={onTagClick} activeTags={activeTags} />;
  return <>{school.fixedClasses.map((fixedClass) => <TagBadge key={`${fixedClass.disabilityType}-${fixedClass.className ?? ""}-${fixedClass.status}`} label={`${DISABILITY_TYPE_LABELS[fixedClass.disabilityType]}${fixedClass.className ? `・${fixedClass.className}` : ""}・${CONFIRMATION_STATUS_LABELS[fixedClass.status]}`} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground" onTagClick={onTagClick} activeTags={activeTags} />)}</>;
}

interface SchoolCardProps { school: School; schools: School[]; municipality: string; selectable?: boolean; selected?: boolean; onSelectedChange?: (checked: boolean) => void; showLevel?: boolean; onTagClick?: (tag: string) => void; activeTags?: string[]; }

/**
 * 末尾の補助操作フッター(出典・更新/訂正・更新/質問する)は `FacilityCard.tsx` と同じ
 * パターン。ただし `school.id`(D1 `schools.id`)は手組みのテスト用フィクスチャ等では
 * 省略されうるため、`id` が無い場合は出典・更新のみ(grid-cols-1)を表示し、
 * 訂正・更新・質問する(いずれも id を要する)は表示しない。質問するはインライン展開せず、
 * `/support/ask` 専用ページへ遷移する方式に統一する。
 * 代表出典1件は常時表示し、全出典リストのみ展開式とする。
 */
export function SchoolCard({ school, schools, municipality, selectable = false, selected = false, onSelectedChange, showLevel = true, onTagClick, activeTags }: SchoolCardProps) {
  const resourceRoom = school.resourceRoom;
  const mapHref = buildGoogleMapsSearchHref({ lat: school.lat ?? null, lng: school.lng ?? null, address: school.address ?? null, fallbackQuery: `${municipality}${school.name}` });
  const [expandedAction, setExpandedAction] = useState<"source" | null>(null);
  // 「戻る」の遷移先は SmartBackLink(content-report/page.tsx)がブラウザ履歴から解決するため、
  // ここで検索結果ページの現在のURL(検索条件を含む)を back クエリへ埋め込む必要は無い
  // (P0対応: 検索条件の二重露出を避ける)。
  const reportHref = `/support/content-report?targetType=school&targetId=${encodeURIComponent(school.id ?? "")}`;
  const askHref = `/support/ask?targetType=school&targetId=${encodeURIComponent(school.id ?? "")}`;
  const dedupedSources = dedupeSources([
    ...(school.sources ?? []),
    ...school.fixedClasses.flatMap((fixedClass) => fixedClass.sources ?? []),
  ]);
  const domId = schoolId(school);
  return <article id={`school-card-${schoolId(school)}`} tabIndex={-1} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
    {selectable && <label className="flex w-fit items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} className="size-4 rounded border-border" aria-label={`${school.name}を比較対象に追加`} />比較対象に追加</label>}
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{showLevel && <TagBadge label={SCHOOL_LEVEL_LABELS[school.level]} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" onTagClick={onTagClick} activeTags={activeTags} />}{resourceRoom?.hasResourceRoom && <TagBadge label={formatResourceRoomLabel(school, schools) ?? ""} className={resourceRoom.isHubSchool ? "rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground" : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"} onTagClick={onTagClick} activeTags={activeTags} />}{resourceRoom?.groupName && <TagBadge label={resourceRoom.groupName} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" onTagClick={onTagClick} activeTags={activeTags} />}<FixedClassBadges school={school} onTagClick={onTagClick} activeTags={activeTags} /></div>{school.areaHint && <span className="text-xs text-muted-foreground">{school.areaHint}</span>}</div>
    <div className="flex flex-col gap-1"><h4 className="text-base font-semibold text-foreground">{school.name}</h4>{school.fixedClasses.map((fixedClass) => fixedClass.note && <p key={fixedClass.note} className="text-xs text-muted-foreground">{fixedClass.note}</p>)}{school.districtNote && <p className="text-xs text-muted-foreground">{school.districtNote}</p>}</div>
    <div className="flex flex-col gap-1.5 text-sm">
      {school.address && <p className="flex items-start gap-1.5 text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{school.address}</p>}
      {school.phone && <p className="flex items-center gap-1.5 text-muted-foreground"><Phone aria-hidden="true" className="size-4 shrink-0" />{school.phone}</p>}
    </div>
    <div className="flex flex-col gap-2">
      {school.phone && (
        <Button render={<a href={`tel:${school.phone.replace(/[^0-9+]/g, "")}`} />} nativeButton={false} variant="outline" size="lg" className="w-full">
          <Phone aria-hidden="true" />
          電話する
        </Button>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {school.url && (
          <Button render={<a href={school.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant="outline" size="lg" className="w-full sm:flex-1">
            <ExternalLink aria-hidden="true" />
            詳細を見る
          </Button>
        )}
        <Button render={<a href={mapHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant={(school.phone || school.url) ? "outline" : "default"} size="lg" className="w-full sm:flex-1">
          <MapPin aria-hidden="true" />
          地図で探す
        </Button>
      </div>
    </div>

    {dedupedSources[0] && (
      <p className="text-xs text-muted-foreground">
        出典:{" "}
        {dedupedSources[0].url ? (
          <a href={dedupedSources[0].url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{dedupedSources[0].label}</a>
        ) : (
          dedupedSources[0].label
        )}
        {dedupedSources[0].confirmedOn && `（確認日: ${dedupedSources[0].confirmedOn}）`}
        {dedupedSources.length > 1 && ` ほか${dedupedSources.length - 1}件`}
      </p>
    )}

    <div className="border-t border-border pt-3">
      <div role="group" aria-label={`${school.name}の補助操作`} className={cn("grid gap-1", school.id === undefined ? "grid-cols-1" : "grid-cols-3")}>
        <AuxActionButton expanded={expandedAction === "source"} controlsId={`school-source-${domId}`} onClick={() => setExpandedAction((current) => current === "source" ? null : "source")} icon={<BookOpen aria-hidden="true" className="size-3.5" />}>出典・更新</AuxActionButton>
        {school.id !== undefined && (
          <>
            <AuxActionLink href={reportHref} ariaLabel={`${school.name}の掲載情報の訂正・更新を報告`} icon={<Flag aria-hidden="true" className="size-3.5" />}>訂正・更新</AuxActionLink>
            <AuxActionLink href={askHref} ariaLabel={`${school.name}の掲載情報について質問する`} icon={<MessageCircle aria-hidden="true" className="size-3.5" />}>質問する</AuxActionLink>
          </>
        )}
      </div>

      {expandedAction === "source" && (
        <AuxActionPanel id={`school-source-${domId}`}><SourceList sources={dedupedSources} /></AuxActionPanel>
      )}
    </div>
  </article>;
}
