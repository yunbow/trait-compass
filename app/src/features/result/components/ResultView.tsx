"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { FullPageFallback } from "@/components/common/FullPageFallback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearSurveyProgress } from "@/features/survey/services/progress";
import { scoreSurvey, getTopCategories } from "@/features/survey/services/scoring";
import type { CategoryScores, GrayZoneMeta } from "@/features/survey/services/scoring";
import type { CategoryKey, Question } from "@/features/survey/schema/question";

import { NextActionsHub } from "@/features/result/components/NextActionsHub";
import { ResultCharts } from "@/features/result/components/ResultCharts";
import { ResultManagementPanel } from "@/features/result/components/ResultManagementPanel";
import { SharedResultNotice } from "@/features/result/components/SharedResultNotice";
import { useResultProgress } from "@/features/result/hooks/useResultProgress";
import { useSharedResultHash } from "@/features/result/hooks/useSharedResultHash";
import { toShareData } from "@/features/result/services/share-codec";
import type { ShareData } from "@/features/result/services/share-codec";
import { mapScoresToTags } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { buildSupportEntryHref } from "@/features/support/services/results-url";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { scoreToLevel } from "@/features/result/services/score-level";

interface ResultViewProps {
  questions: Question[];
}

/**
 * 結果画面(TICKET-0008)のクライアント側本体。
 * `app/result/page.tsx`(サーバーコンポーネント)から P0 の30問を受け取り、localStorage の
 * 進行状態(回答)を読み込んでスコアリング(scoreSurvey)し、レーダーチャート・ベン図・
 * 上位カテゴリ解説・リスタート導線までを描画する。
 *
 * NFR-32(データ保存の分離)により、算出した結果自体は localStorage/IndexedDB に保存しない。
 * 回答(answers)は既存のアンケート進行状態からその都度読み直すのみで、この画面からの
 * 書き込みはリスタート時の `clearSurveyProgress()` のみ。
 *
 * TICKET-0009(結果共有 URL): マウント時点で URL ハッシュに `#r=...` が存在する場合、
 * 「ハッシュ優先」の原則により progress ではなくハッシュ由来のデータを表示する
 * (`SharedResultView`)。ハッシュが存在しない通常時のみ、これまで通り progress から
 * 算出したスコアを表示し、末尾に共有 URL 発行導線(`ShareUrlSection`)を追加する。
 *
 * TICKET-0025(履歴保存): 自分の結果表示時のみ「この結果を履歴に保存」
 * (`HistorySaveSection`)を表示する。共有閲覧時(`SharedResultView`)には表示しない。
 *
 * TICKET-0022(AI 困りごと要約)・TICKET-0023(RAG 施設レコメンド): 「AI に相談内容を
 * 要約してもらう(任意)」(`AiSummarySection`)・「相談先のヒントを見る(任意)」
 * (`RecommendHintSection`)は、この画面には直接埋め込まず、`NextActionsHub`経由で
 * 専用ページ(`/result/summarize`・`/result/recommend`)へ遷移して利用する構成に変更した
 * (「結果を管理する」内での重複表示を解消するため)。上位カテゴリ解説の
 * 「AI による補足解説(任意)」(`ResultCharts` の `enableAiExplain`、FR-043)は
 * 引き続きこの画面に残る。共有閲覧時(`SharedResultView`)にはいずれも表示しない。
 * P1 スコープでは `/support/results` への本格的な RAG 統合(AC-4)は次チケット以降に回し、
 * 結果画面からの最小限の入口のみを提供する(ticket 記載)。
 */
