import type { Metadata } from "next";

import { PageReachTracker } from "@/components/common/PageReachTracker";
import { PreparePage } from "@/features/prepare/components/PreparePage";
import { parseResultsSearchParams } from "@/features/support/schema/results-search-params";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import { hasExplicitSupportTagsParam, parseSupportTagsParam } from "@/features/support/services/parse-support-tags";
import { getP0Questions } from "@/features/survey/services/questions";

export const metadata: Metadata = {
  title: "相談メモを作る | Trait Compass",
  robots: { index: false, follow: false },
};

interface ResultPreparePageProps {
  searchParams: Promise<{
    age?: string | string[];
    municipality?: string | string[];
    tags?: string | string[];
    lifestage?: string | string[];
    mode?: string | string[];
  }>;
}

/**
 * `mode` クエリ(`/result/summarize` からのリダイレクト等)を検証する。
 * "select"・"ai" 以外(未指定・不正値・配列)はすべて null(=作り方選択ステップから開始)。
 */
function parseInitialMode(raw: string | string[] | undefined): "select" | "ai" | null {
  return raw === "select" || raw === "ai" ? raw : null;
}

/**
 * 「相談時に渡すメモを作る」専用ページ(/result/prepare)。
 *
 * `/support/results` からの遷移時のみ、年齢・区市町村・相談分野タグ・元の年齢選択(ライフステージ)を
 * クエリで受け取り `PreparePage` へプリフィル値として渡す(年齢・区市町村の再入力を省略するため)。
 * クエリが無い・不正な場合は単にプリフィルしない(`/result` からの直接遷移と同じ挙動になる。
 * `/support/results` のような検索条件エラー画面は表示しない)。lifestage は `age`+`municipality` とは
 * 独立の寛容な解析(`parseLifestagePrefillParam`)を使い、不正・欠損時は null(未選択)になるだけで
 * エラー扱いにはしない。
 *
 * `mode` クエリは旧 `/result/summarize` からのリダイレクト(`?mode=ai`)を受け取り、
 * 作り方選択ステップを経ずに該当モードへ直行させるために使う。
 */
export default async function ResultPreparePage({ searchParams }: ResultPreparePageProps) {
  const questions = getP0Questions();
  const raw = await searchParams;
  const parsedAgeMunicipality = parseResultsSearchParams(raw);
  const prefillTags = parseSupportTagsParam(raw.tags);
  const lifestage = parseLifestagePrefillParam(raw.lifestage);

  return (
    <>
      <PageReachTracker screen="result-prepare" />
      <PreparePage
        questions={questions}
        initialAgeGroup={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.age : null}
        initialMunicipality={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.municipality.name : null}
        initialMunicipalityCode={parsedAgeMunicipality.success ? parsedAgeMunicipality.data.municipality.code : null}
        prefillTags={hasExplicitSupportTagsParam(raw.tags) ? prefillTags : null}
        initialLifestage={lifestage}
        initialMode={parseInitialMode(raw.mode)}
      />
    </>
  );
}
