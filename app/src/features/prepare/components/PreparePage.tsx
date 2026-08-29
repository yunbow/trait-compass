"use client";

import { useState } from "react";
import { NotebookPen, Sparkles } from "lucide-react";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { NoAnswersFallback } from "@/components/common/NoAnswersFallback";
import { ResultSubPageSkeleton } from "@/components/common/ResultSubPageSkeleton";
import { SharedResultUnavailableNotice } from "@/components/common/SharedResultUnavailableNotice";
import { buttonVariants } from "@/components/ui/button";
import { AiSummarySection } from "@/features/ai-summary/components/AiSummarySection";
import { PreparePanel } from "@/features/prepare/components/PreparePanel";
import { useResultDerivedData } from "@/features/result/hooks/useResultDerivedData";
import { useSharedResultHash } from "@/features/result/hooks/useSharedResultHash";
import type { Question } from "@/features/survey/schema/question";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { AgeGroup } from "@/features/support/schema/age-group";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { buildResultsHref } from "@/features/support/services/results-url";
import { cn } from "@/lib/utils";

type PrepareMode = "select" | "ai" | null;

/**
 * 結果画面から引き継ぐ困りごとタグのうち、初期選択(チェック済み)にする最大件数。
 * 全件をそのまま初期選択すると「ほぼ全部選ばれている」ように見えてしまうため、上位のみを
 * 選択済みにし、残りは既存の困りごとタグ選択UI(基本情報を入力・変更)から利用者が追加できる
 * ようにする(表示自体は全タグ分そのまま残る、絞るのは初期選択のみ)。
 */
const PREPARE_INITIAL_TAG_COUNT = 3;

interface PreparePageProps {
  questions: Question[];
  /** `/support/results` から引き継いだ年齢(クエリ無し・不正時は null)。 */
  initialAgeGroup?: AgeGroup | null;
  /** `/support/results` から引き継いだ区市町村(クエリ無し・不正時は null)。 */
  initialMunicipality?: string | null;
  /** `/support/results` から引き継いだ区市町村の5桁コード(クエリ無し・不正時は null)。 */
  initialMunicipalityCode?: string | null;
  /**
   * `/support/results` から引き継いだ相談分野タグ。`tags` クエリ自体が無い(=`/support/results` を
   * 経由しない直接遷移)場合のみ null で、その場合だけ supportTags(端末の自己チェック結果由来)へ
   * フォールバックする。`/support/results` で明示的に「全般」を選んだ場合は空配列(`[]`)になり、
   * フォールバックしない(2026-08是正: 空配列と null を区別しないと、無関係な古い自己チェック結果の
   * タグが復活してしまう。support-tag-url.ts の NO_TAGS_EXPLICIT_VALUE 参照)。
   */
  prefillTags?: SupportTag[] | null;
  /** `/support/results` から引き継いだ元の年齢選択(ライフステージ)。`PreparePanel` の5区分ピッカーの
   *  プリフィルと、戻り先(`/support/results`)への引き継ぎに使う(クエリ無し・不正時は null)。 */
  initialLifestage?: Lifestage | null;
  /** 旧 `/result/summarize` からのリダイレクト(`?mode=ai`)等による初期モード。未指定時は作り方選択から始まる。 */
  initialMode?: PrepareMode;
}

/**
 * 「相談時に渡すメモを作る」専用ページ(/result/prepare)。
 *
 * 旧・別導線だった「相談メモを作る(選択式のみ)」と「AIで困りごとを要約する(自由記述)」を
 * 1つの入口に統合し、遷移後に「作り方を選ぶ」ステップでモードを選択させる構成にした。
 * どちらのモードも「相談時に渡すメモ」を作る手段という同じ目的を持つため、利用者から見て
 * 別機能に見えないようにする(選択式モードは自由記述を一切持たない=`PreparePanel`、
 * AI自由記述モードは `/api/summarize` の危機介入ガード等の既存安全設計を維持したまま
 * `AiSummarySection` をそのまま内部モードとして使う)。
 */
export function PreparePage({
  questions,
  initialAgeGroup = null,
  initialMunicipality = null,
  initialMunicipalityCode = null,
  prefillTags = null,
  initialLifestage = null,
  initialMode = null,
}: PreparePageProps) {
  const { isHydrated: isProgressHydrated, hasAnswers, topCategories, supportTags } = useResultDerivedData(questions);
  const { isHydrated: isHashHydrated, hasShareParam } = useSharedResultHash();
  const [mode, setMode] = useState<PrepareMode>(initialMode);
  // 支援情報の検索結果から来た人は、チェックを未実施でも URL の条件だけで
  // 相談メモを作れるようにする。結果由来の上位カテゴリは空のまま扱う。
  const hasSearchPrefill = initialAgeGroup !== null && initialMunicipality !== null && initialMunicipalityCode !== null;

  if (!isProgressHydrated || !isHashHydrated) return <ResultSubPageSkeleton />;

  if (hasShareParam) {
    return <SharedResultUnavailableNotice />;
  }

  if (!hasAnswers && !hasSearchPrefill) {
    return <NoAnswersFallback />;
  }

  // 支援情報検索結果画面から来た場合は、セルフチェック結果(/result)ではなく
  // その検索結果一覧(/support/results)へ戻す。年齢・区市町村・相談分野タグ・元の年齢選択
  // (ライフステージ)は引き継げるが、目的選択・タブ選択までは本ページが受け取っていないため、
  // 既定タブ(相談窓口)への遷移になる点に留意する。
  const backHref = hasSearchPrefill
    ? buildResultsHref(
        { age: initialAgeGroup, municipalityCode: initialMunicipalityCode, tags: prefillTags ?? [], lifestage: initialLifestage },
        CATEGORY_TYPES[0],
      )
    : "/result";
  const backLabel = hasSearchPrefill ? "前の画面に戻る" : "結果に戻る";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]"
    >
      <GhostBackLink href={backHref}>{backLabel}</GhostBackLink>
      <DisclaimerNotice variant="top" />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-foreground">相談時に渡すメモを作る</h1>
        <p className="text-sm text-muted-foreground">相談時に伝えやすいメモを作成します。作り方を選んでください。</p>
      </header>

      {mode === null && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("select")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <NotebookPen aria-hidden="true" className="size-5 text-primary" />
              選んだ項目からメモを作る
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">おすすめ</span>
            </span>
            <span className="text-sm text-muted-foreground">
              外部の生成AIは使いません。選択式の項目だけでメモを作成します。
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("ai")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles aria-hidden="true" className="size-5 text-primary" />
              自由記述をAIで整理してメモを作る
            </span>
            <span className="text-sm text-muted-foreground">
              書いた内容をAIに送信して、読みやすく整理します。送信前に内容を確認できます。
            </span>
          </button>
        </div>
      )}

      {mode !== null && (
        <>
          <button
            type="button"
            onClick={() => setMode(null)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "w-fit self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            ← 作り方を選び直す
          </button>

          {mode === "select" && (
            <PreparePanel
              topCategories={topCategories}
              initialTags={(prefillTags ?? supportTags).slice(0, PREPARE_INITIAL_TAG_COUNT)}
              initialLifestage={initialLifestage}
              initialMunicipality={initialMunicipality}
              autoStart
            />
          )}

          {mode === "ai" && <AiSummarySection topCategories={topCategories} autoStart />}
        </>
      )}
    </main>
  );
}
