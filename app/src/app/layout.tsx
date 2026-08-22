import type { Metadata } from "next";
import { AppNavigationTracker } from "@/components/common/AppNavigationTracker";
import { CrisisFooter } from "@/components/common/CrisisFooter";
import { SiteFooterNav } from "@/components/common/SiteFooterNav";
import { SELF_UNDERSTANDING_MAP_URL } from "@/lib/assets/static-assets";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

/**
 * TICKET-0031: サイト共通のタイトル・説明文。openGraph/twitter で同一の文言を使い回すことで、
 * 非診断・傾向表現トーン(NFR-51)の重複管理を避ける。
 * この文言は結果データに一切依存しない固定文言であり、共有 URL(`#r=...`)ごとに変化しない
 * (`#r=...` はサーバーへ送信されないため、動的な差し替え自体が技術的に不可能。TICKET-0031 背景参照)。
 *
 * `<title>`(タブ・検索結果に表示される PAGE_TITLE)だけは SITE_TITLE と分離する。
 * SNS カードの og:title/twitter:title は多少長くても表示上問題ないが、ブラウザタブや
 * 検索結果は表示幅が狭く SITE_TITLE の全文だと途中で切れてしまうため。
 */
const SITE_TITLE = "Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに";
const PAGE_TITLE = "Trait Compass | 発達特性と支援情報";
const SITE_DESCRIPTION =
  "発達特性と困りごとを整理し、支援への道しるべになる、ブラウザで完結する日常の困りごとチェック。診断ではなく、傾向を知るための目安を提供します。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_TITLE,
    images: [
      {
        url: SELF_UNDERSTANDING_MAP_URL,
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SELF_UNDERSTANDING_MAP_URL],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {/*
         * スキップリンク(NFR-46): キーボード・スクリーンリーダー利用者が、ページ共通の
         * 案内を読み飛ばして本文(各 <main id="main-content">)へ直接移動できるようにする。
         * 通常は視覚的に隠し(sr-only)、キーボードフォーカスを受けたときのみ表示する。
         */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
        >
          本文へスキップ
        </a>
        <AppNavigationTracker />
        {children}
        {/*
         * 危機時の常設静的リンク(TICKET-0041)。`{children}`(各画面の
         * <main id="main-content">)の外側・後に配置する通常フロー要素のため、
         * 各画面のスキップリンク到達先や本文構造には影響しない(AC-6)。
         */}
        <CrisisFooter />
        {/*
         * サイト共通の補助リンク(プロジェクト紹介・プライバシーポリシー・利用規約)。
         * 全ページから到達できる必要があるため layout に置く。
         */}
        <SiteFooterNav />
      </body>
    </html>
  );
}
