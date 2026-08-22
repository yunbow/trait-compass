"use client";

import { useEffect, useRef } from "react";

import { GhostBackLink } from "@/components/common/GhostBackLink";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { CATEGORY_KEYS, type CategoryKey } from "@/features/survey/schema/question";
import { prefersReducedMotion } from "@/lib/utils";

/** 通常時のトランジション表示時間(1〜1.5秒、FR-014)。 */
const TRANSITION_DURATION_MS = 1300;
/** reduced-motion 時の表示時間。事前告知(NFR-43)の意図は保ちつつ短く切り上げる(NFR-41)。 */
const REDUCED_MOTION_DURATION_MS = 400;

interface CategoryTransitionProps {
  /** これから始まるカテゴリ。 */
  nextCategory: CategoryKey;
  /** 自動遷移またはスキップ操作で呼ばれる。 */
  onDone: () => void;
}

/**
 * カテゴリの変わり目に挟む一呼吸トランジション画面(FR-014)。
 *
 * - 次カテゴリ名を表示して「事前告知」として機能させる(NFR-43: レイアウト変化の予告)。
 * - 1〜1.5秒後に自動で本編へ進むが、タイムアウトによる強制ではなく「すぐ進む」操作で
 *   いつでもスキップできる(NFR-42: タイマー・カウントダウン表示は行わない。単なる
 *   自動遷移であり、残り時間の提示や催促は一切ない)。
 * - アニメーションは opacity のフェードのみ(globals.css の `.nd-fade-in`)とし、
 *   `prefers-reduced-motion: reduce` 環境では CSS 側で無効化される(NFR-41)。
 */
export function CategoryTransition({ nextCategory, onDone }: CategoryTransitionProps) {
  const nextCategoryIndex = CATEGORY_KEYS.indexOf(nextCategory) + 1;
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    // 最新の onDone を ref に反映する(render 中に ref を書き換えるとエラーになるため
    // effect 内で行う)。deps を指定しないことで毎レンダー後に実行する。
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const duration = prefersReducedMotion() ? REDUCED_MOTION_DURATION_MS : TRANSITION_DURATION_MS;
    const timer = window.setTimeout(() => onDoneRef.current(), duration);
    return () => window.clearTimeout(timer);
    // nextCategory が変わるたびにタイマーを張り直す。
  }, [nextCategory]);

  return (
    // 背景の bg-background 自体には nd-fade-in(opacity アニメーション)を適用しない。
    // このコンポーネントは SurveyRunner の描画をまるごと置き換える(fixed のため通常フローに
    // 高さを持たない)ため、フェード中に背景が半透明になると、高さが縮んだ <main> の下に
    // ある共通フッター(CrisisFooter/SiteFooterNav)がヘッダー位置に透けて見えてしまう。
    // 背景は最初から完全不透明にし、フェードは内側のコンテンツだけに適用する。
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col bg-background px-6 py-8 sm:py-12"
    >
      <div className="nd-fade-in flex flex-1 flex-col">
        <GhostBackLink href="/">中断してトップへ戻る</GhostBackLink>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-sm text-muted-foreground">
            次のカテゴリ {nextCategoryIndex} / {CATEGORY_KEYS.length}
          </p>
          <h2 className="text-xl font-bold text-foreground">{CATEGORY_LABELS[nextCategory]}</h2>
          <Button type="button" variant="outline" size="lg" onClick={() => onDoneRef.current()}>
            すぐ進む
          </Button>
        </div>
      </div>
    </div>
  );
}
