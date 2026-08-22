"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ComparisonBar } from "@/features/support/components/ComparisonBar";
import { FacilityCard } from "@/features/support/components/FacilityCard";
import { FacilityCompareView } from "@/features/support/components/FacilityCompareView";
import { FacilityMapSection } from "@/features/support/components/FacilityMapSection";
import { ViewModeToggle } from "@/features/support/components/ViewModeToggle";
import type { ViewMode } from "@/features/support/components/ViewModeToggle";
import { isCurrentLocationEnabled } from "@/features/history/services/settings";
import { MUNICIPALITY_CENTERS } from "@/features/support/constants/municipality-centers";
import type { Municipality } from "@/features/support/constants/municipalities";
import { sortByDistanceFromCenter } from "@/features/support/services/distance";
import type { LatLngLike } from "@/features/support/services/distance";
import { useCurrentLocation } from "@/features/support/hooks/useCurrentLocation";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";
import { parseFacilitySubtypesParam } from "@/features/support/services/parse-facility-subtypes";

type SortOrder = "default" | "distance";
const INITIAL_RELATED_COUNT = 8;
const INITIAL_GENERAL_COUNT = 5;

interface FacilityListSectionProps {
  /** 現在のタブに表示中の施設一覧(1件以上であることを呼び出し元が保証する)。 */
  facilities: FacilityDisplayData[];
  municipality: Municipality;
  /** 相談分野に一致する施設が無いときの見出し・説明文に使う、現在のタブのカテゴリ名。 */
  categoryLabel?: string;
  /** 一覧/地図の表示モード。切り替えUI(ViewModeToggle)自体は絞り込みカードの下段に
   * 表示するが、状態自体は呼び出し元(FacilityResultsView)が保持するため、本コンポーネントは
   * 受け取った値と変更ハンドラをそのまま使うだけにする(省略時は一覧のみ)。 */
  viewMode?: ViewMode;
  onViewModeChange?: (value: ViewMode) => void;
}

/**
 * 施設一覧の並び替え・簡易フィルタ(検索条件自体は変えず、表示側のみで絞り込む。D1への
 * 再検索は発生しない)と、PC幅(lg)での地図/一覧2カラムレイアウトを担当する。
 */
