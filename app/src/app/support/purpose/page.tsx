import type { Metadata } from "next";

import { PurposeSelectionForm } from "@/features/support/components/PurposeSelectionForm";
import { SupportResultsFallback } from "@/features/support/components/SupportResultsFallback";
import { parseMunicipalityParam } from "@/features/support/schema/municipality-param";
import { LIFESTAGE_OPTIONS, mapLifestageToAgeGroup } from "@/features/support/services/lifestage-mapping";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import { parseSupportTagsParam } from "@/features/support/services/parse-support-tags";

export const metadata: Metadata = {
  title: "相談の目的を選ぶ | Trait Compass",
  robots: { index: false, follow: false },
};

interface SupportPurposePageProps {
  searchParams: Promise<{
    age?: string | string[];
    municipality?: string | string[];
    lifestage?: string | string[];
    tags?: string | string[];
  }>;
}

/**
 * 目的選択画面(`/support/purpose`)。`/support` → `/support/purpose` → `/support/results` の
 * 新フローの中間画面で、`SupportInputForm` で選んだ年齢(ライフステージ)・区市町村・
 * 相談分野タグを引き継ぎつつ、目的の選択のみをこのページに委譲する(project-structure.md §7:
 * page.tsx はデータパススルーのみ)。
 *
 * - lifestage は `parseLifestagePrefillParam` で検証する。`/support/results` の age/municipality
 *   検証(`ResultsSearchParamsSchema`)は「18歳未満/18歳以上」の2値しか持たないため元の
 *   5区分ライフステージを復元できず、この画面の目的選択肢(`PURPOSE_OPTIONS_BY_LIFESTAGE`)を
 *   決定できない。そのため lifestage を必須パラメータとして扱い、不正・欠損時は
 *   `/support/results` の `parsedParams.success === false` と同様に `/support` への差し戻し導線を出す。
 * - municipality は自治体名または5桁コードをレジストリで検証する。この画面では区市町村も
 *   検索成立の必須条件であるため、解決できない値はフォールバック表示にする。
 * - tags は既存の `parseSupportTagsParam`(未知の値を黙って除外する寛容な実装)をそのまま使う。
 */
export default async function SupportPurposePage({ searchParams }: SupportPurposePageProps) {
  const raw = await searchParams;
  const lifestage = parseLifestagePrefillParam(raw.lifestage);
  const municipalityEntry = parseMunicipalityParam(raw.municipality);

  if (lifestage === null || municipalityEntry === null) {
    return (
      <SupportResultsFallback
        title="検索条件を確認できませんでした。"
        description="年齢と区市町村を選び直してください。"
      />
    );
  }

  const tags = parseSupportTagsParam(raw.tags);
  const ageGroup = mapLifestageToAgeGroup(lifestage);
  const lifestageLabel = LIFESTAGE_OPTIONS.find((option) => option.value === lifestage)?.label ?? "";

  return (
    <PurposeSelectionForm
      lifestage={lifestage}
      municipality={municipalityEntry.name}
      municipalityCode={municipalityEntry.code}
      ageGroup={ageGroup}
      tags={tags}
      lifestageLabel={lifestageLabel}
    />
  );
}
