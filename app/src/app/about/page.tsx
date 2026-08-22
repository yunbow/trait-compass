import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ClipboardList, NotebookPen, Search, ShieldCheck } from "lucide-react";

import { AnchorNav } from "@/components/common/AnchorNav";
import { resolveBackHref } from "@/components/common/report-form/back-href";
import { ContentSection } from "@/components/common/ContentSection";
import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { ExternalTextLink } from "@/components/common/ExternalTextLink";
import { InfoPageShell } from "@/components/common/InfoPageShell";

export const metadata: Metadata = {
  title: "このプロジェクトについて | Trait Compass",
  description:
    "Trait Compass は、アカウント登録なしで使える、日常の困りごとと相談先を整理するサービスです。開発の背景・できること・データの出典・連絡先を紹介します。",
};

const ABOUT_NAV_ITEMS = [
  { href: "#about-what", label: "できること" },
  { href: "#about-not", label: "利用上の注意" },
  { href: "#about-background", label: "背景" },
  { href: "#about-sources", label: "データの出典" },
  { href: "#about-contact", label: "お問い合わせ" },
] as const;

interface AboutPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

/**
 * `back` クエリ(遷移元のURL)を `resolveBackHref`(オープンリダイレクト対策込み、
 * /guide と共通)で検証し、「トップに戻る」固定ではなく遷移元に応じた戻り先にする
 * (未指定時はトップへ戻る)。/privacy・/terms・共通フッターなど複数の入口から
 * 到達するため、/guide/page.tsx と同じパターンを踏襲する。
 */
