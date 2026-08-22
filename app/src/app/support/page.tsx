import type { Metadata } from "next";

import { SupportInputForm } from "@/features/support/components/SupportInputForm";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import { parseSupportTagsParam } from "@/features/support/services/parse-support-tags";
import { parseMunicipalityParam } from "@/features/support/schema/municipality-param";

export const metadata: Metadata = {
  title: "相談先を探す | Trait Compass",
  description: "年齢・お住まいの地域から、日常の困りごとに関する相談先の候補を探せます。",
};

interface SupportPageProps {
  searchParams: Promise<{
    tags?: string | string[];
    lifestage?: string | string[];
    municipality?: string | string[];
  }>;
}

/**
 * 年齢・地域選択画面(TICKET-0014)。
 * サーバーコンポーネントとして `?tags=a,b` クエリ(結果画面からの相談分野タグの引き継ぎ、
 * FR-023)を検証・整形し、実際の入力 UI・遷移はクライアントコンポーネントの
 * SupportInputForm に委譲する(project-structure.md §7: page.tsx はデータパススルーのみ)。
 *
 * `?lifestage=`・`?municipality=` クエリ(結果画面の「条件を見直す」導線からのプリフィル、
 * results-url.ts の buildSupportBackHref 参照)も同様に検証する。
 */
export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const initialTags = parseSupportTagsParam(params.tags);
  const initialLifestage = parseLifestagePrefillParam(params.lifestage);
  const initialMunicipality = parseMunicipalityParam(params.municipality);

  return (
    <SupportInputForm
      initialTags={initialTags}
      initialLifestage={initialLifestage}
      initialMunicipality={initialMunicipality?.name ?? null}
    />
  );
}
