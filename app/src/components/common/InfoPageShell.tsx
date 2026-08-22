import type { ReactNode } from "react";

import { SmartBackLink } from "@/components/common/SmartBackLink";
import { cn } from "@/lib/utils";

interface InfoPageShellProps {
  /**
   * `history.back()` が使えない場合(直接アクセス・ブックマーク等)の戻り先
   * (各ページが `resolveBackHref` で検証済みの相対パス)。ブラウザ履歴があれば
   * この値に関係なく `history.back()` で実際の遷移元へ戻る(`SmartBackLink`)。
   */
  backHref: string;
  /** ヒーローの小見出し(例: "TERMS OF USE")。 */
  eyebrow: string;
  /** h1 の文言。 */
  title: string;
  /** h1 直下のリード文。 */
  lead: string;
  /** リード文の下に差し込む追加要素(最終更新日・要点ピル等)。無い画面では省略する。 */
  heroExtra?: ReactNode;
  /** `<main>` のレイアウト微差(max-w / gap / py)のみを上書きする。既定は max-w-2xl・gap-6・py-12。 */
  className?: string;
  children: ReactNode;
}

/**
 * 情報系ページ(/about・/help・/guide・/settings・/privacy・/terms)共通の画面枠。
 * `<main id="main-content" tabIndex={-1}>`(スキップリンクの着地点、NFR-46)と戻る導線、
 * ヒーロー見出しの3点セットが6画面でクラス列まで一致していたため集約する。
 *
 * 免責表示(`DisclaimerNotice`)はここに含めない: 表示する画面(/about・/help・/guide)と
 * しない画面(/privacy・/terms・/settings)があり、位置も画面ごとに異なるため、
 * 各ページ側の children に残す(DisclaimerNotice は単一情報源のまま)。
 */
export function InfoPageShell({ backHref, eyebrow, title, lead, heroExtra, className, children }: InfoPageShellProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12", className)}
    >
      <SmartBackLink fallbackHref={backHref}>前の画面に戻る</SmartBackLink>
      <header className="rounded-xl border border-primary/25 bg-primary/5 px-5 py-6 sm:px-6">
        <p className="text-xs font-semibold tracking-wide text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{lead}</p>
        {heroExtra}
      </header>
      {children}
    </main>
  );
}
