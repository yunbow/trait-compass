"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";
import { postJson } from "@/lib/api/post-json";

import { FEEDBACK_UNCLEAR_REASON_OPTIONS, FeedbackAckSchema } from "@/features/feedback/constants/feedback-options";
import type { FeedbackSource, FeedbackUnclearReason } from "@/features/feedback/constants/feedback-options";

interface FeedbackUnclearReasonPickerProps {
  source: FeedbackSource;
}

type Status = "unanswered" | "sending" | "error" | "done";

/**
 * 3択評価が「まだ分からない」だった場合のみ表示する、任意の内訳質問(単一選択)。
 * `NextActionFeedbackSection` のサンクス表示の下に置く。
 *
 * 選択したら即 `{ kind: "unclear-reason", ... }` を送信する(確認ステップは挟まない。
 * 選択式・非公開集計目的の内訳であり、コメント欄のような自由記述をサーバーへ永続化する
 * 機能ではないため、`FeedbackCommentForm` のプレビュー→明示同意フローの対象外)。
 * 送信後は選択肢を消し、小さな受領表示に切り替える(二重送信防止)。
 */
export function FeedbackUnclearReasonPicker({ source }: FeedbackUnclearReasonPickerProps) {
  const [status, setStatus] = useState<Status>("unanswered");
  const [selectedReason, setSelectedReason] = useState<FeedbackUnclearReason | null>(null);

  async function sendReason(reason: FeedbackUnclearReason) {
    setSelectedReason(reason);
    setStatus("sending");
    const result = await postJson("/api/feedback", { kind: "unclear-reason", source, reason }, FeedbackAckSchema);

    if (!result.ok) {
      setStatus("error");
      return;
    }

    setStatus("done");
  }

  function handleRetry() {
    if (selectedReason) void sendReason(selectedReason);
  }

  if (status === "done") {
    return <p className="text-xs text-muted-foreground">ご回答ありがとうございます。</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">どのあたりが分かりにくかったですか？(任意)</p>
      <SingleChoiceButtonGroup
        legend="内訳から1つ選ぶ(任意)"
        legendClassName="sr-only"
        options={FEEDBACK_UNCLEAR_REASON_OPTIONS}
        selectedValue={selectedReason}
        onSelect={(value) => void sendReason(value)}
        disabled={status === "sending"}
      />
      {status === "error" && (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-destructive">送信できませんでした。もう一度お試しください。</p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleRetry}>
            もう一度送信する
          </Button>
        </div>
      )}
    </div>
  );
}
