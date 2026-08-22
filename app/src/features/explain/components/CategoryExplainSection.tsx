"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ConsentPreviewBox } from "@/components/common/ConsentPreviewBox";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { postJson } from "@/lib/api/post-json";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import type { CategoryKey } from "@/features/survey/schema/question";

import { ExplainResponseSchema } from "@/features/explain/schema/explain";

interface CategoryExplainSectionProps {
  /** 上位カテゴリ key(ResultCharts の上位カテゴリ解説と同じ配列、最大3件)。 */
  topCategories: CategoryKey[];
}

type Step = "idle" | "preview" | "sending" | "result" | "error";

/**
 * 結果画面の「AI による補足解説(任意)」セクション(TICKET-0023, FR-043)。
 *
 * レーダーチャート/ベン図の上位カテゴリ解説(ResultCharts の `explanations`)の下に置かれ、
 * fact-checked 242件を根拠とする RAG 解説を任意で取得できるようにする。
 * `AiSummarySection`(TICKET-0022)と同じく、明示同意・送信内容プレビューを経たあとにのみ
 * fetch を発行する(FR-041)。送信するのはカテゴリ名のみ(回答内容・スコア・年齢・地域は
 * 送信しない)であることをプレビューで明示する。
 */
export function CategoryExplainSection({ topCategories }: CategoryExplainSectionProps) {
  const [step, setStep] = useState<Step>("idle");
  const [explanation, setExplanation] = useState<string | null>(null);

  const topCategoryLabels = topCategories.map((key) => CATEGORY_LABELS[key]);

  function handleShowPreview() {
    setStep("preview");
  }

  function handleCancelPreview() {
    setStep("idle");
  }

  async function handleConsentAndSend() {
    setStep("sending");
    const result = await postJson("/api/explain", { topCategories }, ExplainResponseSchema);

    if (!result.ok) {
      setStep("error");
      return;
    }

    setExplanation(result.data.explanation);
    setStep("result");
  }

  function handleRetry() {
    setExplanation(null);
    setStep("idle");
  }

  return (
    <section aria-live="polite" className="flex flex-col gap-3">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" onClick={handleShowPreview}>
          <Sparkles aria-hidden="true" />
          AI による補足解説(任意)
        </Button>
      )}

      {step === "preview" && (
        <ConsentPreviewBox
          sent={
            <p className="text-foreground">
              上位カテゴリ名: {topCategoryLabels.length > 0 ? topCategoryLabels.join("、") : "(なし)"}
            </p>
          }
          notSent={<p className="text-foreground">アンケートの回答内容・スコアの値・年齢・地域</p>}
          note={
            <p className="text-xs text-muted-foreground">
              入力内容は外部の生成 AI サービスに送信されます。当サービス側ではリクエスト内容をログに
              保存しない方針ですが、AI 事業者側の保持・学習利用の条件は各社のポリシーによります。
            </p>
          }
          onConsent={handleConsentAndSend}
          onCancel={handleCancelPreview}
        />
      )}

      {step === "sending" && <AiThinkingIndicator label="解説を生成しています…" />}

      {step === "result" && explanation && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
          <ProvenanceLabel source="ai" />
          <p className="text-foreground">{explanation}</p>
          <Button type="button" variant="ghost" size="lg" onClick={handleRetry}>
            閉じる
          </Button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
          <p className="text-destructive">解説の取得に失敗しました。もう一度お試しください。</p>
          <Button type="button" variant="ghost" size="lg" onClick={handleRetry}>
            もう一度試す
          </Button>
        </div>
      )}
    </section>
  );
}
