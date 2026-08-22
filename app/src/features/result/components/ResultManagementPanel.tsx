"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { HistorySaveSection } from "@/features/history/components/HistorySaveSection";
import { ShareUrlSection } from "@/features/result/components/ShareUrlSection";
import type { ShareData } from "@/features/result/services/share-codec";

interface ResultManagementPanelProps {
  shareData: ShareData;
  onRestart: () => void;
}

/** 結果の保管・共有・やり直しを、目的と影響範囲ごとに分けて表示する。 */
export function ResultManagementPanel({ shareData, onRestart }: ResultManagementPanelProps) {
  const [isRestartConfirming, setIsRestartConfirming] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-5">
      <section aria-labelledby="result-storage-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 id="result-storage-heading" className="text-base font-semibold text-foreground">保存・共有</h3>
          <p className="mt-1 text-sm text-muted-foreground">端末に残すか、結果の一部だけをリンクで共有できます。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <h4 className="text-sm font-semibold text-foreground">この端末に保存</h4>
            <p className="text-xs text-muted-foreground">回答内容そのものは保存しません。共有端末では利用前にご確認ください。</p>
            <HistorySaveSection resultData={shareData} />
          </article>
          <article className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <h4 className="text-sm font-semibold text-foreground">リンクで共有</h4>
            <p className="text-xs text-muted-foreground">発行前に、共有される内容を確認できます。</p>
            <ShareUrlSection shareData={shareData} />
          </article>
        </div>
      </section>

      <section aria-labelledby="result-restart-heading" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <h3 id="result-restart-heading" className="text-base font-semibold text-foreground">回答をやり直す</h3>
          <p className="mt-1 text-sm text-muted-foreground">この端末の回答の途中経過を削除して、最初からチェックします。</p>
        </div>
        {!isRestartConfirming ? (
          <Button type="button" variant="outline" size="lg" className="w-full sm:w-fit" onClick={() => setIsRestartConfirming(true)}>
            <RotateCcw aria-hidden="true" />
            回答をやり直す
          </Button>
        ) : (
          <div role="alertdialog" aria-label="回答をやり直す確認" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="font-semibold text-foreground">回答の途中経過を削除して、最初から始めますか？</p>
            <p className="text-muted-foreground">この操作は元に戻せません。保存済みの履歴は削除されません。</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="destructive" size="lg" onClick={onRestart}>削除して最初から始める</Button>
              <Button type="button" variant="outline" size="lg" onClick={() => setIsRestartConfirming(false)}>キャンセル</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
