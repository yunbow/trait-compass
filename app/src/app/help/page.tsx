import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ClipboardList, Search, ShieldCheck, Sparkles } from "lucide-react";

import { resolveBackHref } from "@/components/common/report-form/back-href";
import { ContentSection } from "@/components/common/ContentSection";
import { DetailsAnchorOpener } from "@/components/common/DetailsAnchorOpener";
import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { InfoPageShell } from "@/components/common/InfoPageShell";

export const metadata: Metadata = {
  title: "使い方 | Trait Compass",
  description:
    "Trait Compass の使い方。日常の困りごとチェックの始め方と途中からの再開、結果画面でできること、相談先の探し方、相談メモの作り方、設定・データ管理、よくある質問について説明します。",
};

const QUICK_LINKS = [
  { href: "#help-survey", label: "チェックを使う" },
  { href: "#help-support", label: "相談先を探す" },
  { href: "#help-settings", label: "保存・データ設定" },
] as const;

const QUICK_LINK_CLASS =
  "rounded-full border border-primary/30 bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const SETTINGS_ROWS = [
  { name: "履歴の保存", does: "結果をブラウザに保存できるようにする", initial: "OFF" },
  { name: "年齢・地域の保存", does: "次回の入力を省略する", initial: "OFF" },
  { name: "結果画面の解説", does: "制度・手続きの解説を表示する", initial: "ON" },
] as const;

const FAQ_ITEMS = [
  {
    question: "チェックを途中で閉じても大丈夫ですか？",
    answer: "はい。このブラウザに途中経過が残っていれば、トップ画面の「前回の続きから」から再開できます。",
  },
  {
    question: "チェックを受けなくても相談先を探せますか？",
    answer: "はい。「相談先・支援情報を探す」から直接探せます。",
  },
  {
    question: "入力した回答はサーバーに保存されますか？",
    answer:
      "日常の困りごとチェックの回答・集計・結果表示はブラウザ内で処理します。支援情報の検索や任意の AI 機能を利用した場合のみ、必要な情報を外部サービスへ送信します。",
  },
  {
    question: "AIを使わなくても利用できますか？",
    answer: "はい。AI 機能はすべて任意です。使わなくてもチェックや相談先検索は利用できます。",
  },
  {
    question: "保存した情報を消せますか？",
    answer: "設定画面の「すべてのデータを削除」から削除できます。",
  },
  {
    question: "掲載情報が間違っている場合は？",
    answer: "各相談先カードの「掲載情報の誤りを報告」からお知らせください。",
  },
] as const;

/**
 * 使い方の案内(/help)。用語の説明は /guide へ移設し、このページは
 * 各画面でできることと進め方だけを扱う。
 * 表示するのは固定の説明文のみでデータ取得も状態も持たないため、
 * /privacy・/terms・/about と同じく page.tsx に直接記述する
 * (project-structure.md §7 の「page.tsx はデータパススルー」に反しない)。
 *
 * 各セクションは `<details>`(ネイティブアコーディオン、状態を持たないため
 * "use client" 不要)にして初期表示の分量を抑える。フラグメントリンクで
 * 閉じた `<details>` の中身へ直接ジャンプした場合、対応する id を要素自体に
 * 付けておけばモダンブラウザがネイティブに自動展開する(JS 不要)。
 * 「まず知りたいこと」の目的別クイックリンクは、機能名ではなく利用者が
 * 実際に持つ疑問("チェックを始めたい"等)から各セクションへ直接ジャンプできる
 * ようにする導線。
 *
 * `back` クエリ(遷移元のURL)を `resolveBackHref`(オープンリダイレクト対策込み、
 * /guide・/about と共通)で検証し、「トップに戻る」固定ではなく遷移元に応じた
 * 戻り先にする(未指定時はトップへ戻る)。
 */
