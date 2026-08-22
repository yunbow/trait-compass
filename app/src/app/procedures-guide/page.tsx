import type { Metadata } from "next";

import { ProceduresTimelineView } from "@/features/procedures-guide/components/ProceduresTimelineView";

export const metadata: Metadata = {
  title: "就学・転居後の手続きタイムライン | Trait Compass",
  description: "就学や転居のあとに必要になりやすい手続きを時系列で整理した、静的なガイドです。",
};

/**
 * 就学・転居後手続きタイムライン静的ガイド(TICKET-0057)。
 *
 * すべて静的コンテンツ(`procedures-timeline.ts`)のみで構成され、D1アクセス・AI生成を
 * 行わないため、page.tsx はデータ取得を挟まず `ProceduresTimelineView` をそのまま返す
 * (project-structure.md §7)。
 *
 * トップページ・結果画面からの導線追加はチケットのスコープ外としており(TICKET-0057
 * 技術的詳細3)、現時点ではこのURLへの直接アクセスでのみ到達できる
 * (`/coverage` と同じ扱い)。
 */
export default function ProceduresGuidePage() {
  return <ProceduresTimelineView />;
}
