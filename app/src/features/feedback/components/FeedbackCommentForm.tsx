"use client";

import { useState } from "react";

import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ReportHoneypotField } from "@/components/common/report-form/HoneypotField";
import { ReportLabeledTextarea } from "@/components/common/report-form/LabeledTextarea";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api/post-json";

import { FEEDBACK_COMMENT_MAX_LENGTH, FeedbackAckSchema } from "@/features/feedback/constants/feedback-options";
import type { FeedbackSource } from "@/features/feedback/constants/feedback-options";

interface FeedbackCommentFormProps {
  source: FeedbackSource;
}

type Step = "form" | "preview" | "sending" | "done" | "error";

/**
 * 3択評価に回答した後にのみ表示する、任意の一言コメント欄。
 *
 * このアプリで利用者の自由記述をサーバー(D1)へ永続化する機能は、必ず「送信内容を確認」→
 * 明示同意(「この内容で送信」)の確認ステップを挟む、という load-bearing な設計原則
 * (`PreparePanel`/`FacilityReportForm` と同じ)に従う。バリデーション(トリム後
 * 1〜500文字)は「送信内容を確認」へ進める条件として判定し、`<textarea maxLength>` 属性
 * だけに頼らない(プログラム的な値設定は maxLength のブラウザ制約を回避しうるため)。
 */
export function FeedbackCommentForm({ source }: FeedbackCommentFormProps) {
  const [step, setStep] = useState<Step>("form");
  const [commentText, setCommentText] = useState("");
  const [publishConsent, setPublishConsent] = useState(false);
  const [website, setWebsite] = useState("");

  const trimmedText = commentText.trim();
  const canPreview = trimmedText.length > 0 && trimmedText.length <= FEEDBACK_COMMENT_MAX_LENGTH;

  function handleShowPreview() {
    if (!canPreview) return;
    setStep("preview");
  }

  function handleBackToForm() {
    setStep("form");
  }

  function handleRetry() {
    setStep("preview");
  }

  async function handleSubmit() {
    setStep("sending");
    const result = await postJson(
      "/api/feedback",
      { kind: "comment", source, commentText: trimmedText, publishConsent, website },
      FeedbackAckSchema,
    );

    if (!result.ok) {
      setStep("error");
      return;
    }

    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">コメントを送信しました。ご協力ありがとうございました。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground">
        Trait Compass を使って、役に立ったこと・分かりにくかったことがあれば教えてください(任意)
      </p>

      {step === "form" && (
        <div className="flex flex-col gap-3">
          <ReportLabeledTextarea
            label="コメント(任意)"
            value={commentText}
            onChange={setCommentText}
            maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
          />
          <label className="flex items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={publishConsent}
              onChange={(event) => setPublishConsent(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              この内容を、匿名の「利用者の声」として成果ページに掲載してもよい(掲載前に運営が内容を確認します)
            </span>
          </label>
          <p className="text-xs text-muted-foreground">お名前・連絡先などの個人情報は書かないでください。</p>
          <ReportHoneypotField value={website} onChange={setWebsite} />
          <Button type="button" variant="outline" className="w-fit" disabled={!canPreview} onClick={handleShowPreview}>
            送信内容を確認
          </Button>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-3 rounded-md bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">送信されるコメント</p>
            <p className="whitespace-pre-wrap text-foreground">{trimmedText}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">公開許可</p>
            <p className="text-foreground">
              {publishConsent
                ? "この内容を、匿名の「利用者の声」として成果ページに掲載してもよい(掲載前に運営が内容を確認します)"
                : "公開しない"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">お名前・連絡先などの個人情報は書かないでください。</p>
          <p className="text-xs text-muted-foreground">氏名やメールアドレスなど、個人を特定する情報は送信されません。</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleBackToForm}>
              修正する
            </Button>
            <Button type="button" onClick={handleSubmit}>
              この内容で送信
            </Button>
          </div>
        </div>
      )}

      {step === "sending" && <AiThinkingIndicator label="送信しています…" />}

      {step === "error" && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-destructive">送信できませんでした。もう一度お試しください。</p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleRetry}>
            もう一度試す
          </Button>
        </div>
      )}
    </div>
  );
}
