"use client";

import { useId, useState, useSyncExternalStore } from "react";

import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api/post-json";

import { FeedbackCommentForm } from "@/features/feedback/components/FeedbackCommentForm";
import { FeedbackUnclearReasonPicker } from "@/features/feedback/components/FeedbackUnclearReasonPicker";
import { FEEDBACK_RATING_OPTIONS, FeedbackAckSchema } from "@/features/feedback/constants/feedback-options";
import type { FeedbackRating, FeedbackSource } from "@/features/feedback/constants/feedback-options";
import { hasAnsweredFeedback, markFeedbackAnswered } from "@/features/feedback/services/session";

interface NextActionFeedbackSectionProps {
  /** 設置箇所。支援先一覧末尾は "support-results"、相談メモ完成後は "result-prepare"。 */
  source: FeedbackSource;
}

type RatingStatus = "unanswered" | "sending" | "error" | "answered";

// sessionStorage はこのコンポーネントの外部から変化しうる同期ストアなので、
// `useEffect` 内で setState するより `useSyncExternalStore` で読むのが素直
// (SSR/ハイドレーション安全、`ResumeBanner.tsx` と同じパターンを踏襲)。
// 本コンポーネントの外から更新される契機は無いため subscribe は no-op でよい。
function subscribeToFeedbackSession() {
  return () => {};
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * 「このページで、次に何をすればよいか分かりましたか？」の3択評価ウィジェット。
 *
 * `FacilityResultsView`(支援先一覧、末尾常設)と `PreparePanel`(相談メモ完成後、
 * `step === "result"`)の2箇所に設置される。モーダル・ダイアログは使わず、ページ内の
 * 控えめなセクションとして描画する。
 *
 * 同一セッションでの二重集計は `session.ts`(sessionStorage、キー `nd-feedback-answered`)
 * で防ぐ: どちらか一方で既に回答していれば、もう一方は自分自身で判定して何も描画しない。
 * `getServerSnapshot` は常に false(未回答)を返すため、サーバー側の初回描画と
 * クライアント側の初回描画が一致し、ハイドレーション不整合を避ける。マウント後は
 * `useSyncExternalStore` が sessionStorage の実際の値で同期する。
 *
 * 非表示判定は `hasAnswered && ratingStatus === "unanswered"`(このコンポーネント自身の
 * フローが始まる前から既に回答済みだった場合のみ隠す)。`hasAnswered` 単独で判定すると、
 * 自分自身の `sendRating` 成功で `markFeedbackAnswered()` を呼んだ直後に親が何らかの理由で
 * 再レンダーされた際(例: `FacilityResultsView` の `viewMode` 切替)、`useSyncExternalStore` が
 * 再評価されて `hasAnswered` が true になり、表示中のサンクス・内訳質問・コメントフォームが
 * 丸ごと消えてしまう実バグがあった。`NextActionFeedbackSection`/`FeedbackFlow` は1コンポーネント
 * に統合し(以前は親子分離していたためこのバグの温床になっていた)、フックはすべて条件付き
 * return より前で呼ぶ。
 */
export function NextActionFeedbackSection({ source }: NextActionFeedbackSectionProps) {
  const hasAnswered = useSyncExternalStore(subscribeToFeedbackSession, hasAnsweredFeedback, getServerSnapshot);
  const [ratingStatus, setRatingStatus] = useState<RatingStatus>("unanswered");
  const [selectedRating, setSelectedRating] = useState<FeedbackRating | null>(null);
  const headingId = useId();

  async function sendRating(rating: FeedbackRating) {
    setSelectedRating(rating);
    setRatingStatus("sending");
    const result = await postJson("/api/feedback", { kind: "rating", source, rating }, FeedbackAckSchema);

    if (!result.ok) {
      setRatingStatus("error");
      return;
    }

    markFeedbackAnswered();
    setRatingStatus("answered");
  }

  function handleRetry() {
    if (selectedRating) void sendRating(selectedRating);
  }

  if (hasAnswered && ratingStatus === "unanswered") return null;

  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        このページで、次に何をすればよいか分かりましたか？
      </h2>

      {ratingStatus !== "answered" && (
        <SingleChoiceButtonGroup
          legend="3段階から選んで回答する"
          legendClassName="sr-only"
          options={FEEDBACK_RATING_OPTIONS}
          selectedValue={selectedRating}
          onSelect={(value) => void sendRating(value)}
          disabled={ratingStatus === "sending"}
        />
      )}

      {ratingStatus === "error" && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-destructive">送信できませんでした。もう一度お試しください。</p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleRetry}>
            もう一度送信する
          </Button>
        </div>
      )}

      {ratingStatus === "answered" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">ご回答ありがとうございます。サービス改善に活用します。</p>

          {selectedRating === "unclear" && <FeedbackUnclearReasonPicker source={source} />}

          <FeedbackCommentForm source={source} />
        </div>
      )}
    </section>
  );
}
