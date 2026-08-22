import type { Metadata } from "next";

import { FullPageFallback } from "@/components/common/FullPageFallback";
import { SmartBackLinkButton } from "@/components/common/SmartBackLinkButton";
import { firstValue, resolveBackHref } from "@/components/common/report-form/back-href";
import { ReportPageShell } from "@/components/common/report-form/ReportPageShell";
import { AskAiPanel } from "@/features/ask-ai/components/AskAiPanel";
import type { AskAiTarget } from "@/features/ask-ai/components/AskAiPanel";
import { SCHOOL_LEVEL_LABELS } from "@/features/support/constants/school-labels";
import { fetchFacilityById } from "@/features/support/services/facility-search";
import { fetchSchoolById } from "@/features/support/services/school-info";
import { getDb } from "@/lib/db";
import { safeErrorKind } from "@/lib/errors/safe-error-kind";

export const metadata: Metadata = {
  title: "掲載情報についてAIに質問する | Trait Compass",
  robots: { index: false, follow: false },
};

interface AskPageProps {
  searchParams: Promise<{
    targetType?: string | string[];
    targetId?: string | string[];
    back?: string | string[];
  }>;
}

interface ResolvedAskTarget {
  targetHeading: string;
  targetContext: string;
  target: AskAiTarget;
}

/**
 * 「AIに質問する」専用ページ(`/support/ask`)。
 *
 * もとは `FacilityCard`/`SchoolCard` 内で `AskAiPanel` をインライン展開していたが、
 * 掲載情報の訂正・更新報告(facility-report/content-report)と同じ
 * 「専用ページ+SmartBackLinkで戻る」方式へ統一した。
 *
 * 対象は `targetType`+`targetId` から D1 で直接再取得する(クエリで受け取った値を
 * そのまま信用しない、facility-report/page.tsx と同じ方針)。見つからない場合は
 * 空状態を表示し、AskAiPanel は描画しない。このページで表示するのは名称・自治体・種別のみのため、
 * リスク区分による住所・電話の出し分け(FR-027)の対象情報は扱わない。
 *
 * `back` クエリ(未指定時は `/support` にフォールバック)は「戻る」の遷移先候補の1つに
 * 過ぎない。SmartBackLink はブラウザ履歴があれば `history.back()` を優先する(P0対応)。
 */
export default async function AskPage({ searchParams }: AskPageProps) {
  const raw = await searchParams;
  const targetType = firstValue(raw.targetType);
  const targetId = firstValue(raw.targetId);
  const backHref = resolveBackHref(raw.back);

  let resolved: ResolvedAskTarget | null = null;

  try {
    if (targetType === "facility" && targetId) {
      const db = getDb();
      const facility = await fetchFacilityById(db, targetId);
      if (facility !== null) {
        resolved = {
          targetHeading: facility.name,
          targetContext: `${facility.municipality} ／ ${facility.categoryType}`,
          target: { type: "facility", facilityId: facility.id },
        };
      }
    } else if (targetType === "school" && targetId) {
      const db = getDb();
      const school = await fetchSchoolById(db, targetId);
      if (school !== null) {
        resolved = {
          targetHeading: school.name,
          targetContext: `${school.municipality} ／ ${SCHOOL_LEVEL_LABELS[school.level]}`,
          target: { type: "school", schoolId: school.id },
        };
      }
    }
  } catch (error) {
    console.error("[support/ask] 質問対象の取得に失敗しました。", safeErrorKind(error));
    resolved = null;
  }

  if (resolved === null) {
    return (
      <FullPageFallback
        title="質問対象の掲載情報が見つかりませんでした。"
        description="掲載データが更新され、対象が変更・削除された可能性があります。"
        action={
          <SmartBackLinkButton fallbackHref={backHref} className="w-full max-w-xs">
            前の画面に戻る
          </SmartBackLinkButton>
        }
      />
    );
  }

  return (
    <ReportPageShell
      heading="掲載情報についてAIに質問する"
      targetLabel="質問する掲載情報"
      backHref={backHref}
      targetHeading={resolved.targetHeading}
      targetContext={resolved.targetContext}
    >
      <AskAiPanel target={resolved.target} defaultOpen />
    </ReportPageShell>
  );
}
