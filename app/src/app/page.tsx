import Image from "next/image";

import selfUnderstandingMap from "../../assets/images/self-understanding-map.png";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { PageReachTracker } from "@/components/common/PageReachTracker";
import { HistoryTopLink } from "@/features/history/components/HistoryTopLink";
import { DirectSupportLink } from "@/features/support/components/DirectSupportLink";
import { ResumeBanner } from "@/features/survey/components/ResumeBanner";
import { StartSurveyButton } from "@/features/survey/components/StartSurveyButton";
import { requireBetaGateUnlocked } from "@/lib/beta-gate/require-unlock";

/**
 * トップ画面(TICKET-0006)。
 * サーバーコンポーネントとして趣旨説明・免責文言・レイアウトを描画し、
 * localStorage を参照する「続きから」導線は ResumeBanner に、IndexedDB の履歴有無を
 * 参照する「これまでの記録を見る」導線(TICKET-0026)は HistoryTopLink に切り出す
 * (project-structure.md §7: page.tsx はデータパススルーのみ)。
 * 「設定」への導線(TICKET-0027, FR-054, AC-4)は、トップ画面固有ではなく全画面から
 * 到達できるべき導線のため、共通フッター(`components/common/SiteFooterNav.tsx`)に置く。
 * セルフチェックを経由せず支援窓口を直接さがす入口(TICKET-0038)は
 * `DirectSupportLink` に切り出す。「チェックをしなくても支援につながれる」ことは
 * 公共サービスとして重要な特徴のため、「どちらから始めますか?」の対等な問いかけに
 * 合わせ、はじめるブロックと同格の見た目(カード背景・ボタン variant)で置く。
 * 保護者向け注記(TICKET-0040)は、設問(`SurveyRunner.tsx`)が一人称の本人回答前提
 * であることを踏まえ、誤って保護者が本人向けアンケートに回答してしまうケースを避ける
 * ための1行案内。状態を持たない単純な文言のため別コンポーネントに切り出さず、
 * `DirectSupportLink` と同じ遷移先(`SUPPORT_DIRECT_HREF`)を再利用する
 * (ハードコードで二重定義しない)。視覚的な優先度は3カード・主導線より低く、
 * 共通フッターの各リンクと同程度の控えめな扱いにする。
 * クローズドベータのパスワードゲート(`requireBetaGateUnlocked`)もここで呼ぶ
 * (`CLOSED_BETA_PASSWORD` 未設定時は無効、`src/lib/beta-gate/require-unlock.ts` 参照)。
 */
export default async function Home() {
  await requireBetaGateUnlocked();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-6 py-8 sm:justify-center sm:py-12">
      <PageReachTracker screen="top" />
      <section className="relative isolate min-h-64 overflow-hidden rounded-xl border border-border sm:min-h-72">
        <Image
          // R2/MinIO の開発用 URL は閲覧端末ごとの localhost を指してしまうため、
          // トップの装飾画像は Next.js の静的アセットとしてアプリ本体から配信する。
          src={selfUnderstandingMap}
          alt=""
          fill
          priority
          unoptimized
          sizes="(max-width: 672px) calc(100vw - 3rem), 672px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background via-background/90 to-background/15" />
        <div className="relative flex min-h-64 max-w-lg flex-col justify-center gap-3 px-6 py-8 sm:min-h-72 sm:px-8">
          <h1 aria-label="Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに" className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
            <span className="block">Trait Compass</span>
            <span className="mt-1 block text-lg sm:text-xl">— 発達特性と困りごとを整理し、<br />支援への道しるべに</span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-foreground">
            日常で感じる困りごとや周りとの違いをもとに、東京都・お住まいの区市町村の相談先や支援情報を探せます。
          </p>
          <p className="text-xs text-muted-foreground">ご本人・ご家族・支援者の方が利用できます。</p>
        </div>
      </section>

      <section aria-labelledby="start-options-heading" className="flex flex-col gap-3">
        <h2 id="start-options-heading" className="text-center text-base font-semibold text-foreground">どちらから始めますか？</h2>
        <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <div>
            <h3 className="font-semibold text-foreground">困りごとや特性を整理したい</h3>
            <p className="mt-1 text-sm text-muted-foreground">ご本人やお子さんの日常で気になることを整理します。</p>
          </div>
          <StartSurveyButton />
          <p className="text-xs text-muted-foreground">全30問・約5〜10分・途中から再開できます</p>
          <div className="flex flex-col items-center gap-2" aria-label="前回の続き・記録">
            <ResumeBanner />
            <HistoryTopLink />
          </div>
        </section>

        <section className="flex flex-col items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <div>
            <h3 className="font-semibold text-foreground">相談先・支援情報を探したい</h3>
            <p className="mt-1 text-sm text-muted-foreground">年齢・地域・相談したいことから、利用できる支援情報を探します。日常の困りごとチェックをしなくても利用できます。</p>
          </div>
          <DirectSupportLink />
          <p className="text-xs text-muted-foreground">
            お子さんについて相談したい方、ご家族・支援者として相談先を探したい方も、こちらをご利用ください。
          </p>
        </section>
      </section>

      <DisclaimerNotice variant="top" />

      <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <h2 className="font-semibold text-foreground">安心して使うために</h2>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>1画面に1問ずつ表示し、途中から再開できます。</li>
          <li>途中経過はこのブラウザにのみ保存します。</li>
          <li>日常の困りごとチェックの回答は、外部へ送信されません。</li>
          <li>AI を使う任意機能を利用した場合のみ、送信前に確認した内容を外部の生成 AI サービスへ送信します。</li>
        </ul>
      </section>
    </main>
  );
}
