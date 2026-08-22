import Link from "next/link";

import { ExternalTextLink } from "@/components/common/ExternalTextLink";
import { UnofficialServiceNotice } from "@/components/common/UnofficialServiceNotice";

/**
 * 全画面共通のフッター相当ナビ(`app/layout.tsx` の `<CrisisFooter />` の直後に描画)。
 * `CrisisFooter` が body 直下の `<footer>`(contentinfo ランドマーク)のため、もう一つ
 * `<footer>` を置くと axe-core の landmark-unique に抵触する。そのため `<nav>` にしている。
 * トップ画面固有だった「プロジェクトについて」の外部リンクと「設定」導線(TICKET-0027 AC-4)を
 * ここに集約し、全画面から同じフッター1つで到達できるようにする。
 * リンク数が多く情報過多になるため、サイト内リンクと外部リンクの2段構成にする
 * (段間は罫線を引かず、`gap-3` の余白のみで区切る)。
 * 自治体二次利用許諾の非公式表記・免責条件に対応するため、全ページ共通で表示する。
 */
export function SiteFooterNav() {
  return (
    <nav aria-label="サイトの補助情報" className="bg-background px-6 pb-4">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center text-xs text-muted-foreground">
        <Link
          href="/"
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Trait Compass
        </Link>
        <UnofficialServiceNotice />
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          <Link
            href="/about"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            このプロジェクトについて
          </Link>
          <Link
            href="/help"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            使い方
          </Link>
          <Link
            href="/guide"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            用語の説明
          </Link>
          <Link
            href="/data-sources"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            利用しているデータ
          </Link>
          <Link
            href="/outcomes"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            成果・利用状況
          </Link>
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            プライバシーポリシー
          </Link>
          <Link
            href="/terms"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            利用規約
          </Link>
          <Link
            href="/settings"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            設定
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          <ExternalTextLink href="https://github.com/yunbow/trait-compass">ソースコード</ExternalTextLink>
          <ExternalTextLink href="https://yunbow.github.io/civic-unknot/">プロジェクト公式</ExternalTextLink>
          <ExternalTextLink href="https://odhackathon.metro.tokyo.lg.jp/">東京都知事杯オープンデータ・ハッカソン</ExternalTextLink>
        </div>
      </div>
    </nav>
  );
}
