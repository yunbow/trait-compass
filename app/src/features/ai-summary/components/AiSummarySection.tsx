"use client";

import { useId, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ConsentPreviewBox } from "@/components/common/ConsentPreviewBox";
import { extractApiErrorCode, resolveAiErrorMessage } from "@/lib/api/ai-error-codes";
import { postJson } from "@/lib/api/post-json";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import type { CategoryKey } from "@/features/survey/schema/question";
import { SummaryMemo } from "@/features/ai-summary/components/SummaryMemo";
import { FREE_TEXT_MAX_LENGTH, SummarizeResponseSchema } from "@/features/ai-summary/schema/summarize";
import type { SummarizeResponse } from "@/features/ai-summary/schema/summarize";

interface AiSummarySectionProps {
  /** 上位カテゴリ key(結果画面の上位カテゴリ解説と同じ配列、最大3件)。 */
  topCategories: CategoryKey[];
  /** true の場合は入口ボタンを省略して入力欄から表示する。 */
  autoStart?: boolean;
}

type Step = "idle" | "input" | "preview" | "sending" | "result" | "error";

const DEFAULT_ERROR_MESSAGE = "要約の取得に失敗しました。もう一度お試しください。";

/**
 * 結果画面の「AI に相談内容を要約してもらう(任意)」セクション(TICKET-0022)。
 * `ResultView` から自分の結果表示時のみ描画される(共有閲覧では表示しない、AC 準拠)。
 *
 * 設計変更に関する注記(ticket「作業ログ」にも追記): TICKET-0007(SurveyRunner)の自由記述は
 * React state のみで保持され、`/result` への画面遷移で意図的に破棄される設計(NFR-32)のため、
 * `/survey` 側で入力した自由記述をそのまま `/api/summarize` に渡す経路が存在しない。
 * そのため本チケットでは、結果画面自体に新たな自由記述入力欄をこのセクション内に設け、
 * その場で「入力 → プレビュー → 同意 → 送信 → 表示」を完結させる形に設計変更する。
 * 画面をまたがない構成にすることで、「保存しない・送信前プレビュー」の原則(FR-041)を
 * 素直に満たせる。
 *
 * フロー(FR-041): テキスト入力 → 「送信内容を確認」(プレビュー: 送信されるもの=入力
 * テキスト+上位カテゴリ名、送信されないもの=回答・地域) → 「同意して送信」。
 * `handleConsentAndSend`(「同意して送信」のクリックハンドラ)より前に fetch は一切発行しない。
 *
 * NFR-35: 外部の生成 AI サービスに送信されること、当サービス側はログを保存しない方針だが
 * AI 事業者側の保持・学習利用条件は各社ポリシーによる旨を明示する。
 */
export function AiSummarySection({ topCategories, autoStart = false }: AiSummarySectionProps) {
  const [freeText, setFreeText] = useState("");
  const [step, setStep] = useState<Step>(autoStart ? "input" : "idle");
  const [summary, setSummary] = useState<SummarizeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR_MESSAGE);
  const textareaId = useId();

  const topCategoryLabels = topCategories.map((key) => CATEGORY_LABELS[key]);
  const trimmedText = freeText.trim();

  function handleShowPreview() {
    if (trimmedText.length === 0) return;
    setStep("preview");
  }

  function handleOpenInput() {
    setStep("input");
  }

  function handleCancelPreview() {
    setStep("input");
  }

  async function handleConsentAndSend() {
    setStep("sending");
    const result = await postJson(
      "/api/summarize",
      { freeText: trimmedText, topCategories },
      SummarizeResponseSchema,
    );

    if (!result.ok) {
      if (result.reason === "http-error") {
        setErrorMessage(resolveAiErrorMessage(extractApiErrorCode(result.errorBody), DEFAULT_ERROR_MESSAGE));
      }
      setStep("error");
      return;
    }

    setSummary(result.data);
    setStep("result");
  }

  function handleRetry() {
    setSummary(null);
    setFreeText("");
    setStep("input");
  }

  function handleResend() {
    setStep("preview");
  }

  return (
    <section aria-live="polite" className="flex w-full max-w-none flex-col gap-4 text-left">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleOpenInput}>
          <Sparkles aria-hidden="true" />
          AI に相談内容を要約してもらう(任意)
        </Button>
      )}

      {step !== "idle" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">自由記述をAIで整理してメモを作る</h2>
            {step === "preview" && <span className="text-xs text-muted-foreground">送信内容の確認</span>}
          </div>

          <p className="text-xs text-muted-foreground">
            入力内容は外部の生成 AI サービスに送信されます。当サービス側ではリクエスト内容をログに
            保存しない方針ですが、AI 事業者側の保持・学習利用の条件は各社のポリシーによります。
            これは診断ではなく、傾向を把握するための参考情報です。
          </p>
        </>
      )}

      {(step === "input" || step === "preview") && (
        <>
          <label htmlFor={textareaId} className="text-xs font-medium text-foreground">
            困りごとを入力(任意・スキップ可)
          </label>
          <p className="text-xs text-destructive">
            氏名・住所・学校名・電話番号など、個人を特定できる情報は入力しないでください。
          </p>
          <Textarea
            id={textareaId}
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            maxLength={FREE_TEXT_MAX_LENGTH}
            rows={4}
            disabled={step === "preview"}
            placeholder="例: 会議の内容を覚えておくのが難しい など"
          />
        </>
      )}

      {step === "input" && (
        <Button type="button" size="lg" className="w-full" disabled={trimmedText.length === 0} onClick={handleShowPreview}>
          <Send aria-hidden="true" />
          送信内容を確認
        </Button>
      )}

      {step === "preview" && (
        <ConsentPreviewBox
          sent={
            <>
              <p className="text-foreground">入力テキスト: 「{trimmedText}」</p>
              <p className="text-foreground">
                チェックで高めだった領域: {topCategoryLabels.length > 0 ? topCategoryLabels.join("、") : "(なし)"}
              </p>
            </>
          }
          notSent={<p className="text-foreground">アンケートの回答内容・年齢・地域</p>}
          onConsent={handleConsentAndSend}
          onCancel={handleCancelPreview}
        />
      )}

      {step === "sending" && <AiThinkingIndicator label="要約を生成しています…" />}

      {/*
        危機介入の定型文(isCrisisResponse: true)は、印刷/コピー付きの「メモ」として装飾しない
        (安全設計、docs 参照)。SummaryMemo・ProvenanceLabel のいずれも経由させず、
        従来どおりのプレーンテキスト表示のみを維持する。
      */}
      {step === "result" && summary && summary.isCrisisResponse && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="text-foreground">{summary.summary}</p>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleRetry}>
            もう一度入力する
          </Button>
        </div>
      )}

      {step === "result" && summary && !summary.isCrisisResponse && (
        <>
          <SummaryMemo summary={summary.summary} />
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full print:hidden" onClick={handleRetry}>
            もう一度入力する
          </Button>
        </>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
          <p className="text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleRetry}>
            もう一度入力する
          </Button>
        </div>
      )}
    </section>
  );
}
