"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { TopReturnLink } from "@/components/common/TopReturnLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnswerChoice } from "@/features/survey/components/AnswerChoice";
import { CategoryTransition } from "@/features/survey/components/CategoryTransition";
import { ProgressBar } from "@/features/survey/components/ProgressBar";
import { SkipConfirmDialog } from "@/features/survey/components/SkipConfirmDialog";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { useSurveyProgress } from "@/features/survey/hooks/useSurveyProgress";
import type { AnswerValue, CategoryKey, Question } from "@/features/survey/schema/question";
import { flushQaLog, logQaEvent } from "@/lib/qa-log/qa-logger";

interface SurveyRunnerProps {
  questions: Question[];
}

/**
 * 回答を選んでから次の設問へ進むまでの一瞬の確認表示時間(ミリ秒)。
 * クリック直後に即座に次画面へ切り替わると「今どれを選んだか」が分からなくなるため、
 * 選んだ選択肢にチェックが付いた状態を短く見せてから進む。長い演出は不要なため
 * 100〜200ms 程度に留める。
 */
const ANSWER_FEEDBACK_DELAY_MS = 150;

/**
 * アンケート画面のクライアント側本体(TICKET-0007)。
 * `app/survey/page.tsx`(サーバーコンポーネント)から P0 の30問を受け取り、
 * 1問1画面の出題・進行状態の保存/再開・カテゴリ変わり目トランジション・
 * 早期スキップ確認までの一連の流れを管理する。
 */
export function SurveyRunner({ questions }: SurveyRunnerProps) {
  const router = useRouter();
  const { isHydrated, currentIndex, currentAnswerValue, answerCurrent, goToPrevious } =
    useSurveyProgress(questions);

  // カテゴリ変わり目トランジション中は、遷移先カテゴリを保持する。
  // null の間は通常の設問画面(またはトランジション不要な状態)を表示する。
  const [pendingCategory, setPendingCategory] = useState<CategoryKey | null>(null);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);

  // 選択直後の一瞬の確認表示(ANSWER_FEEDBACK_DELAY_MS)を保持する。null の間は
  // 通常表示、値が入っている間はその選択肢にチェックを付けたまま次の設問への
  // 実際の遷移(answerCurrent の呼び出し)を遅らせる。
  const [pendingValue, setPendingValue] = useState<AnswerValue | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  // 設問が切り替わるたび(前進・後退・トランジション終了・全問回答完了)に見出しへ
  // フォーカスを移動し、スクリーンリーダー利用者にも画面の変化を伝える(NFR-43, NFR-46)。
  // `currentIndex`/`pendingCategory` が実際に変化した場合のみ発火するため、初回マウント時
  // (フレッシュな開始・再開いずれも値が変わらない限り)には発火せず、ページ読み込み直後の
  // フォーカスを勝手に奪わない。
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex, pendingCategory]);

  // QA 専用行動ログ(TICKET-0030)への薄いフック。`logQaEvent` は
  // `window.__ND_QA_LOGGING__ === true` の場合のみ発火し、それ以外(本番含む)では
  // 完全な no-op になる(NFR-39、src/lib/qa-log/qa-logger.ts 参照)。
  // ハイドレーション前(`isHydrated === false`)は `currentIndex` が実際の再開位置を
  // 反映していないため、誤った設問 ID を記録しないよう明示的にスキップする。
  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (currentIndex >= questions.length) {
      logQaEvent("complete");
      return;
    }
    if (!pendingCategory) {
      logQaEvent("question-shown", questions[currentIndex]?.id);
    }
  }, [isHydrated, currentIndex, pendingCategory, questions]);

  if (!isHydrated) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy="true"
        className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12"
      >
        <TopReturnLink />
        <DisclaimerNotice variant="compact" />
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="text-sm font-medium text-foreground">前回の続きがあるか確認しています。</p>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  const isComplete = currentIndex >= questions.length;

  function handleAnswer(value: AnswerValue) {
    // 確認表示中(前の選択の遷移待ち)は連打を無視する。
    if (pendingValue !== null) {
      return;
    }
    setPendingValue(value);
    pendingTimerRef.current = window.setTimeout(() => {
      const previousQuestion = questions[currentIndex];
      const nextQuestion = questions[currentIndex + 1];
      logQaEvent("answered", previousQuestion?.id);
      answerCurrent(value);
      setPendingValue(null);

      // 次の設問がカテゴリ変わり目にあたる場合のみ、一呼吸トランジションを挟む(FR-014)。
      // 再開(resume)・戻る操作では発生させない(NFR-43 の「事前告知」は初回到達時のみで十分なため)。
      if (nextQuestion && previousQuestion && nextQuestion.category !== previousQuestion.category) {
        setPendingCategory(nextQuestion.category);
      }
    }, ANSWER_FEEDBACK_DELAY_MS);
  }

  function handleTransitionDone() {
    setPendingCategory(null);
  }

  async function handleSkipConfirmed() {
    logQaEvent("skip-confirm");
    setSkipDialogOpen(false);
    // QA ログ有効時(NFR-39)は画面遷移前にバッファを書き出しておく。無効時は no-op。
    await flushQaLog();
    router.push("/result");
  }

  async function handleFinish() {
    // QA ログ有効時(NFR-39)は画面遷移前にバッファを書き出しておく。無効時は no-op。
    await flushQaLog();
    router.push("/result");
  }

  if (isComplete) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 sm:py-12">
        <TopReturnLink />
        <div className="flex flex-1 flex-col justify-center gap-6">
          <div className="flex flex-col gap-2 text-center">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded"
            >
              回答ありがとうございました
            </h1>
          </div>
          <Button type="button" size="lg" className="w-full" onClick={handleFinish}>
            結果を見る
          </Button>
          <DisclaimerNotice variant="compact" />
        </div>
      </main>
    );
  }

  if (pendingCategory) {
    return <CategoryTransition nextCategory={pendingCategory} onDone={handleTransitionDone} />;
  }

  const question = questions[currentIndex];

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-6 py-8 sm:py-12"
    >
      <GhostBackLink href="/">中断してトップへ戻る</GhostBackLink>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <div key={question.id} className="nd-fade-in flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
              <span>質問 {currentIndex + 1} / {questions.length}</span>
              <span aria-hidden="true">・</span>
              <span>{CATEGORY_LABELS[question.category]}</span>
            </div>
            <ProgressBar currentCategory={question.category} currentQuestion={currentIndex + 1} totalQuestions={questions.length} />
          </div>
          <section className="rounded-lg border border-border bg-muted p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
              >
                Q
              </span>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="rounded text-lg leading-relaxed font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {question.text}
              </h1>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">こうした経験や傾向は、あなたにありますか?</p>
          </section>

          <AnswerChoice selectedValue={pendingValue ?? currentAnswerValue} onSelect={handleAnswer} disabled={pendingValue !== null} />
          <p className="text-center text-xs text-muted-foreground">
            選ぶと次の質問へ進みます。<span className="hidden sm:inline">数字キー(1〜3)でも選べます。</span>
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={currentIndex === 0 || pendingValue !== null}
            onClick={() => {
              logQaEvent("back");
              goToPrevious();
            }}
          >
            前の質問へ
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-background"
            disabled={pendingValue !== null}
            onClick={() => setSkipDialogOpen(true)}
          >
            ここまでの回答で途中結果を見る
          </Button>
        </div>

        <DisclaimerNotice variant="compact" />
      </div>

      <SkipConfirmDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen} onConfirm={handleSkipConfirmed} />
    </main>
  );
}
