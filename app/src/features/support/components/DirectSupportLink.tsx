import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { SUPPORT_DIRECT_HREF } from "@/features/support/constants/direct-support-link";

/**
 * トップ画面の入口「チェックをせずに支援窓口をさがす」(TICKET-0038)。
 *
 * すでに困りごとの見当がついていてセルフチェックを必要としない利用者(急ぎで窓口を
 * 知りたい保護者・当事者)向けに、30問のセルフチェックを経由せず `/support`
 * (相談分野タグ無し=全件マッチ)へ直接遷移できるようにする。
 *
 * T-01策定時は主導線(はじめる/`StartSurveyButton`)より明確に控えめな見た目とする方針
 * だったが、公共サービスとして「チェックをしなくても支援につながれる」ことの重要性を
 * 踏まえ、`src/app/page.tsx` の「どちらから始めますか?」の対等な問いかけと整合するよう
 * `StartSurveyButton` と同格の見た目(カード背景・ボタン variant とも揃える)に変更した。
 *
 * 需要痕跡計測(TICKET-0034)は既存のトップ画面計測(`PageReachTracker screen="top"`)を
 * 踏襲するのみとし、このリンク自体には計測を追加しない(AC-5: 二重計測を避ける)。
 */
export function DirectSupportLink() {
  return (
    <Link
      href={SUPPORT_DIRECT_HREF}
      className={`${buttonVariants({ variant: "default", size: "lg" })} w-full max-w-xs`}
    >
      相談先・支援情報を探す
    </Link>
  );
}
