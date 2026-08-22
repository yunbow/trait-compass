"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ExternalLink, MapPin, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ComparisonBar } from "@/features/support/components/ComparisonBar";
import { SchoolCard, schoolBadgeTags } from "@/features/support/components/SchoolCard";
import { SchoolCompareView } from "@/features/support/components/SchoolCompareView";
import { SchoolMapSection } from "@/features/support/components/SchoolMapSection";
import { ViewModeToggle } from "@/features/support/components/ViewModeToggle";
import type { ViewMode } from "@/features/support/components/ViewModeToggle";
import { isCurrentLocationEnabled } from "@/features/history/services/settings";
import { MUNICIPALITY_CENTERS } from "@/features/support/constants/municipality-centers";
import { cn } from "@/lib/utils";
import type { MunicipalitySurvey, SourceRef } from "../../../../../data/manual/schema/municipality.schema";
import type { Municipality } from "@/features/support/constants/municipalities";
import { sortByDistanceFromCenter } from "@/features/support/services/distance";
import type { LatLngLike } from "@/features/support/services/distance";
import { useCurrentLocation } from "@/features/support/hooks/useCurrentLocation";
export { FixedClassBadges, getHubSchoolName, schoolBadgeTags, schoolId } from "@/features/support/components/SchoolCard";
export type { School } from "@/features/support/components/SchoolCard";

type School = Omit<MunicipalitySurvey["elementarySchools"][number], "sources"> & { id?: string; sources?: SourceRef[] };
/** `sources` は D1 `high_school_pathways.sources_json` 由来の任意フィールド(school-info.ts参照)。
 *  この一覧(HighSchoolList)には報告リンクは付けない(D1 id が report-link 用途に十分安定して
 *  いないため、design review によりスコープ外と判断)。 */
type HighSchoolPathway = Omit<MunicipalitySurvey["highSchoolPathways"][number], "sources"> & { sources?: SourceRef[] };
/** `sources` は D1 `class_organizations.sources_json`(nullable)由来の任意フィールド。 */
type ClassOrganization = Omit<MunicipalitySurvey["classOrganization"][number], "sources"> & { sources?: SourceRef[] };
/**
 * D1 `municipality_survey_meta.license_audit_json` 由来の、この自治体の非掲載理由(4種別)。
 * `auditedOn`/`note`(内部の調査経緯を含み得る)は含まない表示用サブセット。
 */
export type LicenseAuditStatus = Pick<
  MunicipalitySurvey["licenseAudit"],
  "schoolClassData" | "consultationWindowData" | "zoningData" | "highSchoolData"
>;
type SortOrder = "default" | "distance";

export interface SchoolInfoSectionProps {
  municipality: Municipality;
  schools: { elementary: School[]; juniorHigh: School[] };
  highSchoolPathways: HighSchoolPathway[];
  classOrganizations: ClassOrganization[];
  limitations: string[];
  surveyDate: string | null;
  licenseAudit?: LicenseAuditStatus | null;
  /**
   * 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts、2026-08是正)。
   * `municipality_survey_meta` 行が無い(調査対象外の自治体)場合は `null`。
   * 型定義のみで本体の描画には使わない(バナー表示は上位の `FacilityResultsView` /
   * `LicenseAuditNotice` が担う)。
   */
  expiration?: { expiresAt: string | null; isExpired: boolean } | null;
  viewMode?: ViewMode;
  onViewModeChange?: (value: ViewMode) => void;
}

const PATHWAY_TYPE_LABELS: Record<string, string> = { challenge_school: "チャレンジスクール", encourage_school: "エンカレッジスクール", correspondence_support_school: "通信制サポート校(参考・民間)" };
const CLASS_ORGANIZATION_JUDGEMENT_LABELS: Record<string, string> = { separate: "A(別学級)", combined: "B(合同)", mixed: "A・B混在", unconfirmed: "C(未確認)", not_applicable: "D(該当校なし)" };

/**
 * 学校情報タブ内のサブタブ区分。小学校・中学校は`School[]`一覧、高校は`highSchoolPathways`、
 * 制度・データは`classOrganizations`(学級編制の判定)+`limitations`(データの限界)を表示する
 * (学校一覧ではなく制度・前提情報のため、他3タブと性質が異なる)。
 * 結果画面の上位タブ(?tab=)とは異なりURLには同期させず、ViewModeToggleと同じくコンポーネント内
 * ローカル状態として管理する。
 */
