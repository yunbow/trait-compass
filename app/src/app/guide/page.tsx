import type { Metadata } from "next";

import { resolveBackHref } from "@/components/common/report-form/back-href";
import { GuideView } from "@/features/guide/components/GuideView";

export const metadata: Metadata = {
  title: "用語の説明 | Trait Compass",
  description:
    "結果画面に出てくる領域名（会話・伝え方、感覚 など）と発達特性に関連する用語（ASD・ADHD・LD・DCD）の意味を、日常の困りごとチェックの文脈で説明します。",
};

interface GuidePageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

/**
 * `back` クエリ(遷移元のURL)を、facility-report/content-report と同じ
 * `resolveBackHref`(オープンリダイレクト対策込み)で検証して GuideView に渡す。
 * 結果画面・使い方ページ・共通フッターなど複数の入口から到達するため、
 * 「結果画面へ戻る」固定ではなく遷移元に応じた戻り先にする(未指定時はトップへ戻る)。
 */
export default async function GuidePage({ searchParams }: GuidePageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");
  return <GuideView backHref={backHref} isFromResult={backHref === "/result"} />;
}