export function ResultView({ questions }: ResultViewProps) {
  const router = useRouter();
  const { isHydrated: isProgressHydrated, progress } = useResultProgress();
  const { isHydrated: isHashHydrated, hasShareParam, sharedData } = useSharedResultHash();

  if (!isProgressHydrated || !isHashHydrated) {
    return <ResultViewSkeleton />;
  }

  // ハッシュ由来の閲覧(共有 URL 経由)を、自分の progress よりも優先する(AC-6)。
  // この判定はマウント時の1回のみ(useSharedResultHash)であり、ユーザーがこの画面上で
  // 自ら「共有 URL を作成」した場合には影響しない。
  if (hasShareParam) {
    if (!sharedData) {
      // AC-8: 不正・破損したハッシュは、通常結果として誤表示せず安全にエラー表示する。
      return <BrokenShareResultView />;
    }
    return <SharedResultView shareData={sharedData} />;
  }

  const answers = progress?.answers ?? [];

  function handleRestart() {
    // FR-018 のリスタート導線: 進行状態をクリアしてアンケート最初からやり直せるようにする。
    clearSurveyProgress();
    router.push("/survey");
  }

  if (answers.length === 0) {
    return (
      <FullPageFallback
        title="まだ回答がありません。"
        description="アンケートに回答すると、ここに傾向の目安が表示されます。"
        action={
          <>
            <Button render={<Link href="/survey" />} nativeButton={false} size="lg" className="w-full max-w-xs">
              チェックを始める
            </Button>
            <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="lg" className="w-full max-w-xs">
              トップへ戻る
            </Button>
          </>
        }
      />
    );
  }

  const { categoryScores, traitScores, grayZoneMeta, overlapCounts } = scoreSurvey(answers, questions);
  const shareData = toShareData({ categoryScores, traitScores, grayZoneMeta, overlapCounts });
  const topCategoryEntries = getTopCategories(categoryScores);

  // 支援情報検索(TICKET-0014)へ相談分野タグを引き継ぐ(FR-023)。tagsクエリはASCII ID化
  // (受動的プライバシー対策、support-tag-url.ts 参照)。タグが1つも無い場合は「全般」扱いとし、
  // tags クエリを付けずに /support へ遷移する。
  const supportTags = mapScoresToTags(categoryScores);
  const supportHref = buildSupportEntryHref(supportTags);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center gap-8 px-6 py-12"
    >
      <ResultActionSummary
        answerCount={answers.length}
        totalQuestionCount={questions.length}
        topCategories={topCategoryEntries}
        categoryScores={categoryScores}
        grayZoneMeta={grayZoneMeta}
        supportTags={supportTags}
        supportHref={supportHref}
      />

      <details className="w-full max-w-2xl rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          保存・共有・やり直し
          <span className="mt-1 block text-sm font-normal text-muted-foreground">保存・共有・やり直しの操作です。</span>
        </summary>
        <div className="flex flex-col gap-3">
          <ResultManagementPanel shareData={shareData} onRestart={handleRestart} />
          <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="lg" className="w-full">
            <Home aria-hidden="true" />
            トップへ戻る
          </Button>
        </div>
      </details>
    </main>
  );
}

/**
 * localStorage / location.hash の読み込み中(ハイドレーション前)に表示するスケルトン
 * (方針: 画面読み込みは Skeleton で統一する)。実際の表示(answers.length > 0 の分岐、
 * 116〜121行目付近)と同じ幅・余白のラッパーに合わせる。
 */
function ResultViewSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center gap-8 px-6 py-12"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-5">
        <div className="flex w-full flex-col items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-64" />
        </div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </main>
  );
}

/**
 * 「このアプリが答えられること/答えられないこと」区分セクション(TICKET-0059 AC-3)。
 * 自分の結果表示(ResultView)・共有閲覧(SharedResultView)の両方で共通して表示する
 * (SNS-D08: 「データでは解決しない」事項の分離)。アクセシビリティ配慮(AC-4)として、
 * 各区分は2〜4項目の簡潔な箇条書きに留める。
 *
 * DisclaimerNotice.tsx(免責文の正文)とは別の観点の情報であり、正文の複製ではない。
 * 「242問中30問の抽出」という表現は、母集団となる242問という数字自体が「正式な検査から
 * 抽出した」という誤解を招きうるため使わない。設問プール自体の総数(242問)を開示する
 * 意味はなく、「30問の簡易的なチェックであり網羅的ではない」という限界だけを伝えれば足りる。
 */
function AnswerScopeSection() {
  return (
    <section className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-border p-4 text-sm">
      <div>
        <h2 className="text-sm font-semibold text-foreground">このアプリが答えられること</h2>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li>回答をもとにした、領域ごとの困りごとの傾向</li>
          <li>相談先を探すための支援情報への入口</li>
        </ul>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">このアプリが答えられないこと</h2>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li>学校・職場・医療機関で必要になる専門的な評価や証明書類の代わり</li>
          <li>30問の簡易的なチェックであり、日常のすべての困りごとを網羅するものではないこと</li>
        </ul>
      </div>
    </section>
  );
}

