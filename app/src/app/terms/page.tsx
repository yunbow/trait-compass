import type { Metadata } from "next";
import Link from "next/link";
import { Bot, FileText, MessageCircleQuestion, ShieldCheck } from "lucide-react";

import { AnchorNav } from "@/components/common/AnchorNav";
import { resolveBackHref } from "@/components/common/report-form/back-href";
import { ContentSection } from "@/components/common/ContentSection";
import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { InfoPageShell } from "@/components/common/InfoPageShell";

export const metadata: Metadata = {
  title: "利用規約 | Trait Compass",
  description:
    "Trait Compass 本サービスの利用条件・免責事項・ライセンス・サービスの変更や終了について定めた利用規約です。",
};

const TERMS_NAV_ITEMS = [
  { href: "#terms-scope", label: "サービスについて" },
  { href: "#terms-disclaimer", label: "利用時の注意" },
  { href: "#terms-ai", label: "AI機能" },
  { href: "#terms-license", label: "ライセンス" },
  { href: "#terms-law", label: "変更・お問い合わせ" },
] as const;

interface TermsPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

/**
 * `back` クエリ(遷移元のURL)を `resolveBackHref`(オープンリダイレクト対策込み、
 * /about・/help・/guide・/privacy と共通)で検証し、「トップに戻る」固定ではなく
 * 遷移元に応じた戻り先にする(未指定時はトップへ戻る)。
 */
export default async function TermsPage({ searchParams }: TermsPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="TERMS OF USE"
      title="利用規約"
      lead="本ページは、Trait Compass（以下「本サービス」）をご利用いただく際の条件を定めたものです。本サービスが画面上に表示している各オープンデータの提供条件（データセットごとのライセンス）とは別のものです。"
      heroExtra={<p className="mt-4 text-xs text-muted-foreground">最終更新: 2026年8月18日</p>}
    >
      <ContentSection anchorId="terms-summary" title="ご利用前にご確認ください" tone="accent" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
          <li className="rounded-lg bg-background/80 px-3 py-2">本サービスは医療的な診断や助言の代わりにはなりません。</li>
          <li className="rounded-lg bg-background/80 px-3 py-2">支援情報は、利用前に各機関の公式情報もご確認ください。</li>
          <li className="rounded-lg bg-background/80 px-3 py-2">AIが生成する内容は参考情報として扱ってください。</li>
          <li className="rounded-lg bg-background/80 px-3 py-2">個別の医療・福祉相談には、運営者は回答できません。</li>
        </ul>
      </ContentSection>

      <AnchorNav label="利用規約の目次" items={TERMS_NAV_ITEMS} />

      <ContentSection anchorId="terms-scope" title="1. 本サービスの位置づけ" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスは、有志プロジェクト CivicUnknot が開発・運営するものであり、国・東京都・区市町村等の自治体が提供する公式サービスではありません。</li>
          <li>本サービスは、日常で感じる困りごとを整理し、年齢・地域・相談したいことに応じた支援情報を探すための情報提供サービスです。</li>
          <li>医療行為ではなく、医学的な評価を行うものでもありません。医療的な対応が必要かどうかは、医療機関や専門の相談窓口へご相談ください。</li>
        </ul>
        <div className="mt-3">
          <DisclaimerNotice variant="compact" />
        </div>
      </ContentSection>

      <ContentSection anchorId="terms-usage" title="2. 利用条件">
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>どなたでも無償でご利用いただけます。アカウントの登録や料金のお支払いは必要ありません。</li>
          <li>次の行為はご遠慮ください。法令に違反する行為、本サービスの運営を妨げる行為（過度な自動アクセスなど）、他の利用者や第三者の権利を侵害する行為、本サービスまたは関連システムに不正にアクセスしセキュリティを侵害する行為。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="terms-disclaimer" title="3. 情報の正確性・免責" tone="accent" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスでは、掲載情報の正確性・最新性の確保に努めますが、その完全性や特定の目的への適合性を保証するものではありません。</li>
          <li>支援制度や相談窓口の内容は変更される場合があります。実際に利用する際は、各自治体・機関等の公式情報もご確認ください。</li>
          <li>本サービスの利用により損害が生じた場合の責任については、適用される法令に従います。</li>
          <li>掲載情報の提供元である自治体等（データを提供する区市町村・東京都など）は、本サービスの内容および本サービスの利用により生じたトラブルや損害について、一切の責任を負いません。</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          掲載内容の誤りにお気づきの場合は、相談先・学校情報等のカードにある「掲載情報の誤りを報告」からお知らせください。
        </p>
      </ContentSection>

      <ContentSection anchorId="terms-ai" title="4. AI 機能について" tone="accent" icon={<Bot aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスの一部では、利用者が任意で生成 AI を利用できます。</li>
          <li>AI が生成する文章には、不正確な内容や不適切な表現が含まれる場合があります。生成内容は参考情報として利用し、支援制度や相談窓口等の重要な情報は公式情報をご確認ください。</li>
          <li>
            AI 機能に送信される情報の取扱いについては、
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              プライバシーポリシー
            </Link>
            をご確認ください。
          </li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="terms-license" title="5. 著作権・ライセンス" icon={<FileText aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスのソースコードは、GitHub リポジトリに記載する範囲について MIT License のもとで公開しています（Copyright (c) 2026 yunbow）。</li>
          <li>本サービスが利用しているオープンデータには、データセットごとに提供元と利用条件があります。画面上の出典表示をご確認ください。</li>
          <li>その他の文章、画像、ロゴ等の扱いについては、それぞれの表示または権利関係に従います。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="terms-changes" title="6. サービスの変更・終了">
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスは、運営上・技術上その他の必要がある場合、機能や内容を変更し、または提供の一部もしくは全部を停止・終了することがあります。</li>
          <li>利用者への影響が大きい変更や終了については、可能な範囲で本サービス上で事前にお知らせします。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="terms-law" title="7. 準拠法・お問い合わせ" icon={<MessageCircleQuestion aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本規約は日本法に準拠します。</li>
          <li>
            本サービスの運営に関するお問い合わせは、
            <Link href="/about" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              このプロジェクトについて
            </Link>
            に記載する窓口からお寄せください。
          </li>
          <li>発達、医療、福祉等に関する個別の相談について、本サービスの運営者が回答することはできません。表示される相談窓口等をご利用ください。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="terms-revision" title="8. 本規約の変更">
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本規約は、法令に従い、必要に応じて変更することがあります。</li>
          <li>変更する場合は、変更内容および効力発生日を、本ページその他の適切な方法でお知らせします。</li>
          <li>変更後の規約は、表示した効力発生日から適用します。</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          制定: 2026年8月9日／最終更新: 2026年8月18日
        </p>
      </ContentSection>
    </InfoPageShell>
  );
}
