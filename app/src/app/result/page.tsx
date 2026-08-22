import type { Metadata } from "next";

import { PageReachTracker } from "@/components/common/PageReachTracker";
import { ResultView } from "@/features/result/components/ResultView";
import { getP0Questions } from "@/features/survey/services/questions";

export const metadata: Metadata = {
  title: "結果 | Trait Compass",
  robots: { index: false, follow: false },
};

/**
 * 結果画面(TICKET-0008)。
 * サーバーコンポーネントとして P0 固定30問(getP0Questions())を取得し、localStorage の
 * 進行状態読み込み・スコアリング・チャート描画は ResultView に委譲する
 * (project-structure.md §7: page.tsx はデータパススルーのみ、/survey の SurveyPage と同じ方針)。
 */
export default function ResultPage() {
  const questions = getP0Questions();

  return (
    <>
      {/*
       * TICKET-0034: 画面到達計測は `screen="result"` のみを送る独立したコンポーネントで行い、
       * ResultView が保持するスコア・共有ハッシュ(#r=...)には一切アクセスしない
       * (NFR-31〜33: 結果データを送信するリクエストを一切発生させない)。
       */}
      <PageReachTracker screen="result" />
      <ResultView questions={questions} />
    </>
  );
}
