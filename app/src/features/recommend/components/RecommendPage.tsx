"use client";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { NoAnswersFallback } from "@/components/common/NoAnswersFallback";
import { ResultSubPageSkeleton } from "@/components/common/ResultSubPageSkeleton";
import { SharedResultUnavailableNotice } from "@/components/common/SharedResultUnavailableNotice";
import { RecommendHintSection } from "@/features/recommend/components/RecommendHintSection";
import { useResultDerivedData } from "@/features/result/hooks/useResultDerivedData";
import { useSharedResultHash } from "@/features/result/hooks/useSharedResultHash";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { AgeGroup } from "@/features/support/schema/age-group";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { buildResultsHref } from "@/features/support/services/results-url";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import type { Question } from "@/features/survey/schema/question";

interface RecommendPageProps {
  questions: Question[];
  /** `/support/results` から引き継いだ年齢(クエリ無し・不正時は null)。 */
  initialAgeGroup?: AgeGroup | null;
  /** `/support/results` から引き継いだ区市町村(クエリ無し・不正時は null)。 */
  initialMunicipality?: string | null;
  /** `/support/results` から引き継いだ区市町村の5桁コード(クエリ無し・不正時は null)。 */
  initialMunicipalityCode?: string | null;
  /** `/support/results` から引き継いだ相談分野タグ(クエリ無し時は null。あれば supportTags より優先)。 */
  prefillTags?: SupportTag[] | null;
  /** 検索結果から引き継いだ元の年齢区分。戻り先の検索条件を保つために使う。 */
  initialLifestage?: Lifestage | null;
  /** 検索結果から引き継いだ相談目的。戻り先の検索条件を保つために使う。 */
  initialPurposeId?: string | null;
}

/** 「相談先のヒントを見る」専用ページ(/result/recommend)。 */
export function RecommendPage({
  questions,
  initialAgeGroup = null,
  initialMunicipality = null,
  initialMunicipalityCode = null,
  prefillTags = null,
  initialLifestage = null,
  initialPurposeId = null,
}: RecommendPageProps) {
  const { isHydrated: isProgressHydrated, hasAnswers, supportTags } = useResultDerivedData(questions);
  const { isHydrated: isHashHydrated, hasShareParam } = useSharedResultHash();

  if (!isProgressHydrated || !isHashHydrated) return <ResultSubPageSkeleton />;

  if (hasShareParam) {
    return <SharedResultUnavailableNotice />;
  }

  const hasSearchPrefill = initialAgeGroup !== null && initialMunicipality !== null && initialMunicipalityCode !== null;
  if (!hasAnswers && !hasSearchPrefill) return <NoAnswersFallback />;

  // 支援情報検索結果画面から来た場合は、セルフチェック結果(/result)ではなく
  // その検索結果一覧(/support/results)へ戻す。年齢・区市町村・相談分野タグは
  // 引き継げるが、lifestage・目的選択・タブ選択までは本ページが受け取っていないため、
  // 既定タブ(相談窓口)への遷移になる点に留意する。
  const backHref = hasSearchPrefill
    ? buildResultsHref(
        {
          age: initialAgeGroup,
          municipalityCode: initialMunicipalityCode,
          tags: prefillTags ?? [],
          lifestage: initialLifestage,
          purposeId: initialPurposeId,
        },
        CATEGORY_TYPES[0],
      )
    : "/result";
  const backLabel = hasSearchPrefill ? "前の画面に戻る" : "結果に戻る";

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <GhostBackLink href={backHref}>{backLabel}</GhostBackLink>
      <DisclaimerNotice variant="top" />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground">条件に合う相談先を絞り込む</h1>
        <p className="text-sm text-muted-foreground">条件を確認してから、相談したいことを選ぶか入力してください。</p>
      </header>
      <RecommendHintSection
        initialTags={prefillTags ?? supportTags}
        initialLifestage={initialLifestage}
        initialMunicipality={initialMunicipality}
        autoStart
        resultsHref={hasSearchPrefill ? backHref : null}
      />
    </main>
  );
}