type SchoolSubTab = "elementary" | "junior_high" | "high_school" | "policy_data";
const SCHOOL_SUB_TAB_ORDER: readonly SchoolSubTab[] = ["elementary", "junior_high", "high_school", "policy_data"];
const SCHOOL_SUB_TAB_LABELS: Record<SchoolSubTab, string> = { elementary: "小学校", junior_high: "中学校", high_school: "高校", policy_data: "制度・データ" };

export function SchoolInfoSection({ municipality, schools, highSchoolPathways, classOrganizations, limitations, viewMode = "list", onViewModeChange = () => {} }: SchoolInfoSectionProps) {
  const subTabCounts: Record<SchoolSubTab, number> = useMemo(
    () => ({ elementary: schools.elementary.length, junior_high: schools.juniorHigh.length, high_school: highSchoolPathways.length, policy_data: classOrganizations.length + limitations.length }),
    [schools.elementary.length, schools.juniorHigh.length, highSchoolPathways.length, classOrganizations.length, limitations.length],
  );
  // 0件のサブタブはタブ自体を表示しない。ただし4区分すべてが0件の場合は「何も無い」画面を
  // 避けるため、全タブを表示にフォールバックする(既定の小学校タブに空状態の案内文が出る)。
  const visibleSubTabs = useMemo(() => SCHOOL_SUB_TAB_ORDER.filter((tab) => subTabCounts[tab] > 0), [subTabCounts]);
  const renderedSubTabs = visibleSubTabs.length > 0 ? visibleSubTabs : SCHOOL_SUB_TAB_ORDER;
  const [subTabState, setSubTabState] = useState<SchoolSubTab>(() => renderedSubTabs[0]);
  // データの入れ替わりで現在のタブが非表示になった場合、レンダー中に表示中の最初のタブへ
  // 補正する(effect+setStateによる二重レンダーを避け、Reactの「レンダー中に状態を調整する」
  // パターンに従う。存在しないタブが選択されたままになることを防ぐ)。
  const subTab = renderedSubTabs.includes(subTabState) ? subTabState : renderedSubTabs[0];
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const { state: locationState, request } = useCurrentLocation();
  const listViewRef = useRef<HTMLDivElement>(null);
  const shouldFocusListRef = useRef(false);
  const allSchools = useMemo(() => [...schools.elementary, ...schools.juniorHigh], [schools]);
  const levelSchools = useMemo(() => { if (subTab === "elementary") return schools.elementary; if (subTab === "junior_high") return schools.juniorHigh; return []; }, [subTab, schools]);
  const mappableSchoolCount = useMemo(() => levelSchools.filter((school) => school.lat !== null && school.lat !== undefined && school.lng !== null && school.lng !== undefined).length, [levelSchools]);
  const hasMappableSchools = mappableSchoolCount > 0;
  const selectedSchools = useMemo(() => selectedIds.map((id) => allSchools.find((school) => `${school.level}:${school.name}` === id)).filter((school): school is School => school !== undefined), [allSchools, selectedIds]);
  const useLive = isCurrentLocationEnabled() && locationState.status === "granted";
  const sortCenter: LatLngLike = useLive ? locationState.coords : MUNICIPALITY_CENTERS[municipality];
  const sortedSchools = useMemo(() => {
    if (sortOrder !== "distance") return levelSchools;
    const wrapped = levelSchools.map((school) => ({ school, lat: school.lat ?? null, lng: school.lng ?? null }));
    return sortByDistanceFromCenter(wrapped, sortCenter).map((entry) => entry.school);
  }, [levelSchools, sortOrder, sortCenter]);
  const visibleSchools = useMemo(() => activeTags.length === 0 ? sortedSchools : sortedSchools.filter((school) => schoolBadgeTags(school, allSchools).some((tag) => activeTags.includes(tag))), [sortedSchools, activeTags, allSchools]);
  useEffect(() => { if (!isComparing && shouldFocusListRef.current) { shouldFocusListRef.current = false; listViewRef.current?.focus(); } }, [isComparing]);
  useEffect(() => {
    if (!isCurrentLocationEnabled()) return;
    if (sortOrder === "distance" || (hasMappableSchools && viewMode !== "list")) request();
  }, [sortOrder, viewMode, hasMappableSchools, request]);
  const toggleSelection = (id: string, checked: boolean) => setSelectedIds((current) => checked ? [...current, id] : current.filter((selected) => selected !== id));
  const toggleTag = (tag: string) => setActiveTags((current) => current.includes(tag) ? current.filter((activeTag) => activeTag !== tag) : [...current, tag]);
  const clearTags = () => setActiveTags([]);
  const backToList = () => { shouldFocusListRef.current = true; setIsComparing(false); };
  // サブタブ切替時は、選択状態(比較モード)を引き継がない(異なる学校段階をまたいだ選択は
  // 意味を持たないため)。分類フィルタ〔activeTags〕も段階(小学校/中学校)ごとにタグ構成が
  // 異なるため、切替時にリセットする。並び順〔sortOrder〕は段階を問わず有効な条件なので維持する。
  const setSubTab = (tab: SchoolSubTab) => { setSubTabState(tab); setSelectedIds([]); setIsSelectionMode(false); setIsComparing(false); setActiveTags([]); };
  if (isComparing) return <section aria-labelledby="school-info-heading" className="flex flex-col gap-6"><SchoolCompareView schools={selectedSchools} allSchools={allSchools} municipality={municipality} onBack={backToList} /></section>;
  const list = () => <div className="flex flex-col gap-5">{visibleSchools.length === 0 ? <SchoolEmptyState onClear={clearTags} /> : <SchoolList schools={visibleSchools} allSchools={allSchools} municipality={municipality} selectable={isSelectionMode} selectedIds={selectedIds} onSelectedChange={toggleSelection} onTagClick={toggleTag} activeTags={activeTags} />}{isSelectionMode && <ComparisonBar count={selectedSchools.length} onCompare={() => setIsComparing(true)} onClear={() => setSelectedIds([])} />}</div>;
  const map = (layout: "sidebar" | "full", popupVariant: "compact" | "full") => <SchoolMapSection municipality={municipality} schools={visibleSchools} layout={layout} popupVariant={popupVariant} />;
  return (
    <section aria-labelledby="school-info-heading" className="flex flex-col gap-6">
      <h2 id="school-info-heading" className="text-base font-semibold text-foreground">学校情報({municipality})</h2>
      <SchoolSubTabBar tabs={renderedSubTabs} activeTab={subTab} onChange={setSubTab} counts={subTabCounts} />
      <div id={`school-subtab-panel-${subTab}`} role="tabpanel" aria-labelledby={`school-subtab-${subTab}`} tabIndex={0} className="flex flex-col gap-6 outline-none">
        {(subTab === "elementary" || subTab === "junior_high") && (
          levelSchools.length === 0
            ? <SchoolSubTabEmptyState message={`${SCHOOL_SUB_TAB_LABELS[subTab]}の情報は登録されていません。`} />
            : <div ref={listViewRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
                <SchoolSortFilter sortOrder={sortOrder} setSortOrder={setSortOrder} live={useLive} isSelectionMode={isSelectionMode} onStartComparison={() => setIsSelectionMode(true)} hasMappableSchools={hasMappableSchools} viewMode={viewMode} onViewModeChange={onViewModeChange} activeTags={activeTags} onToggleTag={toggleTag} onClearTags={clearTags} />
                {(!hasMappableSchools || viewMode === "list") && list()}
                {hasMappableSchools && viewMode === "list-map" && <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6"><div className="order-2 lg:order-1">{list()}</div><div className="order-1 lg:order-2 lg:sticky lg:top-6">{map("sidebar", "compact")}</div></div>}
                {hasMappableSchools && viewMode === "map" && map("full", "full")}
              </div>
        )}
        {subTab === "high_school" && (
          highSchoolPathways.length > 0 ? <HighSchoolList pathways={highSchoolPathways} /> : <SchoolSubTabEmptyState message="高校進学に関する情報は登録されていません。" />
        )}
        {subTab === "policy_data" && (
          (classOrganizations.length > 0 || limitations.length > 0)
            ? <>{classOrganizations.length > 0 && <ClassOrganizationSection classOrganizations={classOrganizations} />}{limitations.length > 0 && <LimitationsSection limitations={limitations} />}</>
            : <SchoolSubTabEmptyState message="登録されている制度・データはありません。" />
        )}
      </div>
    </section>
  );
}

/**
 * 学校情報タブ内のサブタブ切替UI(ARIA tablist)。結果分類の上位タブ(CategoryTabs.tsx)と
 * 見た目を揃えつつ、URL遷移を伴わないクライアント側のみの切替のためbutton+role="tab"で実装する
 * (ViewModeToggleのroving tabindex方式を踏襲)。
 */
function SchoolSubTabBar({ tabs, activeTab, onChange, counts }: { tabs: readonly SchoolSubTab[]; activeTab: SchoolSubTab; onChange: (tab: SchoolSubTab) => void; counts: Record<SchoolSubTab, number> }) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const next = (index + direction + tabs.length) % tabs.length;
    const nextTab = tabs[next];
    onChange(nextTab);
    document.getElementById(`school-subtab-${nextTab}`)?.focus();
  }
  return (
    <div role="tablist" aria-label="学校情報の種類" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {tabs.map((tab, index) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            id={`school-subtab-${tab}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`school-subtab-panel-${tab}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-11 items-center justify-between gap-1 rounded-lg border px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive ? "border-primary bg-white text-primary shadow-sm dark:bg-card" : "border-border bg-white text-foreground shadow-sm hover:bg-muted dark:bg-card",
            )}
          >
            <span>{SCHOOL_SUB_TAB_LABELS[tab]}</span>
            {tab !== "policy_data" && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs", isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {counts[tab]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SchoolSubTabEmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">{message}</div>;
}

function SchoolList({ schools, allSchools, municipality, selectable, selectedIds, onSelectedChange, onTagClick, activeTags }: { schools: School[]; allSchools: School[]; municipality: Municipality; selectable: boolean; selectedIds: string[]; onSelectedChange: (id: string, checked: boolean) => void; onTagClick: (tag: string) => void; activeTags: string[] }) { return <ul className="flex flex-col gap-4">{schools.map((school) => { const id = `${school.level}:${school.name}`; return <li key={id}><SchoolCard school={school} schools={allSchools} municipality={municipality} selectable={selectable} selected={selectedIds.includes(id)} onSelectedChange={(checked) => onSelectedChange(id, checked)} onTagClick={onTagClick} activeTags={activeTags} /></li>; })}</ul>; }
function SchoolEmptyState({ onClear }: { onClear: () => void }) { return <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm"><p className="font-medium text-foreground">この条件に一致する学校は見つかりませんでした。</p><Button type="button" variant="outline" size="sm" className="self-start" onClick={onClear}>フィルタを解除する</Button></div>; }
function SchoolSortFilter({ sortOrder, setSortOrder, live, isSelectionMode, onStartComparison, hasMappableSchools, viewMode, onViewModeChange, activeTags, onToggleTag, onClearTags }: { sortOrder: SortOrder; setSortOrder: (value: SortOrder) => void; live: boolean; isSelectionMode: boolean; onStartComparison: () => void; hasMappableSchools: boolean; viewMode: ViewMode; onViewModeChange: (value: ViewMode) => void; activeTags: string[]; onToggleTag: (tag: string) => void; onClearTags: () => void }) { return <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/40 p-3 text-sm"><label className="flex items-center gap-2"><span className="text-muted-foreground">並び替え</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="rounded-md border border-border bg-card px-2 py-1 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><option value="default">標準</option><option value="distance">{live ? "近い順(現在地)" : "近い順"}</option></select></label>{!isSelectionMode && <Button type="button" variant="ghost" size="sm" onClick={onStartComparison}>比較する</Button>}{hasMappableSchools && <div className="ml-auto"><ViewModeToggle value={viewMode} onChange={onViewModeChange} /></div>}{activeTags.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">分類で絞り込み中</span>{activeTags.map((tag) => <button key={tag} type="button" aria-label={`${tag}の絞り込みを解除`} onClick={() => onToggleTag(tag)} className="cursor-pointer rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50">{tag}</button>)}<Button type="button" variant="ghost" size="sm" onClick={onClearTags}>すべて解除</Button></div>}</div>; }
/**
 * 出典・更新情報の折りたたみ表示。`HighSchoolList` の各カードに添える(D1 id が
 * report-link 用途に十分安定していないため、報告リンク・AskAiPanel は付けないスコープ外の
 * 軽量な表示のみ)。
 */
function SourceDetails({ sources }: { sources?: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <details className="text-muted-foreground">
      <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">出典・更新情報</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {sources.map((source, index) => (
          <li key={`${source.label}-${index}`} className="text-xs text-muted-foreground">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.label}</a>
            ) : (
              source.label
            )}
            {`（確認日: ${source.confirmedOn}）`}
          </li>
        ))}
      </ul>
    </details>
  );
}

