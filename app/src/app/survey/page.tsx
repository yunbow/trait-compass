import type { Metadata } from "next";

import { PageReachTracker } from "@/components/common/PageReachTracker";
import { SurveyRunner } from "@/features/survey/components/SurveyRunner";
import { getP0Questions } from "@/features/survey/services/questions";

export const metadata: Metadata = {
  title: "困りごとチェックをはじめる | Trait Compass",
  description: "30の質問に答えて、日常の困りごとの傾向を整理します。ブラウザで完結し、診断ではなく傾向を知るための目安を示します。",
};

/**
 * アンケート画面(TICKET-0007)。
 * サーバーコンポーネントとして P0 固定30問(getP0Questions())を取得し、実際の回答
 * UI・状態管理はクライアントコンポーネントの SurveyRunner に委譲する
 * (project-structure.md §7: page.tsx はデータパススルーのみ)。
 *
 * 再開(FR-015)の判定は SurveyRunner 内の useSurveyProgress が localStorage の
 * 保存有無のみで行う。トップ画面の「前回の続きから」はこの /survey へ遷移するだけで
 * 保存済みの進行状態から再開し、「はじめる」は遷移前に進行状態を削除してから
 * /survey へ移動する。
 */
export default function SurveyPage() {
  const questions = getP0Questions();

  return (
    <>
      <PageReachTracker screen="survey" />
      <SurveyRunner questions={questions} />
    </>
  );
}
