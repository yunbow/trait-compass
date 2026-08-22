import type { Metadata } from "next";
import { MapPin, ShieldCheck, Sparkles } from "lucide-react";

import { AnchorNav } from "@/components/common/AnchorNav";
import { resolveBackHref } from "@/components/common/report-form/back-href";
import { ContentSection } from "@/components/common/ContentSection";
import { ExternalTextLink } from "@/components/common/ExternalTextLink";
import { InfoPageShell } from "@/components/common/InfoPageShell";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Trait Compass",
  description:
    "Trait Compass における情報の取り扱いについて。回答内容はブラウザ内で完結し外部へ送信しません。Cookie を使わず、個人を特定しない画面到達数のみを計測しています。",
};

const PRIVACY_NAV_ITEMS = [
  { href: "#privacy-answers", label: "回答・履歴" },
  { href: "#privacy-analytics", label: "利用計測" },
  { href: "#privacy-location", label: "現在地" },
  { href: "#privacy-optin", label: "検索・AI" },
  { href: "#privacy-external", label: "外部サービス" },
  { href: "#privacy-contact", label: "お問い合わせ" },
] as const;

interface PrivacyPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

/**
 * `back` クエリ(遷移元のURL)を `resolveBackHref`(オープンリダイレクト対策込み、
 * /about・/help・/guide と共通)で検証し、「トップに戻る」固定ではなく遷移元に
 * 応じた戻り先にする(未指定時はトップへ戻る)。
 */
