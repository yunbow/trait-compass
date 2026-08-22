"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";

import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ConsentPreviewBox } from "@/components/common/ConsentPreviewBox";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { Button } from "@/components/ui/button";
import { SourceCredit } from "@/components/common/SourceCredit";
import { postJson } from "@/lib/api/post-json";

import { AskResponseSchema } from "@/features/ask-ai/schema/ask";
import type { AskResponse } from "@/features/ask-ai/schema/ask";
import { FACILITY_PRESET_QUESTIONS, INSTITUTION_PRESET_QUESTIONS, SCHOOL_PRESET_QUESTIONS } from "@/features/ask-ai/services/preset-questions";
import type { PresetQuestion } from "@/features/ask-ai/services/preset-questions";

export type AskAiTarget =
  | { type: "facility"; facilityId: string }
  | { type: "institution" }
  | { type: "school"; schoolId: string };

interface AskAiPanelProps {
  target: AskAiTarget;
  /** 専用ページで質問選択フォームから開始するか。 */
  defaultOpen?: boolean;
}

type Step = "idle" | "form" | "preview" | "sending" | "result" | "error";

/**
 * 「AIに質問する」導線(TICKET-0048)。かつて窓口カード(FacilityCard)・学校情報カード
 * (SchoolCard)へインラインで組み込んでいたが、`/support/ask` 専用ページでは
 * `defaultOpen` で質問選択から開始し、カードへのインライン組み込みは廃止して画面遷移方式へ
 * 統一する。
 *
 * `AiSummarySection`/`RecommendHintSection`/`PreparePanel` と同じく、選択式フォーム →
 * 送信内容プレビュー → 明示同意("同意して送信")を経たあとにのみ `/api/ask` へ fetch する
 * (FR-041)。**自由記述入力欄は一切設けない**(AC-2、既存の危機介入回避構造の維持)。
 * 定型質問は `target.type` に応じて窓口向け/制度向け/学校向けのいずれかのリストのみを
 * 表示する(AC-1)。
 */
export function AskAiPanel({ target, defaultOpen = false }: AskAiPanelProps) {
  const [step, setStep] = useState<Step>(defaultOpen ? "form" : "idle");
  const [selectedQuestion, setSelectedQuestion] = useState<PresetQuestion | null>(null);
  const [answer, setAnswer] = useState<AskResponse | null>(null);

  const questions: readonly PresetQuestion[] =
    target.type === "facility"
      ? FACILITY_PRESET_QUESTIONS
      : target.type === "school"
        ? SCHOOL_PRESET_QUESTIONS
        : INSTITUTION_PRESET_QUESTIONS;

  function handleOpenForm() {
    setStep("form");
  }

  function handleSelectQuestion(question: PresetQuestion) {
    setSelectedQuestion(question);
    setStep("preview");
  }

  function handleCancelPreview() {
    setStep("form");
  }

  async function handleConsentAndSend() {
    if (!selectedQuestion) return;
    setStep("sending");
    const body =
      target.type === "facility"
        ? { targetType: "facility" as const, questionId: selectedQuestion.id, facilityId: target.facilityId }
        : target.type === "school"
          ? { targetType: "school" as const, questionId: selectedQuestion.id, schoolId: target.schoolId }
          : { targetType: "institution" as const, questionId: selectedQuestion.id };

    const result = await postJson("/api/ask", body, AskResponseSchema);

    if (!result.ok) {
      setStep("error");
      return;
    }

    setAnswer(result.data);
    setStep("result");
  }

  function handleRetry() {
    setAnswer(null);
    setSelectedQuestion(null);
    setStep("form");
  }

  return (
    <section aria-live="polite" className="flex w-full flex-col gap-2 text-left">
      {step === "idle" && (
        <Button type="button" variant="ghost" size="sm" onClick={handleOpenForm}>
          <MessageCircleQuestion aria-hidden="true" />
          AIに質問する(任意)
        </Button>
      )}

      {step !== "idle" && (
        <>
          <p className="text-xs text-muted-foreground">
            選択した質問は外部の生成 AI サービスに送信されます。当サービス側ではリクエスト内容を
            ログに保存しない方針ですが、AI 事業者側の保持・学習利用の条件は各社のポリシーによります。
            自由記述の入力欄はありません。これは案内の参考情報です。
          </p>
        </>
      )}

      {step === "form" && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground">質問を選んでください</span>
          <div className="flex flex-col gap-2">
            {questions.map((question) => (
              <Button
                key={question.id}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start text-left"
                onClick={() => handleSelectQuestion(question)}
              >
                {question.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {step === "preview" && selectedQuestion && (
        <ConsentPreviewBox
          dense
          sent={<p className="text-foreground">質問: 「{selectedQuestion.label}」</p>}
          notSent={<p className="text-foreground">自由記述・アンケートの回答内容</p>}
          onConsent={handleConsentAndSend}
          onCancel={handleCancelPreview}
        />
      )}

      {step === "sending" && <AiThinkingIndicator />}

      {step === "result" && answer && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <ProvenanceLabel source="ai" />
          <p className="text-foreground">{answer.answer}</p>
          {answer.sources.map((source) => (
            <SourceCredit key={source.credit} credit={source.credit} sourceUrl={source.sourceUrl} />
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={handleRetry}>
            別の質問をする
          </Button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">回答の取得に失敗しました。もう一度お試しください。</p>
          <Button type="button" variant="ghost" size="sm" onClick={handleRetry}>
            やり直す
          </Button>
        </div>
      )}
    </section>
  );
}
