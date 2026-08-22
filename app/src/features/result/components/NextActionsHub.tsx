"use client";

import Link from "next/link";
import { MapPin, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";

interface NextActionsHubProps {
  /** 今回の結果から組み立てた、相談先検索への遷移先。 */
  supportHref?: string;
  /** 相談先検索に引き継ぐ相談分野。 */
  supportTags?: SupportTag[];
  /** 途中回答の場合は、回答を続ける導線も表示する。 */
  isPartial?: boolean;
}

/**
 * 引き継ぐ相談分野タグのうち、ピルとして表示する最大件数。
 * 全件をそのまま並べると「ほぼ全部選ばれている」ように見えてしまうため、上位のみを
 * 表示し残りは「+N件」でまとめる(検索自体は supportHref に含まれる全タグで行う。
 * これはあくまで表示の絞り込みで、検索条件を狭めるものではない)。
 */
const VISIBLE_SUPPORT_TAG_COUNT = 3;

/** 結果の直後に、相談先検索と相談準備の次の行動をまとめて示す。 */
export function NextActionsHub({ supportHref = "/support", supportTags = [], isPartial = false }: NextActionsHubProps) {
  const visibleTags = supportTags.slice(0, VISIBLE_SUPPORT_TAG_COUNT);
  const hiddenTagCount = supportTags.length - visibleTags.length;

  return (
    <section aria-labelledby="next-actions-heading" className="flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4 text-left">
      <div>
        <h2 id="next-actions-heading" className="text-base font-semibold text-foreground">次にできること</h2>
        <p className="mt-1 text-sm text-muted-foreground">必要なものだけ選んでください。どれも任意です。</p>
      </div>

      {isPartial && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-foreground">より詳しく整理するなら</p>
          <p className="mt-1 text-xs text-muted-foreground">回答を続けると、確認できる領域が増えます。</p>
          <Button render={<Link href="/survey" />} nativeButton={false} variant="outline" size="lg" className="mt-3 w-full">
            回答を続ける
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-primary/30 bg-card p-3">
        <p className="text-sm font-semibold text-foreground">今すぐ相談先を探すなら</p>
        <p className="mt-1 text-xs text-muted-foreground">回答内容を、相談先を探しやすい分野に置き換えて引き継ぎます。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {visibleTags.length > 0 ? (
            <>
              {visibleTags.map((tag) => (
                <span key={tag} className="rounded-full border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-primary">{tag}</span>
              ))}
              {hiddenTagCount > 0 && (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">+{hiddenTagCount}件</span>
              )}
            </>
          ) : <span className="text-sm text-muted-foreground">全般</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">相談分野は次の画面で変更できます。</p>
        <Button render={<Link href={supportHref} />} nativeButton={false} size="lg" className="mt-3 w-full">
          <MapPin aria-hidden="true" />
          地域の相談先を探す
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">相談の準備をする</p>
        <p className="text-xs text-muted-foreground">選択式でも、自由記述のAI整理でも作れます。AIに送信する前に内容を確認できます。</p>
        <Button render={<Link href="/result/prepare" />} nativeButton={false} variant="outline" size="lg" className="w-full">
          <NotebookPen aria-hidden="true" />
          相談時に渡すメモを作る
        </Button>
      </div>
    </section>
  );
}