function HighSchoolList({ pathways }: { pathways: HighSchoolPathway[] }) {
  return <section aria-label="高校進学" className="flex flex-col gap-3"><div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold text-foreground">高校進学(チャレンジ/エンカレッジ)</h3><span className="text-xs text-muted-foreground">{pathways.length}校</span></div><ul className="flex flex-col gap-4">{pathways.map((pathway) => <li key={pathway.name}><article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">高校</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{PATHWAY_TYPE_LABELS[pathway.pathwayType]}</span>{pathway.commuteRating === "excellent" && pathway.estimatedCommuteMinutes ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">◎ 約{pathway.estimatedCommuteMinutes}分</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">参考枠</span>}</div>{pathway.prefecture && <span className="text-xs text-muted-foreground">{pathway.prefecture}</span>}</div><div className="flex flex-col gap-1"><h4 className="text-base font-semibold text-foreground">{pathway.name}</h4>{pathway.commuteNote && <p className="text-xs text-muted-foreground">{pathway.commuteNote}</p>}{pathway.nearestStation && <p className="text-xs text-muted-foreground">{pathway.nearestStation}</p>}</div><div className="flex flex-col gap-1.5 text-sm">{pathway.address && <p className="flex items-start gap-1.5 text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{pathway.address}</p>}{pathway.phone && <p className="flex items-center gap-1.5 text-muted-foreground"><Phone aria-hidden="true" className="size-4 shrink-0" />{pathway.phone}</p>}</div><div className="flex flex-col gap-2">{pathway.phone && (<Button render={<a href={`tel:${pathway.phone.replace(/[^0-9+]/g, "")}`} />} nativeButton={false} variant="outline" size="lg" className="w-full"><Phone aria-hidden="true" />電話する</Button>)}<div className="flex flex-col gap-2 sm:flex-row">{pathway.url && (<Button render={<a href={pathway.url} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant="outline" size="lg" className="w-full sm:flex-1"><ExternalLink aria-hidden="true" />詳細を見る</Button>)}<Button render={<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pathway.address ?? pathway.name)}`} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant={(pathway.phone || pathway.url) ? "outline" : "default"} size="lg" className="w-full sm:flex-1"><MapPin aria-hidden="true" />地図で探す</Button></div></div><SourceDetails sources={pathway.sources} /></article></li>)}</ul></section>;
}
/** `class_organizations.sources` を、コンパクトな判断ボックスに合わせてインラインのテキスト1行として表示する(トグル無し)。 */
function ClassOrganizationSourceLine({ sources }: { sources?: SourceRef[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      出典:{" "}
      {sources.map((source, index) => (
        <span key={`${source.label}-${index}`}>
          {index > 0 && "、"}
          {source.url ? (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.label}</a>
          ) : (
            source.label
          )}
          {`（確認日: ${source.confirmedOn}）`}
        </span>
      ))}
    </p>
  );
}
function ClassOrganizationSection({ classOrganizations }: { classOrganizations: ClassOrganization[] }) { return <section aria-labelledby="class-organization-heading" className="flex flex-col gap-3"><h3 id="class-organization-heading" className="text-base font-semibold text-foreground">学級編制の判定</h3><div className="flex flex-col gap-2">{classOrganizations.map((organization) => <div key={organization.level} className="rounded-lg border border-border bg-background p-4 text-sm"><p className="font-medium text-foreground">{organization.level === "elementary" ? "小学校" : "中学校"}: {CLASS_ORGANIZATION_JUDGEMENT_LABELS[organization.judgement]}</p><p className="mt-1 text-muted-foreground">{organization.rationale}</p><ClassOrganizationSourceLine sources={organization.sources} /></div>)}</div></section>; }
function LimitationsSection({ limitations }: { limitations: string[] }) { return <section aria-labelledby="school-info-limitations-heading" className="rounded-lg border border-border bg-muted/50 p-4 text-sm"><h3 id="school-info-limitations-heading" className="font-semibold text-foreground">データの限界</h3><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>; }