export function FacilityListSection({ facilities, municipality, categoryLabel = "相談窓口", viewMode = "list", onViewModeChange = () => {} }: FacilityListSectionProps) {
  const isConsultationCategory = categoryLabel === "相談窓口";
  const searchParams = useSearchParams();
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");
  const [noDiagnosisOnly, setNoDiagnosisOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [showAllRelated, setShowAllRelated] = useState(false);
  const [showAllGeneral, setShowAllGeneral] = useState(false);
  const { state: locationState, request } = useCurrentLocation();
  const listViewRef = useRef<HTMLDivElement>(null);
  const shouldFocusListRef = useRef(false);
  const rawSubtypes = parseFacilitySubtypesParam(searchParams.get("subtype") ?? undefined);
  const availableSubtypes = useMemo(() => {
    const subtypes = new Set<string>();
    for (const facility of facilities) {
      if (facility.facilitySubtype !== null) subtypes.add(facility.facilitySubtype);
    }
    return [...subtypes];
  }, [facilities]);
  const activeSubtypes = rawSubtypes.filter((subtype) => availableSubtypes.includes(subtype));
  // 支援制度等、そもそも住所を持たない分類では地図に描画するピンが存在しないため、
  // 切り替えタブ自体を出さず一覧のみ表示する。
  const hasMappableFacilities = useMemo(() => facilities.some((facility) => facility.lat !== null && facility.lng !== null), [facilities]);

  useEffect(() => {
    if (!isComparing && shouldFocusListRef.current) {
      shouldFocusListRef.current = false;
      listViewRef.current?.focus();
    }
  }, [isComparing]);

  useEffect(() => {
    if (!isCurrentLocationEnabled()) return;
    if (sortOrder === "distance" || (hasMappableFacilities && viewMode !== "list")) {
      request();
    }
  }, [sortOrder, viewMode, hasMappableFacilities, request]);

  const useLive = isCurrentLocationEnabled() && locationState.status === "granted";
  const currentLocation: LatLngLike | null = useLive ? locationState.coords : null;
  const sortCenter = useLive ? locationState.coords : MUNICIPALITY_CENTERS[municipality];

  const visibleFacilities = useMemo(() => {
    const filtered = facilities.filter((facility) =>
      (!noDiagnosisOnly || facility.noDiagnosisOk)
      && (activeSubtypes.length === 0 || (facility.facilitySubtype !== null && activeSubtypes.includes(facility.facilitySubtype))),
    );
    return sortOrder === "distance" ? sortByDistanceFromCenter(filtered, sortCenter) : filtered;
  }, [activeSubtypes, facilities, noDiagnosisOnly, sortCenter, sortOrder]);
  const visibleSelectedIds = useMemo(() => selectedIds.filter((id) => visibleFacilities.some((facility) => facility.id === id)), [selectedIds, visibleFacilities]);
  const comparisonFacilities = useMemo(() => visibleSelectedIds.map((id) => visibleFacilities.find((facility) => facility.id === id)).filter((facility): facility is FacilityDisplayData => facility !== undefined), [visibleFacilities, visibleSelectedIds]);
  const toggleSelection = (id: string, checked: boolean) => setSelectedIds((current) => checked ? [...current, id] : current.filter((selectedId) => selectedId !== id));
  const setComparisonMode = (enabled: boolean) => {
    setIsSelectionMode(enabled);
    if (!enabled) setSelectedIds([]);
  };

  const backToList = () => {
    shouldFocusListRef.current = true;
    setIsComparing(false);
  };

  const setSubtypesInUrl = (subtypes: string[]) => {
    const nextSearchParams = new URLSearchParams(window.location.search);
    if (subtypes.length > 0) {
      nextSearchParams.set("subtype", subtypes.join(","));
    } else {
      nextSearchParams.delete("subtype");
    }
    const query = nextSearchParams.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const toggleSubtype = (subtype: string) => {
    setSubtypesInUrl(activeSubtypes.includes(subtype)
      ? activeSubtypes.filter((activeSubtype) => activeSubtype !== subtype)
      : [...activeSubtypes, subtype]);
  };

  const clearSubtypes = () => setSubtypesInUrl([]);

  if (isComparing) return <FacilityCompareView facilities={comparisonFacilities} onBack={backToList} />;

  const list = () => {
    // 想定ルート(supportPathway)のステップに登場する窓口(isPathwayFacility)は、相談分野
    // タグの一致有無に関わらず「まず相談する候補」に含める(想定ルートで案内した窓口を
    // 見つけやすくするため)。表示順序はサーバー側(applyPathwayPriority)が既に想定ルートの
    // ステップ順を先頭に並べ替え済みのため、ここでは単純にフィルタするだけでよい。
    const relatedFacilities = visibleFacilities.filter((facility) => facility.matchesTags || facility.isPathwayFacility);
    const generalFacilities = visibleFacilities.filter((facility) => !facility.matchesTags && !facility.isPathwayFacility);
    const visibleRelated = showAllRelated ? relatedFacilities : relatedFacilities.slice(0, INITIAL_RELATED_COUNT);
    const visibleGeneral = showAllGeneral ? generalFacilities : generalFacilities.slice(0, INITIAL_GENERAL_COUNT);

    return (
      <div className="flex flex-col gap-4">
        {visibleFacilities.length === 0 ? <EmptyState onClear={() => { setNoDiagnosisOnly(false); clearSubtypes(); }} /> : (
          <div className="flex flex-col gap-6">
            {relatedFacilities.length > 0 && <FacilityGroup title={isConsultationCategory ? "まず相談する候補" : "まず確認する情報"} description="選んだ相談分野に関連する情報として登録されています。" facilities={visibleRelated} total={relatedFacilities.length} initialLimit={INITIAL_RELATED_COUNT} isExpanded={showAllRelated} onToggle={() => setShowAllRelated((current) => !current)} selectable={isSelectionMode} municipality={municipality} selectedIds={selectedIds} onSelectedChange={toggleSelection} onSubtypeClick={toggleSubtype} activeSubtypes={activeSubtypes} />}
            {generalFacilities.length > 0 && <FacilityGroup title={relatedFacilities.length > 0 ? (isConsultationCategory ? "ほかの相談先" : `ほかの${categoryLabel}`) : categoryLabel} description={relatedFacilities.length > 0 ? (isConsultationCategory ? "相談先に迷うときの地域の窓口です。個別の相談可否は各窓口へご確認ください。" : `地域で利用できる${categoryLabel}です。`) : `お住まいの地域で利用できる${categoryLabel}です。`} facilities={visibleGeneral} total={generalFacilities.length} initialLimit={INITIAL_GENERAL_COUNT} isExpanded={showAllGeneral} onToggle={() => setShowAllGeneral((current) => !current)} selectable={isSelectionMode} municipality={municipality} selectedIds={selectedIds} onSelectedChange={toggleSelection} onSubtypeClick={toggleSubtype} activeSubtypes={activeSubtypes} />}
          </div>
        )}
        {isSelectionMode && <ComparisonBar count={visibleSelectedIds.length} onCompare={() => setIsComparing(true)} onClear={() => setSelectedIds([])} />}
      </div>
    );
  };
  const map = (layout: "sidebar" | "full", popupVariant: "compact" | "full") => <FacilityMapSection municipality={municipality} facilities={visibleFacilities} layout={layout} popupVariant={popupVariant} currentLocation={currentLocation} />;

  return (
    <div ref={listViewRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
      <Filters sortOrder={sortOrder} setSortOrder={setSortOrder} noDiagnosisOnly={noDiagnosisOnly} setNoDiagnosisOnly={setNoDiagnosisOnly} live={useLive} activeSubtypes={activeSubtypes} onToggleSubtype={toggleSubtype} onClearSubtypes={clearSubtypes} isSelectionMode={isSelectionMode} onComparisonModeChange={setComparisonMode} showNoDiagnosisFilter={isConsultationCategory} hasMappableFacilities={hasMappableFacilities} viewMode={viewMode} onViewModeChange={onViewModeChange} visibleCount={visibleFacilities.length} />
      {(!hasMappableFacilities || viewMode === "list") && list()}
      {hasMappableFacilities && viewMode === "list-map" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
          <div className="order-2 lg:order-1">{list()}</div>
          <div className="order-1 lg:order-2 lg:sticky lg:top-6">{map("sidebar", "compact")}</div>
        </div>
      )}
      {hasMappableFacilities && viewMode === "map" && map("full", "full")}
    </div>
  );
}

function FacilityGroup({ title, description, facilities, total, initialLimit, isExpanded, onToggle, selectable, municipality, selectedIds, onSelectedChange, onSubtypeClick, activeSubtypes }: { title: string; description: string; facilities: FacilityDisplayData[]; total: number; initialLimit: number; isExpanded: boolean; onToggle: () => void; selectable: boolean; municipality: Municipality; selectedIds: string[]; onSelectedChange: (id: string, checked: boolean) => void; onSubtypeClick: (subtype: string) => void; activeSubtypes: string[] }) {
  return <section aria-label={title} className="flex flex-col gap-3"><div className="border-b border-border pb-3"><h3 className="text-base font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><ul className="flex flex-col gap-4">{facilities.map((facility) => <li key={facility.id}><FacilityCard facility={facility} selectedMunicipality={municipality} selectable={selectable} selected={selectedIds.includes(facility.id)} onSelectedChange={(checked) => onSelectedChange(facility.id, checked)} onSubtypeClick={onSubtypeClick} subtypeActive={facility.facilitySubtype !== null && activeSubtypes.includes(facility.facilitySubtype)} /></li>)}</ul>{total > initialLimit && <Button type="button" variant="outline" size="lg" className="self-center" onClick={onToggle}>{isExpanded ? "表示を減らす" : `残り${total - facilities.length}件を表示する`}</Button>}</section>;
}

function Filters({ sortOrder, setSortOrder, noDiagnosisOnly, setNoDiagnosisOnly, live, activeSubtypes, onToggleSubtype, onClearSubtypes, isSelectionMode, onComparisonModeChange, showNoDiagnosisFilter, hasMappableFacilities, viewMode, onViewModeChange, visibleCount }: { sortOrder: SortOrder; setSortOrder: (value: SortOrder) => void; noDiagnosisOnly: boolean; setNoDiagnosisOnly: (value: boolean) => void; live: boolean; activeSubtypes: string[]; onToggleSubtype: (subtype: string) => void; onClearSubtypes: () => void; isSelectionMode: boolean; onComparisonModeChange: (value: boolean) => void; showNoDiagnosisFilter: boolean; hasMappableFacilities: boolean; viewMode: ViewMode; onViewModeChange: (value: ViewMode) => void; visibleCount: number }) {
  return (
    <section aria-label="表示を絞り込む" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">表示を絞り込む</p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">並び順</span>
          <select aria-label="並び替え" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="min-h-9 rounded-md border border-border bg-card px-2 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="default">相談分野との関連順</option>
            <option value="distance">{live ? "近い順(現在地)" : "近い順"}</option>
          </select>
        </label>
        {hasMappableFacilities && <ViewModeToggle value={viewMode} onChange={onViewModeChange} showLabel={false} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/70 pt-3">
        {showNoDiagnosisFilter && (
          <label className="flex min-h-9 items-center gap-2 text-foreground">
            <input type="checkbox" checked={noDiagnosisOnly} onChange={(event) => setNoDiagnosisOnly(event.target.checked)} className="size-4 rounded border-border" />
            <span>診断がなくても相談できる窓口のみ表示</span>
          </label>
        )}
        <label className="flex min-h-9 items-center gap-2 text-foreground">
          <input type="checkbox" checked={isSelectionMode} onChange={(event) => onComparisonModeChange(event.target.checked)} className="size-4 rounded border-border" />
          <span>施設を比較する</span>
        </label>
        <span aria-live="polite" className="text-xs text-muted-foreground">{visibleCount}件を表示中</span>
      </div>
      {activeSubtypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <span className="text-xs text-muted-foreground">分類で絞り込み中</span>
          {activeSubtypes.map((subtype) => <button key={subtype} type="button" aria-label={`${subtype}の絞り込みを解除`} onClick={() => onToggleSubtype(subtype)} className="cursor-pointer rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50">{subtype}</button>)}
          <Button type="button" variant="ghost" size="sm" onClick={onClearSubtypes}>すべて解除</Button>
        </div>
      )}
    </section>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) { return <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm"><p className="font-medium text-foreground">この条件に一致する窓口は見つかりませんでした。</p><Button type="button" variant="outline" size="sm" className="self-start" onClick={onClear}>フィルタを解除する</Button></div>; }
