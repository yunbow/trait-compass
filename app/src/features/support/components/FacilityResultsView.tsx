"use client";

import { useState } from "react";
import Link from "next/link";

import { BackLinkButton } from "@/components/common/BackLinkButton";
import { ConditionPill } from "@/components/common/ConditionPill";
import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { buttonVariants } from "@/components/ui/button";
import { CategoryTabs } from "@/features/support/components/CategoryTabs";
import type { CategoryTab } from "@/features/support/components/CategoryTabs";
import { DatasetFreshnessNote } from "@/features/support/components/DatasetFreshnessNote";
import { FacilityListSection } from "@/features/support/components/FacilityListSection";
import { LatestInfoNotice } from "@/features/support/components/LatestInfoNotice";
import { NextActionFeedbackSection } from "@/features/feedback/components/NextActionFeedbackSection";
import { LicenseAuditNotice } from "@/features/support/components/LicenseAuditNotice";
import type { ViewMode } from "@/features/support/components/ViewModeToggle";
import { SchoolInfoSection } from "@/features/support/components/SchoolInfoSection";
import type { SchoolInfoSectionProps } from "@/features/support/components/SchoolInfoSection";
import { SupportPathwaySection } from "@/features/support/components/SupportPathwaySection";
import type { SupportPathwayData } from "@/features/support/services/support-pathway";
import { ResultsTabGuide } from "@/features/support/components/ResultsTabGuide";
import type { ResultsGuideNoteData } from "@/features/support/services/results-guide-notes";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import type { ResultsTab } from "@/features/support/constants/results-tabs";
import type { CategoryType } from "@/features/support/constants/category-types";
import type { Municipality } from "@/features/support/constants/municipalities";
import { AGE_GROUP_OPTIONS } from "@/features/support/schema/age-group";
import type { AgeGroup } from "@/features/support/schema/age-group";
import { buildDatasetFreshnessNotes } from "@/features/support/services/dataset-freshness";
import { LIFESTAGE_OPTIONS } from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE, UNHEALTHY_DATASET_DEGRADE_MESSAGE } from "@/features/support/services/facility-search";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { cn } from "@/lib/utils";

