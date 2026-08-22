"use client";

import { Check, Copy, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { useMemoPrintCopy } from "@/lib/print/use-memo-print-copy";
import { buildPrepareMemoText } from "@/features/prepare/services/memo-text";
import type { PrepareResponse } from "@/features/prepare/schema/prepare";

interface PrepareMemoProps {
  memo: PrepareResponse;
}

/**
 * 相談メモの表示 + 印刷/コピー操作(TICKET-0046 AC-3)。
 *
 * 印刷: `<html>` に `data-print-mode="prepare-memo"` を付与してから `window.print()` を呼び、
 * globals.css の専用印刷スタイル(`[data-prepare-memo-print]` 配下のみを表示)を発火させる。
 * `afterprint` イベント(印刷ダイアログのキャンセルも含めて発火する)で属性を確実に除去する。
 *
 * コピー: `services/memo-text.ts` の `buildPrepareMemoText` で組み立てたプレーンテキストを
 * Clipboard API で書き出す。
 */
export function PrepareMemo({ memo }: PrepareMemoProps) {
  const { copyState, handlePrint, handleCopy } = useMemoPrintCopy({
    getCopyText: () => buildPrepareMemoText(memo),
  });

  return (
    <div className="flex flex-col gap-3">
      <div data-prepare-memo-print className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ProvenanceLabel source="template" />
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-foreground">困りごとの要約</h3>
          <p className="whitespace-pre-line text-foreground">{memo.summary}</p>
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-foreground">伝えるとよいこと</h3>
          <ul className="list-disc pl-5 text-foreground">
            {memo.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-foreground">当日の流れ/持ち物</h3>
          <ul className="list-disc pl-5 text-foreground">
            {memo.flow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="font-semibold text-foreground">聞いておきたいこと候補</h3>
          <ul className="list-disc pl-5 text-foreground">
            {memo.questions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {memo.facilities.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-semibold text-foreground">窓口候補</h3>
            <ul className="flex flex-col gap-2">
              {memo.facilities.map((facility) => (
                <li key={facility.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-foreground">{facility.name}</p>
                  {facility.address && <p className="text-xs text-muted-foreground">{facility.address}</p>}
                  {facility.phone && <p className="text-xs text-muted-foreground">{facility.phone}</p>}
                  {facility.url && (
                    <a href={facility.url} className="text-xs text-primary underline" rel="noreferrer" target="_blank">
                      {facility.url}
                    </a>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{facility.sourceCredit}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {memo.isFallback && memo.fallbackMessage && (
          <p className="text-xs text-muted-foreground">{memo.fallbackMessage}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <Button type="button" size="lg" className="w-full" onClick={handleCopy}>
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyState === "copied" ? "コピーしました" : "コピーする"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handlePrint}>
          <Printer aria-hidden="true" />
          印刷する
        </Button>
      </div>
      {copyState === "copied" && <p className="text-xs text-muted-foreground print:hidden">メッセージやメールに貼り付けて使えます。</p>}
      {copyState === "error" && (
        <p className="text-xs text-destructive print:hidden">コピーに失敗しました。お使いのブラウザの設定をご確認ください。</p>
      )}
    </div>
  );
}