interface HelpPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="HOW TO USE"
      title="使い方"
      lead="Trait Compass の各画面でできることと、その進め方を説明します。どの機能も任意です。必要なものだけお使いください。"
    >
      <DetailsAnchorOpener />

      <DisclaimerNotice variant="top" />

      <ContentSection anchorId="help-quick-links" title="まず知りたいこと">
        <p className="mt-1 text-sm text-muted-foreground">知りたいことを選んでください。</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className={QUICK_LINK_CLASS}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection anchorId="help-data" title="安心して使うために" tone="accent" icon={<ShieldCheck aria-hidden="true" className="size-5 text-primary" />}>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>日常の困りごとチェックの回答・集計・結果表示は、このブラウザ内で処理します。</li>
          <li className="flex gap-2"><Sparkles aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span>AI機能は任意です。送信前に内容を確認でき、使わなくてもチェックや相談先検索を利用できます。</span></li>
          <li>支援情報の検索やAI機能を使う場合のみ、必要な情報を外部サービスへ送信します。</li>
        </ul>
      </ContentSection>

      <section aria-labelledby="help-flow-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="help-flow-heading" className="text-base font-semibold text-foreground">基本の使い方</h2>
          <p className="mt-1 text-sm text-muted-foreground">目的に合う入口を選び、必要なところまで進めます。</p>
        </div>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5" open>
        <summary id="help-start" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground"><span className="mr-2 text-primary">01</span>2つの入口</summary>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            トップ画面には「どちらから始めますか？」として、2つの入口があります。特にチェックを受けなくても支援情報を探せる点が、このサービスの特徴です。
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-1 rounded-md border border-border/80 bg-background/80 p-3 text-center text-sm">
              <p className="font-medium text-foreground">困りごとを整理したい</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">日常の困りごとチェック</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">結果</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">相談先・相談メモ</p>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-md border border-border/80 bg-background/80 p-3 text-center text-sm">
              <p className="font-medium text-foreground">すぐ支援情報を探したい</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">年齢・地域を選択</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">相談したいことを選択</p>
              <span aria-hidden="true" className="text-muted-foreground">↓</span>
              <p className="text-foreground">相談先</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            お子さんについて相談したい方、ご家族・支援者として相談先を探したい方も、そのままご利用いただけます。
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <FlowLink href="/survey" icon={<ClipboardList aria-hidden="true" className="size-4" />}>チェックを始める</FlowLink>
            <FlowLink href="/support" icon={<Search aria-hidden="true" className="size-4" />}>相談先を探す</FlowLink>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-survey" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground"><span className="mr-2 text-primary">02</span>チェックを進める・途中から再開する</summary>
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <li>全30問、約5〜10分です。1画面に1問ずつ表示します。</li>
          <li>途中で閉じても、この端末のブラウザ内に進行状況が保存されます。別の端末や別のブラウザには引き継がれません。</li>
          <li>チェックの回答・集計・結果表示はブラウザ内で処理し、支援情報の検索や任意の AI 機能を利用した場合のみ、必要な情報を外部サービスへ送信します。</li>
          <li>続ける場合はトップの「前回の続きから」、最初からやり直す場合は「日常の困りごとチェックをはじめる」を選んでください。</li>
        </ul>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-result" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground"><span className="mr-2 text-primary">03</span>結果画面でできること</summary>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">結果画面では次のことができます。</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>高めに出た困りごとを確認する</li>
            <li>地域の相談先を探す</li>
            <li>相談時に渡すメモを作る</li>
            <li>結果の詳細を見る</li>
            <li>結果を保存・共有する</li>
            <li>最初からやり直す</li>
          </ul>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-support" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground"><span className="mr-2 text-primary">04</span>相談先をさがす</summary>
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <li>年齢（ライフステージ）と区市町村を選ぶと、その地域の支援情報を探せます。結果画面から移動した場合は、相談分野があらかじめ選ばれた状態で始まります。</li>
          <li>「現在地から探す」ボタンを押した場合のみ、ブラウザの位置情報を利用して近い区市町村を候補にします。位置情報は保存されません。</li>
          <li>検索結果は「相談窓口」「学校情報」「福祉ガイド」「発達障害支援資料」「支援制度」のタブに分かれています。</li>
          <li>掲載内容は、東京都・区市町村等のオープンデータや公式Webサイトをもとに整理しています。実際に利用される前に、各窓口の公式情報もあわせてご確認ください。</li>
          <li>掲載内容に誤りや変更を見つけた場合は、相談先カードの「掲載情報の誤りを報告」からお知らせいただけます。</li>
        </ul>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-memo" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground"><span className="mr-2 text-primary">05</span>相談時に渡すメモを作る</summary>
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <li>結果画面の「相談時に渡すメモを作る」から進みます。選択式で組み立てる方法と、自由記述を AI に整理してもらう方法を選べます。AI に送信する前に、送る内容を確認できます。</li>
          <li>チェック結果や支援情報検索で入力した内容を引き継いで、相談用メモを作れます。</li>
          <li>引き継げる情報がない場合は、先にチェックまたは相談先検索をご利用ください。</li>
        </ul>
      </details>
      </section>

      <section aria-labelledby="help-more-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="help-more-heading" className="text-base font-semibold text-foreground">その他の使い方</h2>
          <p className="mt-1 text-sm text-muted-foreground">保存や設定、用語の確認について説明します。</p>
        </div>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-history" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground">保存・履歴について</summary>
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
          <li>保存した記録が1件以上あるとき、トップ画面に「これまでの記録を見る」が表示され、記録の一覧を開けます。</li>
          <li>記録の保存は、はじめは無効です。設定画面の「履歴の保存」を有効にすると、結果画面から保存できるようになります。</li>
        </ul>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-settings" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground">設定・データ管理</summary>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            ページ下部の「設定」から、設定・データ管理の画面を開けます。この端末のブラウザ内に保存する内容を、次の設定で切り替えられます。
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm text-muted-foreground">
              <thead>
                <tr className="border-b border-border text-xs text-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-medium">設定</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">できること</th>
                  <th scope="col" className="py-1.5 font-medium">初期状態</th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS_ROWS.map((row) => (
                  <tr key={row.name} className="border-b border-border/60 last:border-b-0">
                    <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                    <td className="py-1.5 pr-3">{row.does}</td>
                    <td className="py-1.5">{row.initial}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            「すべてのデータを削除」で、保存した履歴・途中経過・設定を削除できます。
          </p>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <summary id="help-glossary" className="scroll-mt-6 cursor-pointer text-base font-semibold text-foreground">用語について</summary>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            結果画面に出てくる「会話・伝え方」「感覚」などの領域名や、発達特性に関連する用語は「用語の説明」で確認できます。
          </p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            <li>
              <Link href="/guide#categories" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                領域名の説明
              </Link>
            </li>
            <li>
              <Link href="/guide#traits" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                特性名の説明
              </Link>
            </li>
          </ul>
          <p className="mt-1 text-sm text-muted-foreground">
            結果画面のレーダーチャートの領域名や、そのすぐ下のリンクからも同じページを開けます。
          </p>
        </div>
      </details>

      </section>

      <ContentSection anchorId="help-faq" title="よくある質問">
        <div className="mt-2">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="border-t border-border py-3 first:border-t-0 first:pt-2">
              <summary className="cursor-pointer text-sm font-medium text-foreground">{item.question}</summary>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          掲載情報の訂正やご意見の送り方は、
          <Link href="/about#about-contact" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">このプロジェクトについて</Link>
          でもご案内しています。
        </p>
      </ContentSection>
    </InfoPageShell>
  );
}

function FlowLink({ href, icon, children }: { href: string; icon: ReactNode; children: string }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/35 bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {icon}
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
