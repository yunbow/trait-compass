"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { CategoryExplainSection } from "@/features/explain/components/CategoryExplainSection";
import { getAllCategoryLevels, getCategoryExplanations } from "@/features/result/services/explanation";
import { buildRadarData } from "@/features/result/services/chart-data";
import { buildTagOverlap } from "@/features/result/services/tag-overlap";
import { TagOverlapSummary } from "@/features/result/components/TagOverlapSummary";
import type { CategoryScores, GrayZoneMeta } from "@/features/survey/services/scoring";

const RadarChart = dynamic(() => import("@/features/result/components/RadarChart"), { ssr: false });

interface ResultChartsProps {
  categoryScores: CategoryScores;
  grayZoneMeta: GrayZoneMeta;
  enableAiExplain?: boolean;
}

export function ResultCharts({
  categoryScores,
  grayZoneMeta,
  enableAiExplain = false,
}: ResultChartsProps) {
  const radarData = buildRadarData(categoryScores);
  const tagOverlap = buildTagOverlap(categoryScores);
  const explanations = getCategoryExplanations(categoryScores);
  const allLevels = getAllCategoryLevels(categoryScores);

  return (
    <>
      <section className="flex w-full flex-col items-center gap-3">
        <h2 className="text-base font-semibold text-foreground">領域別の傾向</h2>
        <p className="max-w-2xl text-center text-sm text-muted-foreground">
          点が外側にあるほど、その領域の傾向が回答内で高めに出ている目安です。
        </p>
        <Link href="/guide#categories" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          領域名の説明を見る
        </Link>
        <RadarChart data={radarData} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">領域ごとの結果一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">全10領域の結果です。上部では上位3領域のみを紹介しています。</p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {allLevels.map(({ category, label, level }) => (
            <li key={category} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-foreground">{label}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-primary">
                {level ?? "未算出"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          これらの傾向は固定的なものではなく、体調や状況によって変わりうるものです。
        </p>
        {enableAiExplain && <CategoryExplainSection topCategories={explanations.map((e) => e.category)} />}
      </section>

      <section className="flex w-full flex-col items-center gap-3">
        <h2 className="text-base font-semibold text-foreground">今回特に高めだった領域の組み合わせ</h2>
        <p className="max-w-2xl text-center text-sm text-muted-foreground">
          複数の場面にまたがって表れている困りごとを整理しています。
        </p>
        <Link href="/guide#traits" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          関連する用語を知る
        </Link>
        <TagOverlapSummary tags={tagOverlap.tags} sentence={tagOverlap.sentence} />
        <DisclaimerNotice variant="compact" />
        {grayZoneMeta.grayZoneCount > 0 && (
          <p className="text-xs text-muted-foreground">
            ※ どちらともいえない、中間的な回答が{grayZoneMeta.grayZoneCount}件ありました。この整理には含めていません。
          </p>
        )}
      </section>
    </>
  );
}
