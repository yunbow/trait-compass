"use client";

import { useState } from "react";
import type { z } from "zod";

import { postJson } from "@/lib/api/post-json";

/**
 * 掲載情報の訂正・更新報告フォーム(FacilityReportForm / ContentReportForm)共通の送信状態管理。
 *
 * 両フォームは「選択 → 確認(preview) → 送信(sending) → 完了(done) / エラー(error)」という
 * 同一のステップ機と、429 をレート制限文言に出し分ける同一の失敗処理を持つ(完全一致)。
 * 入力項目・カテゴリ固有の分岐・プレビュー表示内容・遷移先(backHref への router.push)は
 * 各フォームに残す。このフックは送信ステートのみを持ち、ルーティングには関与しない。
 */
export type ReportSubmissionStep = "form" | "preview" | "sending" | "done" | "error";

export interface UseReportSubmissionResult {
  step: ReportSubmissionStep;
  /** 直近の送信が 429(レート制限)で失敗したか。エラー表示の文言出し分けに使う。 */
  isRateLimited: boolean;
  goToPreview: () => void;
  goToForm: () => void;
  /** 送信する。呼び出し側はフォーム固有のリクエストボディを組み立てて渡す。 */
  submit: (body: unknown) => Promise<void>;
}

export function useReportSubmission<T>(options: {
  endpoint: string;
  responseSchema: z.ZodType<T>;
}): UseReportSubmissionResult {
  const [step, setStep] = useState<ReportSubmissionStep>("form");
  const [isRateLimited, setIsRateLimited] = useState(false);

  async function submit(body: unknown): Promise<void> {
    setStep("sending");
    const result = await postJson(options.endpoint, body, options.responseSchema);

    if (!result.ok) {
      setIsRateLimited(result.reason === "http-error" && result.status === 429);
      setStep("error");
      return;
    }

    setIsRateLimited(false);
    setStep("done");
  }

  return {
    step,
    isRateLimited,
    goToPreview: () => setStep("preview"),
    goToForm: () => setStep("form"),
    submit,
  };
}