interface FacilityResultsViewProps {
  age?: AgeGroup;
  activeTab: ResultsTab;
  facilitiesByCategory: Record<CategoryType, FacilityDisplayData[]>;
  tabs: CategoryTab[];
  /** 区市町村データ欠損時、広域窓口のみにフォールバックしているかどうか(FR-022, AC-3)。 */
  isFallback: boolean;
  fallbackMessage: string | null;
  /** リンク切れ・鮮度超過のデータセットが1件でもある場合(FR-029, NFR-25)。 */
  hasUnhealthyDatasets: boolean;
  /**
   * 表示中のタブ(activeTab)が、不健全データセット検知により広域窓口のみの縮退表示に
   * 切り替わっているかどうか(TICKET-0012 AC-3 積み残し分、TICKET-0033 AC-3)。
   * 省略時は false(既存呼び出し元との後方互換のため任意 prop とする)。
   */
  isDegraded?: boolean;
  /**
   * 表示中のタブ(activeTab)が、手動調査データの有効期限365日超過(2026-08是正、
   * src/lib/manual-data-expiration.ts)により広域窓口のみの縮退表示に切り替わっているかどうか。
   * `isDegraded`(オープンデータstale由来)とは原因・文言が異なるため別 prop として持つ。
   * 省略時は false。
   */
  isExpiredDegraded?: boolean;
  /** 「条件を変える」導線の遷移先(/support、タグは引き継ぐ)。 */
  backHref: string;
  /** 「相談メモを作る」導線の遷移先(/result/prepare、年齢・区市町村・相談分野タグを引き継ぐ)。 */
  prepareHref: string;
  /** 「相談先のヒントを見る」導線の遷移先(/result/recommend、年齢・区市町村・相談分野タグを引き継ぐ)。 */
  recommendHref: string;
  /** ユーザーが選択した区市町村(FR-022)。「地図で見る」の中心座標決定に使う(FR-02A, TICKET-0028)。 */
  municipality: Municipality;
  /** 結果画面ガイドの訂正・更新報告リンクに使う区市町村の5桁コード。 */
  municipalityCode?: string;
  /**
   * 結果画面から引き継いだ相談分野タグ。空配列の場合は全般扱いとなり、セルフチェックへの
   * 逆導線案内(TICKET-0039)を表示する。
   */
  tags?: SupportTag[];
  /** 手動調査の学校情報。未登録自治体では空配列として渡される。 */
  schoolInfo?: Omit<SchoolInfoSectionProps, "municipality">;
  /**
   * 目的選択画面(`/support/purpose`)で選ばれた目的のラベル(表示専用)。
   * 「それ以外」選択時・lifestage 未取得時・該当する目的が無い場合は `undefined` となり、
   * その場合は何も表示しない。施設の絞り込み・フィルタリングには一切使わない(スコープ外)。
   */
  selectedPurposeLabel?: string;
  /**
   * D1(support_pathways / support_pathway_steps)から取得した想定ルート。
   * 該当データが無い場合(未登録の目的・自治体、取得失敗時等)は `null`/`undefined` となり、
   * その場合、`supportPathwayRequested` が true なら準備中メッセージを表示し、false なら何も表示しない。
   */
  supportPathway?: SupportPathwayData | null;
  /**
   * 想定ルート(supportPathway)の取得を実際に試みたかどうか(目的選択済みで
   * pathwayPurposeId が確定している場合に true)。取得を試みたのにデータが無い
   * (`supportPathway` が null)場合のみ「まずすること」の準備中メッセージを表示する。
   * 目的未選択でそもそも取得していない場合は従来どおり何も表示しない。省略時は false。
   */
  supportPathwayRequested?: boolean;
  /**
   * D1(results_guide_notes)から取得した、現在のタブの自治体固有の補足。
   * 該当データが無い場合は `null`/`undefined` となり、その場合は汎用本文のみ表示する。
   */
  resultsGuideNote?: ResultsGuideNoteData | null;
  /**
   * 目的選択画面等から引き継いだライフステージ(未就学児〜社会人の5区分)。
   * D1検索自体はage(18歳未満/18歳以上の2区分)でしか行わないため絞り込みには使わないが、
   * 「現在の検索条件」の年齢ピル表示のみ、分かる場合はこちらの詳しいラベルを優先する
   * (`/support/purpose`の「この条件で探します」表示と揃える)。取得できない場合は
   * `undefined`/`null`となり、その場合は従来通りageのラベルにフォールバックする。
   */
  lifestage?: Lifestage | null;
  /**
   * 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts、2026-08是正)。
   * `LicenseAuditNotice` へそのまま渡す。`null`/`undefined` の場合(調査対象外自治体・
   * 未取得)は追加表示しない。
   */
  manualDataExpiration?: { formattedExpiresAt: string; isExpired: boolean } | null;
}

const EMPTY_SCHOOL_INFO: Omit<SchoolInfoSectionProps, "municipality"> = {
  schools: { elementary: [], juniorHigh: [] },
  highSchoolPathways: [],
  classOrganizations: [],
  limitations: [],
  surveyDate: null,
  licenseAudit: null,
};

/** `age`(child/adult)単独からのフォールバック用ラベル。lifestage が分かる場合はそちらを優先する。 */
function ageGroupLabel(age: AgeGroup): string {
  return AGE_GROUP_OPTIONS.find((option) => option.value === age)?.label ?? "";
}

/**
 * 支援情報案内画面(TICKET-0015)の表示本体。D1 検索結果を整形済みデータ(services/ の
 * 純関数が返す形)として受け取るだけで、SQL・D1 アクセスを一切含まない。
 * そのためテストではモックデータを渡すだけで描画を確認できる(project-structure.md §7)。
 *
 * `tags` が空配列(タグ無し=全般、TICKET-0038 の直接検索導線からの到達を含む)の場合のみ、
 * 「現在の検索条件」近傍にセルフチェックへの逆導線案内を表示する(TICKET-0039)。
 * `/survey` への遷移はサーバーコンポーネントのままで完結する単純な `Link` とし
 * (`StartSurveyButton` の `resetSurveyProgressStore` は呼ばない)、保存済みの途中経過が
 * ある場合はそのまま再開扱いにする(意図しない回答破棄を避ける)。
 */
