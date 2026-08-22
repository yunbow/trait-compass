import type { Metadata } from "next";
import type { D1Database } from "@cloudflare/workers-types";

import { PageReachTracker } from "@/components/common/PageReachTracker";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { CategoryType } from "@/features/support/constants/category-types";
import { parseResultsTabParam, RESULTS_TAB_ORDER, SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import type { ResultsTab } from "@/features/support/constants/results-tabs";
import { FacilityResultsView } from "@/features/support/components/FacilityResultsView";
import type { SchoolInfoSectionProps } from "@/features/support/components/SchoolInfoSection";
import { SupportResultsFallback } from "@/features/support/components/SupportResultsFallback";
import { parseResultsSearchParams } from "@/features/support/schema/results-search-params";
import type { Municipality } from "@/features/support/constants/municipalities";
import { getUnhealthyDatasets } from "@/features/support/services/dataset-status";
import { degradeUnhealthyCategoriesToBroadArea, searchFacilities } from "@/features/support/services/facility-search";
import { toFacilityDisplayData } from "@/features/support/services/facility-display";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";
import { applyPathwayPriority } from "@/features/support/services/facility-pathway-priority";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { parseSupportPurposeParam } from "@/features/support/services/parse-support-purpose";
import { PURPOSE_OPTIONS_BY_LIFESTAGE, PURPOSE_OTHER_ID } from "@/features/support/constants/purpose-options";
import { getPurposeDefaultTab } from "@/features/support/constants/purpose-default-tabs";
import { parseSupportTagsParam } from "@/features/support/services/parse-support-tags";
import { buildPrepareHref, buildRecommendHref, buildResultsHref, buildSupportBackHref } from "@/features/support/services/results-url";
import { fetchSchoolInfo, filterSchoolInfoByLifestage, hideExpiredSchoolInfo } from "@/features/support/services/school-info";
import { fetchSupportPathway } from "@/features/support/services/support-pathway";
import type { SupportPathwayData } from "@/features/support/services/support-pathway";
import { fetchResultsGuideNote } from "@/features/support/services/results-guide-notes";
import { getResultsTabGuide } from "@/features/support/services/results-tab-guides";
import { formatFetchedAtDate } from "@/features/support/services/dataset-freshness";
import { getDb } from "@/lib/db";
import { safeErrorKind } from "@/lib/errors/safe-error-kind";

export const metadata: Metadata = {
  title: "相談先の候補 | Trait Compass",
  robots: { index: false, follow: false },
};

interface SupportResultsPageProps {
  searchParams: Promise<{
    age?: string | string[];
    municipality?: string | string[];
    lifestage?: string | string[];
    tags?: string | string[];
    tab?: string | string[];
    purpose?: string | string[];
  }>;
}

interface ResultsData {
  facilitiesByCategory: Record<CategoryType, FacilityDisplayData[]>;
  isFallback: boolean;
  fallbackMessage: string | null;
  hasUnhealthyDatasets: boolean;
  /**
   * 不健全データセット検知により広域窓口のみの縮退表示に切り替わった分類一覧
   * (TICKET-0012 AC-3 積み残し分、TICKET-0033 AC-3)。オープンデータの30日stale由来のみ
   * (2026-08是正: 手動調査データの期限切れは `expiredCategories` 側に分離)。
   */
  degradedCategories: CategoryType[];
  /**
   * 手動調査データの有効期限365日超過(src/lib/manual-data-expiration.ts、2026-08是正)により
   * 広域窓口のみの縮退表示に切り替わった分類一覧。`degradedCategories` とは別集合として持つ
   * (縮退理由の文言を出し分けるため、EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE 参照)。
   */
  expiredCategories: CategoryType[];
  schoolInfo: Omit<SchoolInfoSectionProps, "municipality">;
  supportPathway: SupportPathwayData | null;
}

/**
 * D1 からの検索・整形処理をまとめて行う(page.tsx の try/catch から JSX を追い出すため、
 * データ取得だけを行う関数として切り出す。React はレンダー内で throw された例外を
 * try/catch では捕捉できないため、JSX の構築は必ずこの関数の外側で行う)。
 */
async function loadResultsData(
  db: D1Database,
  params: {
    age: "child" | "adult";
    municipality: string;
    lifestage: Lifestage | null;
    tags: ReturnType<typeof parseSupportTagsParam>;
    /** 想定ルート取得対象の目的ID(PURPOSE_OTHER_ID・lifestage 未取得時は呼び出し元で null にする)。 */
    pathwayPurposeId: string | null;
  },
): Promise<ResultsData> {
  const [searchResult, unhealthyDatasets, schoolInfo, rawSupportPathway] = await Promise.all([
    searchFacilities(db, { ageGroup: params.age, municipality: params.municipality, lifestage: params.lifestage, tags: params.tags }),
    getUnhealthyDatasets(db),
    fetchSchoolInfo(db, params.municipality)
      .catch((error: unknown) => {
        console.error("[support/results] 学校情報の取得に失敗しました。", safeErrorKind(error));
        return {
          schools: { elementary: [], juniorHigh: [] },
          highSchoolPathways: [],
          classOrganizations: [],
          limitations: [],
          surveyDate: null,
          licenseAudit: null,
          expiration: null,
        };
      })
      .then((info) => hideExpiredSchoolInfo(info))
      .then((info) => filterSchoolInfoByLifestage(info, params.lifestage)),
    params.lifestage !== null && params.pathwayPurposeId !== null
      ? fetchSupportPathway(db, { municipality: params.municipality, lifestage: params.lifestage, purposeId: params.pathwayPurposeId }).catch(
          (error: unknown) => {
            console.error("[support/results] 想定ルートの取得に失敗しました。", safeErrorKind(error));
            return null;
          },
        )
      : Promise.resolve(null),
  ]);

  // 手動調査データの有効期限365日超過(2026-08是正)。この自治体の調査データ全体
  // (municipality_survey_meta.survey_date 由来)が期限切れの場合、学校情報に限らず
  // 想定ルート(supportPathway)も非表示にする(schoolInfo.expiration が survey_date 由来の
  // 自治体単位の判定であるため、school-info.ts 以外の由来のデータにもそのまま転用できる)。
  const isMunicipalitySurveyExpired = schoolInfo.expiration?.isExpired ?? false;
  const supportPathway = isMunicipalitySurveyExpired ? null : rawSupportPathway;

  // 2026-08是正(AC-2最優先): getUnhealthyDatasets の結果を「オープンデータstale」
  // (kind: open-data-unhealthy)と「手動調査データの期限切れ」(kind: manual-expired)の
  // 2集合に分け、degradeUnhealthyCategoriesToBroadArea を2回チェーン適用する。1回で
  // まとめて扱うと、手動データの期限切れ由来の縮退にオープンデータ向けの文言
  // (UNHEALTHY_DATASET_DEGRADE_MESSAGE)が誤って出てしまう(AC-3)。
  const staleOpenDataIds = new Set(
    unhealthyDatasets.filter((dataset) => dataset.kind === "open-data-unhealthy").map((dataset) => dataset.id),
  );
  const expiredManualIds = new Set(
    unhealthyDatasets.filter((dataset) => dataset.kind === "manual-expired").map((dataset) => dataset.id),
  );

  const staleDegraded = degradeUnhealthyCategoriesToBroadArea(searchResult.facilitiesByCategory, staleOpenDataIds);
  const expiredDegraded = degradeUnhealthyCategoriesToBroadArea(staleDegraded.facilitiesByCategory, expiredManualIds);

  const facilitiesByCategory = Object.fromEntries(
    CATEGORY_TYPES.map((type) => [type, expiredDegraded.facilitiesByCategory[type].map(toFacilityDisplayData)]),
  ) as Record<CategoryType, FacilityDisplayData[]>;

  // 想定ルート(supportPathway)が取得できている場合、各カテゴリの一覧をステップの窓口名
  // (actor)の出現順で先頭へ並べ替える(想定ルートが無い場合は元の一覧のまま)。
  if (supportPathway !== null) {
    for (const type of CATEGORY_TYPES) {
      facilitiesByCategory[type] = applyPathwayPriority(facilitiesByCategory[type], supportPathway.steps);
    }
  }

  return {
    facilitiesByCategory,
    isFallback: searchResult.isFallback,
    fallbackMessage: searchResult.fallbackMessage,
    // AC-2(最優先): 「確認が必要な状態」の汎用注記はオープンデータstaleのみで判定する。
    // 他自治体の手動データ期限切れが原因で、無関係な自治体にこの注記が出ないようにする
    // (getUnhealthyDatasets は全自治体の datasets を横断的に見るため)。
    hasUnhealthyDatasets: staleOpenDataIds.size > 0,
    degradedCategories: staleDegraded.degradedCategories,
    expiredCategories: expiredDegraded.degradedCategories,
    schoolInfo,
    supportPathway,
  };
}

/**
 * 支援情報案内画面(TICKET-0015)。
 *
 * サーバーコンポーネントとして D1(facilities/facility_tags/datasets)を直接読み、検索・
 * 整形ロジックは services/ に委譲する(project-structure.md §7: page.tsx はデータ
 * パススルーのみ)。
 *
 * - age/municipality は Zod で検証し、不正・欠損の場合は検索を行わず /support への
 *   差し戻し導線を持つ空状態を表示する。
 * - tags は既存の parseSupportTagsParam(未知の値を黙って除外する寛容な実装)をそのまま使う。
 * - D1 バインディングが無い環境(getDb が throw、ローカル未セットアップ等)ではエラー画面では
 *   なく「支援情報は現在準備中です」の graceful degradation を返す。ただし、原因を握り
 *   つぶさないよう `console.error` で必ずログに残す(スキーマ不一致等の実害あるバグを
 *   graceful degradation の裏に隠さないため)。ログには `safeErrorKind()` で得た例外の
 *   種別(name/typeof)のみを渡し、message・stack(D1 の内部詳細を含み得る)は渡さない
 *   (セキュリティレビュー指摘: Cloudflare Observability に残る運用ログの情報漏洩面を
 *   最小化する)。
 *
 * JSX の構築(<FacilityResultsView> 等)はすべて try/catch の外側で行う。React はレンダー中の
 * 例外を try/catch で捕捉できないため(react-hooks/error-boundaries)、D1 アクセスを含む
 * データ取得(loadResultsData)だけを try/catch の内側に閉じ込める。
 *
 * TICKET-0034: 画面到達計測(`<PageReachTracker screen="support-results" />`)は成功・
 * フォールバックいずれの分岐にも挿入し、`screen` 以外の検索条件(年齢・区市町村・タグ)や
 * 検索結果には一切アクセスしない。
 */
export default async function SupportResultsPage({ searchParams }: SupportResultsPageProps) {
  const raw = await searchParams;
  const parsedParams = parseResultsSearchParams(raw);

  if (!parsedParams.success) {
    return (
      <>
        <PageReachTracker screen="support-results" />
        <SupportResultsFallback
          title="検索条件を確認できませんでした。"
          description="年齢と区市町村を選び直してください。"
        />
      </>
    );
  }

  const { age, municipality: municipalityEntry } = parsedParams.data;
  const municipality = municipalityEntry.name as Municipality;
  const tags = parseSupportTagsParam(raw.tags);
  const lifestage = parseLifestagePrefillParam(raw.lifestage);

  // 目的選択画面(`/support/purpose`)から引き継いだ目的の表示用(TICKET-未採番)。
  // 「それ以外」(PURPOSE_OTHER_ID)・lifestage 未取得・該当する目的が無い場合はいずれも
  // 何も表示しない(通常の一覧のまま)。施設の絞り込み・フィルタリングには一切使わない
  // (意図的にスコープ外)。後述の既定タブ選択には使う。
  const purposeId = parseSupportPurposeParam(raw.purpose);
  const selectedPurposeLabel =
    purposeId !== null && purposeId !== PURPOSE_OTHER_ID && lifestage !== null
      ? PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage].find((option) => option.id === purposeId)?.label
      : undefined;
  // 想定ルート取得対象の目的ID(「それ以外」・lifestage 未取得の場合は取得しない)。
  const pathwayPurposeId = purposeId !== null && purposeId !== PURPOSE_OTHER_ID && lifestage !== null ? purposeId : null;

  // `?tab=`が明示されている場合(タブをクリックして遷移した等)は常にその指定を優先する。
  // 未指定の場合のみ、目的別の既定タブ(purpose-default-tabs.ts に対応が無ければ`undefined`)を
  // 使う。対応が無い、または対応先タブが0件の場合は、下のactiveTab算出で先頭の0件でない
  // タブへフォールバックする。
  const rawTabParam = Array.isArray(raw.tab) ? undefined : raw.tab;
  const purposeDefaultTab =
    rawTabParam === undefined && pathwayPurposeId !== null && lifestage !== null
      ? getPurposeDefaultTab(lifestage, pathwayPurposeId)
      : undefined;
  const requestedTab = rawTabParam !== undefined ? parseResultsTabParam(rawTabParam) : (purposeDefaultTab ?? parseResultsTabParam(undefined));

  let db: D1Database | null = null;
  let resultsData: ResultsData | null = null;
  try {
    db = getDb();
    resultsData = await loadResultsData(db, { age, municipality, lifestage, tags, pathwayPurposeId });
  } catch (error) {
    console.error("[support/results] 支援情報の取得に失敗しました。", safeErrorKind(error));
    resultsData = null;
  }

  if (!resultsData) {
    return (
      <>
        <PageReachTracker screen="support-results" />
        <SupportResultsFallback title="支援情報は現在準備中です。" description="しばらくしてから、もう一度お試しください。" />
      </>
    );
  }

  const data = resultsData;
  const schoolCount =
    data.schoolInfo.schools.elementary.length +
    data.schoolInfo.schools.juniorHigh.length +
    data.schoolInfo.highSchoolPathways.length;
  const countForTab = (type: ResultsTab): number =>
    type === SCHOOL_INFO_TAB ? schoolCount : data.facilitiesByCategory[type].length;
  const tabs = RESULTS_TAB_ORDER.filter((type) => countForTab(type) > 0).map((type) => ({
    type,
    href: buildResultsHref({ age, municipalityCode: municipalityEntry.code, tags, lifestage, purposeId: pathwayPurposeId }, type),
    count: countForTab(type),
  }));
  const activeTab: ResultsTab = countForTab(requestedTab) > 0 ? requestedTab : (tabs[0]?.type ?? CATEGORY_TYPES[0]);
  const activeTabGuide = getResultsTabGuide(activeTab, lifestage);
  // 手動調査データの有効期限365日超過(2026-08是正)。自治体全体の調査データが期限切れの場合、
  // 結果画面ガイドの自治体固有補足(municipality_survey_meta.survey_date と同じ調査由来)も
  // 取得をスキップする(学校情報・想定ルートと同条件)。
  const isMunicipalitySurveyExpired = data.schoolInfo.expiration?.isExpired ?? false;
  const resultsGuideNote =
    activeTabGuide && db && !isMunicipalitySurveyExpired
      ? await fetchResultsGuideNote(db, { municipality, tab: activeTab as "相談窓口" | "学校情報" | "福祉ガイド" }).catch((error: unknown) => {
          console.error("[support/results] 結果画面ガイドの取得に失敗しました。", safeErrorKind(error));
          return null;
        })
      : null;
  const backHref = buildSupportBackHref({ municipalityCode: municipalityEntry.code, lifestage, tags });
  const prepareHref = buildPrepareHref({ age, municipalityCode: municipalityEntry.code, tags, lifestage });
  const recommendHref = buildRecommendHref({ age, municipalityCode: municipalityEntry.code, tags, lifestage, purposeId: pathwayPurposeId });

  return (
    <>
      <PageReachTracker screen="support-results" />
      <FacilityResultsView
        age={age}
        activeTab={activeTab}
        facilitiesByCategory={resultsData.facilitiesByCategory}
        tabs={tabs}
        isFallback={resultsData.isFallback}
        fallbackMessage={resultsData.fallbackMessage}
        hasUnhealthyDatasets={resultsData.hasUnhealthyDatasets}
        isDegraded={activeTab !== SCHOOL_INFO_TAB && resultsData.degradedCategories.includes(activeTab)}
        isExpiredDegraded={activeTab !== SCHOOL_INFO_TAB && resultsData.expiredCategories.includes(activeTab)}
        backHref={backHref}
        prepareHref={prepareHref}
        recommendHref={recommendHref}
        municipality={municipality}
        municipalityCode={municipalityEntry.code}
        tags={tags}
        schoolInfo={resultsData.schoolInfo}
        selectedPurposeLabel={selectedPurposeLabel}
        supportPathway={resultsData.supportPathway}
        supportPathwayRequested={pathwayPurposeId !== null}
        resultsGuideNote={resultsGuideNote}
        lifestage={lifestage}
        manualDataExpiration={
          resultsData.schoolInfo.expiration
            ? {
                formattedExpiresAt: resultsData.schoolInfo.expiration.expiresAt
                  ? formatFetchedAtDate(resultsData.schoolInfo.expiration.expiresAt)
                  : "不明",
                isExpired: resultsData.schoolInfo.expiration.isExpired,
              }
            : null
        }
      />
    </>

  );
}