export default async function AboutPage({ searchParams }: AboutPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="ABOUT TRAIT COMPASS"
      title="このプロジェクトについて"
      lead="Trait Compass は、「何に困っているのか」「どこへ相談すればよいのか」を整理し、東京都や区市町村の支援情報への橋渡しをするサービスです。"
      heroExtra={
        <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />診断・判定はしません</li>
          <li className="flex items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground"><ClipboardList aria-hidden="true" className="size-4 shrink-0 text-primary" />登録なしで使えます</li>
          <li className="flex items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-foreground"><Search aria-hidden="true" className="size-4 shrink-0 text-primary" />相談先を探せます</li>
        </ul>
      }
    >
      <AnchorNav label="このページの目次" items={ABOUT_NAV_ITEMS} />

      <DisclaimerNotice variant="top" />

      <ContentSection anchorId="about-what" title="できること">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ActionCard href="/survey" icon={<ClipboardList aria-hidden="true" className="size-5" />} title="困りごとを整理する" description="全30問のチェックで、気になる領域を整理できます。途中から再開することもできます。" label="チェックを開く" />
          <ActionCard href="/support" icon={<Search aria-hidden="true" className="size-5" />} title="相談先・支援情報を探す" description="年齢・地域・相談したいことから、相談窓口や支援制度などを探せます。チェックは不要です。" label="相談先を探す" />
          <ActionCard href="/result/prepare" icon={<NotebookPen aria-hidden="true" className="size-5" />} title="相談の準備をする" description="チェック後に、相談先へ伝えたい内容を整理したメモを作成できます。" label="相談メモを作る（チェック後）" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          チェックはアカウント登録なしで利用でき、回答・集計・結果表示はブラウザ内で処理します。支援情報の検索や任意の AI 機能を利用した場合のみ、必要な情報を外部サービスへ送信します。
        </p>
      </ContentSection>

      <ContentSection anchorId="about-not" title="このサービスがしないこと" tone="accent" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>発達障害などについての医学的な判断</li>
          <li>医療機関の代わりとなる助言</li>
          <li>利用すべき支援制度の決定</li>
          <li>緊急時の相談対応</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">
          気になることがある場合は、本サービスに表示される公的相談窓口や医療機関等へご相談ください。
        </p>
      </ContentSection>

      <section aria-labelledby="about-background" className="rounded-lg border border-border bg-card p-4">
        <h2 id="about-background" className="text-base font-semibold text-foreground">背景</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          困りごとを感じていても、「これは何の困りごとなのか」「どこへ相談すればよいのか」が分からず、支援情報にたどり着けないことがあります。
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Trait Compass は、病名を起点に探すのではなく、日常の困りごと・年齢・地域・相談したいことを手がかりに、次に取れる行動や支援情報へつなぐことを目指しています。
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          支援情報には東京都のオープンデータを活用しており、東京都知事杯オープンデータ・ハッカソン 2026 への応募作品として開発しました。
        </p>
      </section>

      <section aria-labelledby="about-sources" className="rounded-lg border border-border bg-card p-4">
        <h2 id="about-sources" className="text-base font-semibold text-foreground">データの出典</h2>
        <dl className="mt-2 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">支援情報</dt>
            <dd className="mt-0.5 text-muted-foreground">東京都・区市町村等が公開しているオープンデータ、公式Webサイト等の公開情報をもとに掲載しています。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">手動で収集した情報</dt>
            <dd className="mt-0.5 text-muted-foreground">オープンデータとして提供されていない学校情報などは、自治体等の公式情報を確認して独自に整理しています。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">各情報の確認</dt>
            <dd className="mt-0.5 text-muted-foreground">可能な範囲で、情報ごとに出典と最終確認日を表示しています。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">日常の困りごとチェック</dt>
            <dd className="mt-0.5 text-muted-foreground">設問は本プロジェクトで独自に作成したものであり、ASRS・AQ・RAADS 等の既存の心理尺度は使用していません。</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          掲載しているデータの一覧と利用目的は
          <Link href="/data-sources" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            「利用しているデータ」のページ
          </Link>
          で公開しています。
        </p>
      </section>

      <section aria-labelledby="about-links" className="border-t border-border pt-3">
        <h2 id="about-links" className="text-sm font-semibold text-foreground">関連リンク</h2>
        <nav aria-label="プロジェクトの関連リンク" className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
          <Link
            href="/outcomes"
            className="w-fit underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Trait Compass の成果
          </Link>
          <ExternalTextLink href="https://github.com/yunbow/trait-compass" className="w-fit">
            ソースコード（GitHub）
          </ExternalTextLink>
          <ExternalTextLink href="https://yunbow.github.io/civic-unknot/" className="w-fit">
            プロジェクト公式サイト
          </ExternalTextLink>
          <ExternalTextLink href="https://odhackathon.metro.tokyo.lg.jp/" className="w-fit">
            東京都知事杯オープンデータ・ハッカソン
          </ExternalTextLink>
        </nav>
      </section>

      <section aria-labelledby="about-contact" className="border-t border-border pt-3">
        <h2 id="about-contact" className="text-sm font-semibold text-foreground">ご意見・お問い合わせ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trait Compass をより正確で使いやすいサービスにするため、情報の訂正やご意見を受け付けています。
        </p>
        <dl className="mt-2 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">掲載情報について</dt>
            <dd className="mt-0.5 text-muted-foreground">相談先・学校情報等のカードにある「掲載情報の誤りを報告」からお知らせください。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">ご意見・不具合の報告</dt>
            <dd className="mt-0.5 text-muted-foreground">
              本アプリは自治体の公式アプリではなく、CivicUnknot が独自に開発・運営しています。本プロジェクトは専用フォームを設けていないため、
              <ExternalTextLink href="https://github.com/yunbow/trait-compass/issues">GitHub の Issue</ExternalTextLink>
              をご利用ください。
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="about-license" className="border-t border-border pt-3">
        <h2 id="about-license" className="text-sm font-semibold text-foreground">ライセンス</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          本サービスのソースコードは MIT License のもとで公開しています。Copyright (c) 2026 yunbow.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ご利用にあたっての条件は{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            利用規約
          </Link>
          {" "}を、情報の取り扱いは{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            プライバシーポリシー
          </Link>
          {" "}をご確認ください。
        </p>
      </section>
    </InfoPageShell>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  label,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  label: string;
}) {
  return (
    <Link href={href} className="group rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <span className="text-primary">{icon}</span>
        <h3>{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4">
        {label}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