export function FacilityResultsView({
  age = "child",
  activeTab,
  facilitiesByCategory,
  tabs,
  isFallback,
  fallbackMessage,
  hasUnhealthyDatasets,
  isDegraded = false,
  isExpiredDegraded = false,
  backHref,
  prepareHref,
  recommendHref,
  municipality,
  municipalityCode = "",
  tags = [],
  schoolInfo = EMPTY_SCHOOL_INFO,
  selectedPurposeLabel,
  supportPathway,
  supportPathwayRequested = false,
  resultsGuideNote,
  lifestage,
  manualDataExpiration,
}: FacilityResultsViewProps) {
  const isSchoolTab = activeTab === SCHOOL_INFO_TAB;
  const facilities = isSchoolTab ? [] : facilitiesByCategory[activeTab];
  const resultCount = isSchoolTab ? schoolInfo.schools.elementary.length + schoolInfo.schools.juniorHigh.length + schoolInfo.highSchoolPathways.length : facilities.length;
  const freshnessNotes = buildDatasetFreshnessNotes(facilities);
  const alternativeTab = facilities.length === 0 ? tabs.find((tab) => tab.type !== activeTab && tab.count > 0) : undefined;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const ageLabel = lifestage
    ? (LIFESTAGE_OPTIONS.find((option) => option.value === lifestage)?.label ?? ageGroupLabel(age))
    : ageGroupLabel(age);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8 sm:py-12">
      {tags.length > 0 ? (
        <GhostBackLink href="/result">結果に戻る</GhostBackLink>
      ) : (
        <GhostBackLink href={backHref}>前の画面に戻る</GhostBackLink>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-left">
          <p className="text-sm font-medium text-primary">支援先を探す</p>
          <h1 className="text-xl font-bold text-foreground">
            {selectedPurposeLabel ? `「${selectedPurposeLabel}」を選んだ方への案内` : `${municipality}・${ageLabel}の支援情報（${resultCount}件）`}
          </h1>
          <p className="text-sm text-muted-foreground">{resultCount}件の情報があります。年齢と相談分野に合う情報を確認できます。</p>
        </div>

        <LicenseAuditNotice municipality={municipality} licenseAudit={schoolInfo.licenseAudit} manualDataExpiration={manualDataExpiration} />

        <section aria-label="現在の検索条件" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/60 p-4 text-sm">
          <p className="font-medium text-foreground">この条件で探します</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <ConditionPill label="地域" value={municipality} />
              <ConditionPill label="年齢" value={ageLabel} />
              <ConditionPill label="相談分野" value={tags.length > 0 ? `${tags.length}件` : "全般"} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <BackLinkButton href={backHref} className="w-full sm:w-auto">
                条件を見直す
              </BackLinkButton>
              <Link
                href={prepareHref}
                className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full sm:w-auto")}
              >
                相談メモを作る（任意）
              </Link>
              <Link
                href={recommendHref}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}
              >
                相談先のヒントを見る
              </Link>
            </div>
          </div>
          {tags.length > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              相談分野: {tags.join("、")}
            </p>
          )}
        </section>

        {supportPathway ? (
          <section aria-labelledby="next-action-heading" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div>
              <h2 id="next-action-heading" className="text-base font-semibold text-foreground">まずすること</h2>
              <p className="mt-1 text-sm text-muted-foreground">相談の入口から順に確認できます。状況に合うところから始めてください。</p>
            </div>
            <SupportPathwaySection data={supportPathway} />
          </section>
        ) : (
          supportPathwayRequested && (
            <section aria-labelledby="next-action-heading" className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-4">
              <h2 id="next-action-heading" className="text-base font-semibold text-foreground">まずすること</h2>
              <p className="text-sm text-muted-foreground">
                この地域では、選んだ目的に合わせた案内をまだ準備できていません。下の一覧から相談窓口を確認してください。
              </p>
            </section>
          )
        )}
      </section>

      <section aria-labelledby="facility-results-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="facility-results-heading" className="text-base font-semibold text-foreground">
            探す内容を選ぶ
          </h2>
        </div>
        <CategoryTabs activeTab={activeTab} tabs={tabs} />
        <ResultsTabGuide activeTab={activeTab} municipalityNote={resultsGuideNote ?? null} lifestage={lifestage ?? null} municipalityCode={municipalityCode} />
      </section>

      {isSchoolTab ? <SchoolInfoSection municipality={municipality} {...schoolInfo} viewMode={viewMode} onViewModeChange={setViewMode} /> : <section aria-labelledby="facility-list-heading" className="flex flex-col gap-4">
        <div className="border-b border-border pb-3">
          <div>
            {/* タブ(CategoryTabs)に既に同じラベルが表示されているため、視覚的には非表示にし
                aria-labelledby からの参照用にのみ残す(FR-028、重複表示の解消)。 */}
            <h2 id="facility-list-heading" className="sr-only">{activeTab}</h2>
            <p className="text-sm text-muted-foreground">{facilities.length}件の情報があります。気になる情報の詳細を確認してください。</p>
          </div>
        </div>
        {facilities.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm">
            <p className="font-medium text-foreground">この分類に該当する情報は見つかりませんでした。</p>
            <p className="text-muted-foreground">別の分類を見るか、年齢・地域の条件を変えて探してください。</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {alternativeTab && (
                <Link
                  href={alternativeTab.href}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}
                >
                  {alternativeTab.type}を見る
                </Link>
              )}
              <BackLinkButton href={backHref} className="w-full sm:w-auto">
                条件を見直す
              </BackLinkButton>
            </div>
          </div>
        ) : (
          <FacilityListSection facilities={facilities} municipality={municipality} categoryLabel={activeTab} viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
      </section>}

      <NextActionFeedbackSection source="support-results" />

      <LatestInfoNotice />

      <details open={hasUnhealthyDatasets || isDegraded || isExpiredDegraded || (isFallback && Boolean(fallbackMessage))} className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          データについて
          <span className="mt-1 block text-xs font-normal text-muted-foreground">表示している情報の範囲・更新時点を確認できます。</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {(hasUnhealthyDatasets || isDegraded || isExpiredDegraded || (isFallback && fallbackMessage)) && (
            <section aria-label="検索結果のお知らせ" className="rounded-lg border border-border bg-muted p-3 text-left text-sm text-foreground">
              <p className="font-semibold">検索結果のお知らせ</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                {isFallback && fallbackMessage && <li>{fallbackMessage}</li>}
                {isDegraded && <li>{UNHEALTHY_DATASET_DEGRADE_MESSAGE}</li>}
                {isExpiredDegraded && <li>{EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE}</li>}
                {hasUnhealthyDatasets && (
                  <li>
                    <p>一部のデータが取得できていません。</p>
                    <p>更新が古い可能性があります。最新情報は各リンク先でご確認ください。</p>
                  </li>
                )}
              </ul>
            </section>
          )}
          {isSchoolTab && (
            <section aria-label="手動調査データについて" className="rounded-lg border border-dashed border-primary/60 bg-primary/5 p-3 text-left text-sm">
              <p className="font-semibold text-foreground">手動調査データ</p>
              <p className="mt-1 text-muted-foreground">
                {municipality}教育委員会等の公表資料をもとにした手動調査データです。最終確認日は各校カードの「出典・更新」から確認できます。
                {schoolInfo.surveyDate && ` 調査日: ${schoolInfo.surveyDate}`}
              </p>
            </section>
          )}
          <DatasetFreshnessNote notes={freshnessNotes} />
          <DisclaimerNotice variant="top" />
        </div>
      </details>

    </main>
  );
}
