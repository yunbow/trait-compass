"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveResult } from "@/features/history/services/history-store";
import { isHistoryEnabled, setHistoryEnabled } from "@/features/history/services/settings";
import type { ShareData } from "@/features/result/services/share-codec";

type SaveUiStep = "idle" | "consent" | "saving" | "saved" | "failed";

interface HistorySaveSectionProps {
  /**
   * 保存対象データ。`ShareData`(share-codec.ts)と同形(カテゴリ別スコア・特性別
   * スコア・gray-zone件数・重なり件数のみ)であり、回答生値・自由記述はそもそも
   * 渡しようがない(AC-2)。
   */
  resultData: ShareData;
}

/**
 * 結果画面の「この結果を履歴に保存」導線(TICKET-0025)。
 * 自分の結果表示時のみ描画する(共有閲覧時は `ResultView` 側で表示しない、AC-1)。
 *
 * - FR-051: 履歴保存は結果画面での明示的な保存操作があった場合のみ実行する。
 * - NFR-36/NFR-37 の趣旨(完全オプトイン・共有端末での事故防止): 設定
 *   (`historyEnabled`)が OFF のままボタンを押した場合、「保存する」の1タップには
 *   畳み込まず、まず「設定で無効になっている」ことを明示したうえで同意を取り、
 *   同意した場合のみ設定を ON にしてから保存する。
 */
export function HistorySaveSection({ resultData }: HistorySaveSectionProps) {
  const [step, setStep] = useState<SaveUiStep>("idle");

  async function performSave() {
    setStep("saving");
    const ok = await saveResult(resultData);
    setStep(ok ? "saved" : "failed");
  }

  function handleSaveClick() {
    if (isHistoryEnabled()) {
      void performSave();
      return;
    }
    setStep("consent");
  }

  function handleConsent() {
    setHistoryEnabled(true);
    void performSave();
  }

  function handleCancelConsent() {
    setStep("idle");
  }

  return (
    // 保存成功/失敗のフィードバックをスクリーンリーダーにも伝える(ShareUrlSection と同じ方針)。
    <section aria-live="polite" className="flex w-full max-w-xs flex-col items-center gap-3">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleSaveClick}>
          <Archive aria-hidden="true" />
          この結果を履歴に保存
        </Button>
      )}

      {step === "consent" && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-4 text-left text-sm">
          <p className="font-semibold text-foreground">履歴保存は設定で無効になっています。</p>
          <p className="text-muted-foreground">
            有効にして保存しますか?共有端末で利用している場合は、有効にする前によくご確認ください。
          </p>
          <div className="flex flex-col gap-2">
            <Button type="button" size="lg" className="w-full" onClick={handleConsent}>
              <CheckCircle aria-hidden="true" />
              有効にして保存する
            </Button>
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleCancelConsent}>
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {step === "saving" && <p className="text-sm text-muted-foreground">保存しています…</p>}
      {step === "saved" && (
        <div className="flex flex-col gap-1 text-center text-sm">
          <p className="text-muted-foreground">履歴に保存しました。</p>
          <Link href="/history" className="font-medium text-primary underline underline-offset-4">履歴を見る</Link>
        </div>
      )}
      {step === "failed" && (
        <p className="text-sm text-destructive">履歴の保存に失敗しました。もう一度お試しください。</p>
      )}
    </section>
  );
}
