import type { Metadata } from "next";

import { PageReachTracker } from "@/components/common/PageReachTracker";
import { RecommendPage } from "@/features/recommend/components/RecommendPage";
import { parseResultsSearchParams } from "@/features/support/schema/results-search-params";
import { parseSupportTagsParam } from "@/features/support/services/parse-support-tags";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import { parseSupportPurposeParam } from "@/features/support/services/parse-support-purpose";
import { getP0Questions } from "@/features/survey/services/questions";

export const metadata: Metadata = {
  title: "相談先のヒントを見る | Trait Compass",
  robots: { index: false, follow: false },
};

interface ResultRecommendPageProps {
  searchParams: Promise<{
    age?: string | string[];
    municipality?: string | string[];
    tags?: string | string[];
    lifestage?: string | string[];
    purpose?: string | string[];
  }>;
}

/**
 * 「相談先のヒントを見る」専用ページ(/result/recommend)。
 *
 * `/support/results` からの遷移時のみ、年齢・区市町村・相談分野タグをクエリで受け取り
 * `RecommendPage` へプリフィル値として渡す(年齢・区市町村の再入力を省略するため。相談内容の
 * 自由記述だけは `/support/results` 側に無い情報のため引き継げず、引き続き入力が必要)。
 * クエリが無い・不正な場合は単にプリフィルしない(`/result` からの直接遷移と同じ挙動になる)。
 */
export default async function ResultRecommendPage({ searchParams }: ResultRecommendPageProps) {
  const questions = getP0Questions();
  const raw = await searchParams;
  const parsedAgeMunicipality = parseResultsSearchParams(raw);
  const prefillTags = parseSupportTagsParam(raw.tags);
  const lifestage = parseLifestagePrefillParam(raw.lifestage);
  const purposeId = parseSupportPurposeParam(raw.purpose);

  return (
    <>
      <PageReachTracker screen="result-recommend" />
      <RecommendPage
        questions={questions}
        initialAgeGroup={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.age : null}
        initialMunicipality={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.municipality.name : null}
        initialMunicipalityCode={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.municipality.code : null}
        prefillTags={prefillTags.length > 0 ? prefillTags : null}
        initialLifestage={lifestage}
        initialPurposeId={purposeId}
      />
    </>
  );
}