function ResultSummary({
  topCategories,
}: {
  topCategories: Array<{ category: CategoryKey; score: number }>;
}) {
  if (topCategories.length === 0) {
    return null;
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">今回「よくある」が多かった領域</h2>
        <p className="text-sm text-muted-foreground">回答をもとに、当てはまる回答が多かった領域を上から表示しています。</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {topCategories.map(({ category, score }, index) => (
          <li key={category} className="rounded-lg border border-border bg-muted px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
              <span className="text-xs font-semibold text-primary">{scoreToLevel(score)}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">{CATEGORY_LABELS[category]}</p>
            <p className="mt-1 text-xs text-muted-foreground">{categorySummary(category)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function categorySummary(category: CategoryKey): string {
  const summaries: Partial<Record<CategoryKey, string>> = {
    communication: "会話や伝わり方の負担を振り返る目安です。",
    sensory: "音や光など、環境から受ける負担を振り返る目安です。",
    learning: "学び方や理解のしやすさを振り返る目安です。",
    motor: "体の動かし方や不器用さを振り返る目安です。",
    "emotion-regulation": "気持ちの切り替えや強さを振り返る目安です。",
    "impulse-memory": "注意の向け方や段取りを振り返る目安です。",
  };
  return summaries[category] ?? "日常で感じる負担を振り返る目安です。";
}

function ResultActionSummary({
  answerCount,
  totalQuestionCount,
  topCategories,
  categoryScores,
  grayZoneMeta,
  supportTags,
  supportHref,
}: {
  answerCount: number;
  totalQuestionCount: number;
  topCategories: Array<{ category: CategoryKey; score: number }>;
  categoryScores: CategoryScores;
  grayZoneMeta: GrayZoneMeta;
  supportTags: SupportTag[];
  supportHref: string;
}) {
  const isPartial = answerCount < totalQuestionCount;

  return (
    <section className="flex w-full max-w-2xl flex-col gap-5 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-foreground">回答ありがとうございました</h1>
        <p className="text-sm text-muted-foreground">{answerCount}問の回答をもとにした、自己理解のための目安です。</p>
        {/* 詳しい免責文(DisclaimerNotice variant="top")は下部にあるが、スクロールしないと
            出てこないため、ここにも短い一文を置く(下部と同じ正文をそのまま再利用する)。 */}
        <p className="text-xs text-muted-foreground">これは医学的な診断ではありません。</p>
      </div>

      {isPartial && (
        <p role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm text-foreground">
          {answerCount} / {totalQuestionCount}問に回答した途中結果です。未回答の領域があるため、全体を反映した結果ではありません。
        </p>
      )}

      <ResultSummary topCategories={topCategories} />

      <NextActionsHub supportHref={supportHref} supportTags={supportTags} isPartial={isPartial} />

      <details className="w-full max-w-2xl rounded-lg border border-border bg-card p-4 text-left">
        <summary className="cursor-pointer font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          結果を詳しく見る
          <span className="mt-1 block text-sm font-normal text-muted-foreground">領域別の傾向、困りごとの組み合わせ、結果の見方を確認できます。</span>
        </summary>
        <div className="mt-6 flex w-full flex-col gap-8">
          <AnswerScopeSection />
          <ResultCharts
            categoryScores={categoryScores}
            grayZoneMeta={grayZoneMeta}
            enableAiExplain
          />
        </div>
      </details>

      <DisclaimerNotice variant="top" />
    </section>
  );
}

interface SharedResultViewProps {
  shareData: ShareData;
}

/**
 * 共有 URL(`#r=...`)経由で開いた場合の閲覧専用ビュー(TICKET-0009 AC-6)。
 * リスタート・共有作成の導線は表示せず、代わりに「自分もチェックする」導線のみを置く。
 */
function SharedResultView({ shareData }: SharedResultViewProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center gap-8 px-6 py-12"
    >
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <DisclaimerNotice />
        <SharedResultNotice />
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-xl font-bold text-foreground">共有された傾向の目安</h1>
      </div>

      <AnswerScopeSection />

      <div className="flex w-full flex-col gap-8">
        <ResultCharts
          categoryScores={shareData.categoryScores}
          grayZoneMeta={{ grayZoneCount: shareData.grayZoneCount }}
        />
      </div>

      <div className="flex w-full max-w-2xl flex-col items-center gap-3">
        <Button render={<Link href="/survey" />} nativeButton={false} size="lg" className="w-full max-w-xs">
          自分もチェックする
        </Button>
        <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="lg" className="w-full max-w-xs">
          トップへ戻る
        </Button>
      </div>
    </main>
  );
}

/**
 * 共有 URL のハッシュが存在するが、デコードに失敗した(不正・破損)場合の
 * 安全なエラー表示(AC-8)。通常の結果として誤表示しない。
 */
function BrokenShareResultView() {
  return (
    <FullPageFallback
      title="共有 URL を読み込めませんでした。"
      description="URL の形式が正しくないか、データが壊れている可能性があります。共有した相手にもう一度 URL を発行してもらってください。"
      action={
        <Button render={<Link href="/" />} nativeButton={false} size="lg" className="w-full max-w-xs">
          トップへ戻る
        </Button>
      }
    />
  );
}