export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="PRIVACY"
      title="プライバシーポリシー"
      lead="Trait Compass（以下「本サービス」）における情報の取り扱いについて説明します。本サービスはアカウント登録の仕組みを持たず、氏名・メールアドレスなどの登録を求めることはありません。"
      heroExtra={<p className="mt-4 text-xs text-muted-foreground">最終更新: 2026年8月12日</p>}
    >
      <ContentSection anchorId="privacy-summary" title="データの扱い・要約" tone="accent" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-140 text-left text-sm">
            <thead>
              <tr className="border-b border-primary/20 text-xs text-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">情報・操作</th>
                <th scope="col" className="py-2 font-medium">扱い</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-primary/15"><td className="py-2 pr-3 text-foreground">チェックの回答・結果</td><td className="py-2">ブラウザ内で処理</td></tr>
              <tr className="border-b border-primary/15"><td className="py-2 pr-3 text-foreground">途中経過・履歴</td><td className="py-2">この端末のブラウザ内にのみ保存</td></tr>
              <tr className="border-b border-primary/15"><td className="py-2 pr-3 text-foreground">現在地</td><td className="py-2">ブラウザ内で利用。送信・保存しない</td></tr>
              <tr className="border-b border-primary/15"><td className="py-2 pr-3 text-foreground">相談先検索</td><td className="py-2">選択した条件をサービス側で処理</td></tr>
              <tr><td className="py-2 pr-3 text-foreground">AI機能</td><td className="py-2">自分で実行したときだけ、確認した内容を送信</td></tr>
            </tbody>
          </table>
        </div>
      </ContentSection>

      <AnchorNav label="プライバシーポリシーの目次" items={PRIVACY_NAV_ITEMS} />

      <ContentSection anchorId="privacy-answers" title="回答内容の取り扱い">
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>日常の困りごとチェックを回答しているだけでは、回答内容が外部へ送信されることはありません。回答・スコアの算出・結果の表示は、すべてご利用のブラウザ内で行います。</li>
          <li>支援情報の検索や AI を使う任意の機能では、画面で確認した内容のみをサーバー・外部サービスへ送信します。詳しくは「支援情報の検索・AI 機能について」をご覧ください。</li>
          <li>回答の途中経過や過去の記録は、この端末のブラウザ内にのみ保存します。設定画面からいつでも削除できます。</li>
          <li>結果を共有する URL のうち「#」より後ろの部分は、ブラウザの仕組み上サーバーへ送信されません。共有 URL を開いた場合も、その内容がサーバーに届くことはありません。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="privacy-analytics" title="利用計測について">
        <p className="mt-2 text-sm text-muted-foreground">
          本サービスは、Cookie を使わず、個人を特定できない形で、画面への到達数のみを計測しています。Cloudflare Web Analytics・Counterscale・Plausible などの外部アナリティクスサービスは使用せず、本サービス自身の集計カウンタとして実装しています。
        </p>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-muted/60 px-3 py-2 text-foreground">Cookieは使いません</li>
          <li className="rounded-lg bg-muted/60 px-3 py-2 text-foreground">個人を特定する記録は残しません</li>
          <li className="rounded-lg bg-muted/60 px-3 py-2 text-foreground">Do Not Trackに対応しています</li>
        </ul>
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">計測内容と保存方法の詳細を見る</summary>
          <h3 className="mt-3 text-sm font-semibold text-foreground">計測している内容</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground"><li>トップ / アンケート / 結果 / 支援情報検索の4画面について、それぞれの画面が表示された（到達した）という事実のみ。</li></ul>
          <h3 className="mt-3 text-sm font-semibold text-foreground">計測していない内容</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            <li>日常の困りごとチェックの回答・スコア・自由記述・年齢・地域・共有 URL の内容など、個人を識別しうる情報は計測していません。</li>
            <li>独自のアクセス集計では、IP アドレスや User-Agent を記録・保存しません（本サービスをホスティングする Cloudflare の基盤側で、通信の一般的な処理として接続情報が扱われる場合があります）。</li>
            <li>計測の窓口が受け付けられるのは4つの画面名のいずれか1つだけで、それ以外の値は受け付けない仕組みになっています。</li>
            <li>ブラウザから Do Not Track の設定が送信されている場合は、この独自のアクセス計測を行いません。</li>
          </ul>
          <h3 className="mt-3 text-sm font-semibold text-foreground">保存する内容と利用目的</h3>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            <li>「日付 × 画面」ごとの到達回数の合計値のみを保存します。個々のアクセス履歴（いつ・誰が・何回）は保持しません。</li>
            <li>今後の機能開発に着手すべきかどうかを検討するための、需要の目安として利用します。</li>
            <li>集計データは、この目的に必要な期間保持します。</li>
          </ul>
        </details>
      </ContentSection>

      <ContentSection anchorId="privacy-location" title="現在地の利用" icon={<MapPin aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>支援情報検索画面の「現在地から探す」ボタンを押した場合のみ、ブラウザの許可を得て現在地を取得します。設定として常時有効になっているものではありません。</li>
          <li>取得した位置情報は、あらかじめ本サービスに登録している区市町村の代表地点との距離を計算し、最も近い区市町村を選ぶためにブラウザ内で使用します。</li>
          <li>位置情報がサーバーへ送信されることはなく、保存することもありません。</li>
        </ul>
      </ContentSection>

      <ContentSection anchorId="privacy-optin" title="支援情報の検索・AI 機能について">
        <p className="mt-2 text-sm text-muted-foreground">
          支援情報の検索と、AI による説明・相談メモの整理・おすすめ理由の生成は、ご自身で操作したときにのみ実行されます。自動的に実行されることはありません。
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">何を送るか</dt>
            <dd className="mt-0.5 text-muted-foreground">支援情報の検索では、選択した年齢の区分・区市町村・相談したいことを送信します。AI 機能では、送信前の確認画面に表示された内容（自由記述やカテゴリ名など）のみを送信します。日常の困りごとチェックの回答そのものが、ご自身の操作なしに送信されることはありません。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">どこへ送るか</dt>
            <dd className="mt-0.5 text-muted-foreground">支援情報の検索は本サービスのサーバー（Cloudflare 上で運用）で処理します。AI 機能は Google Vertex AI（Cloudflare AI Gateway 経由）へ送信します。利用している外部サービスの詳細は次の節をご覧ください。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">保存されるか</dt>
            <dd className="mt-0.5 text-muted-foreground">本サービス側で AI への送信内容・応答内容を保存することはありません。送信を仲介する Cloudflare AI Gateway のログ収集機能も無効化しています。送信先である Google Vertex AI 側での取り扱いは、提供元の定める条件によります。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">AI の学習に利用されるか</dt>
            <dd className="mt-0.5 text-muted-foreground">本サービスから学習目的での利用を意図して送信することはありません。送信先事業者側の取り扱いは、当該事業者が公表する条件をご確認ください。</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">個人を特定できる情報の入力について</dt>
            <dd className="mt-0.5 text-muted-foreground">氏名、住所、電話番号、学校名、勤務先など、個人を特定できる情報は入力しないでください。特に自由記述欄にご注意ください。</dd>
          </div>
        </dl>
        <aside aria-label="AI機能を使うときの注意" className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm leading-6 text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Sparkles aria-hidden="true" className="size-4 text-primary" />AI機能を使うときの注意</div>
          <p className="mt-1">AIへの送信は任意で、送信前に内容を確認できます。氏名・住所・電話番号・学校名・勤務先など、個人を特定できる情報は入力しないでください。</p>
        </aside>
        <p className="mt-3 text-sm text-muted-foreground">これらの機能を使わない場合、本サービスはブラウザ内だけで利用できます。</p>
      </ContentSection>

      <ContentSection anchorId="privacy-external" title="利用している外部サービス">
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-140 text-left text-sm text-muted-foreground"><thead><tr className="border-b border-border text-xs text-foreground"><th scope="col" className="py-2 pr-3 font-medium">サービス</th><th scope="col" className="py-2 pr-3 font-medium">利用目的</th><th scope="col" className="py-2 font-medium">送られるタイミング</th></tr></thead><tbody><tr className="border-b border-border/60"><td className="py-2 pr-3 text-foreground">Cloudflare</td><td className="py-2 pr-3">ホスティング、データベース、AI Gateway</td><td className="py-2">サービス利用時</td></tr><tr><td className="py-2 pr-3 text-foreground">Google Vertex AI（Gemini）</td><td className="py-2 pr-3">AIによる相談メモ・説明・おすすめ理由の生成</td><td className="py-2">AI機能を自分で実行したとき</td></tr></tbody></table></div>
        <p className="mt-2 text-sm text-muted-foreground">
          各社の情報の取り扱いについては、それぞれの提供元が公表しているプライバシーポリシー・利用条件をご確認ください。
        </p>
      </ContentSection>

      <ContentSection anchorId="privacy-contact" title="お問い合わせ・本ポリシーの変更">
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>本サービスはチーム「CivicUnknot」が開発・運営しています。取得した情報を広告目的で販売することはありません。</li>
          <li>支援情報の検索や AI 機能など、本サービスの機能を提供するために必要な範囲で、外部サービス（「利用している外部サービス」参照）に情報の処理を委託する場合があります。</li>
          <li>本ポリシーの内容は、機能の追加や変更にあわせて見直すことがあります。</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          プライバシーに関するご質問は{" "}
          <ExternalTextLink href="https://github.com/yunbow/trait-compass/issues">GitHub の Issue</ExternalTextLink>
          からお寄せください。
        </p>
        <p className="mt-3 text-sm text-muted-foreground">制定: 2026年8月9日／最終更新: 2026年8月12日</p>
      </ContentSection>
    </InfoPageShell>
  );
}
