"use client";

import { useState } from "react";
import { Copy, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { CATEGORY_KEYS } from "@/features/survey/schema/question";

import { buildShareHash } from "@/features/result/services/share-codec";
import type { ShareData } from "@/features/result/services/share-codec";

type ShareUiStep = "idle" | "previewing" | "shared";
type CopyStatus = "idle" | "copied" | "failed";

interface ShareUrlSectionProps {
  shareData: ShareData;
}

function buildAbsoluteShareUrl(hash: string): string {
  if (typeof window === "undefined") {
    return hash;
  }
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/**
 * 「共有 URL を作成」ボタン〜プレビュー〜発行〜解除までの一連の UI(TICKET-0009)。
 *
 * - AC-1: マウント時・表示時に自動でハッシュを生成しない(この関数の外で `location.hash` を
 *   一切書き換えないため、押下しない限り副作用が発生しない)。
 * - AC-2/AC-3: 押下後はまずプレビュー(含む/含まない内容の明記 + 実際のスコア値)を表示し、
 *   自由記述・地域情報は `ShareData` 自体に存在しないため表示しようがない。特性別スコア
 *   (ASD/ADHD/LD/DCD の診断カテゴリ名+パーセンテージの併記)は送信者自身のプレビューにも
 *   表示しない(`share-codec.ts` の `toShareData()` が常に null で埋めるため、そもそも
 *   実データが渡ってこない)。
 * - AC-4: プレビュー画面の「URL を発行してコピー」を押した時点で初めて
 *   `history.replaceState` を呼び、`#r=...` を書き込む。
 * - AC-5: 「共有をやめる」でハッシュを除去する(ブラウザ履歴は汚さない)。
 */
export function ShareUrlSection({ shareData }: ShareUrlSectionProps) {
  const [step, setStep] = useState<ShareUiStep>("idle");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function handleStartPreview() {
    setStep("previewing");
    setCopyStatus("idle");
  }

  function handleCancelPreview() {
    setStep("idle");
  }

  async function handlePublish() {
    const hash = buildShareHash(shareData);
    window.history.replaceState(null, "", hash);
    const url = buildAbsoluteShareUrl(hash);
    setShareUrl(url);
    setStep("shared");

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function handleStopSharing() {
    window.history.replaceState(null, "", window.location.pathname);
    setStep("idle");
    setShareUrl(null);
    setCopyStatus("idle");
  }

  return (
    // idle → previewing → shared のステップ切替をスクリーンリーダーにも伝える(NFR-43)。
    <section aria-live="polite" className="flex w-full max-w-xs flex-col items-center gap-3">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleStartPreview}>
          <Share2 aria-hidden="true" />
          共有 URL を作成
        </Button>
      )}

      {step === "previewing" && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-4 text-left text-sm">
          <p className="font-semibold text-foreground">共有 URL のプレビュー</p>
          <p className="text-muted-foreground">
            含まれる内容: カテゴリ別スコアのみです。
          </p>
          <p className="text-muted-foreground">
            含まれない内容: 自由記述・回答内容・お住まいの地域は一切含まれません。
          </p>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">カテゴリ別スコア</p>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-foreground">
              {CATEGORY_KEYS.map((category) => (
                <li key={category}>
                  {CATEGORY_LABELS[category]}: {shareData.categoryScores[category] ?? "未算出"}
                  {shareData.categoryScores[category] !== null ? "%" : ""}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-1 flex flex-col gap-2">
            <Button type="button" size="lg" className="w-full" onClick={handlePublish}>
              <Copy aria-hidden="true" />
              URL を発行してコピー
            </Button>
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleCancelPreview}>
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {step === "shared" && shareUrl && (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-4 text-left text-sm">
          <p className="font-semibold text-foreground">共有 URL を発行しました</p>
          <p className="text-muted-foreground">
            {copyStatus === "copied"
              ? "クリップボードにコピーしました。"
              : "クリップボードへのコピーに失敗しました。下の URL を手動でコピーしてください。"}
          </p>
          <p className="text-xs text-muted-foreground">すでに相手へ送ったリンク自体を取り消すことはできません。</p>
          <p className="break-all rounded border border-border bg-muted px-2 py-1 text-xs text-foreground">
            {shareUrl}
          </p>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleStopSharing}>
            <X aria-hidden="true" />
            共有をやめる
          </Button>
        </div>
      )}
    </section>
  );
}
