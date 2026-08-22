interface DisclaimerNoticeProps {
  /**
   * "full"(既定): トップ・アンケート・結果・支援情報案内など主要画面向けの詳細な免責文言
   * (NFR-51〜53、設問の出典明記を含む)。
   * "top": トップ画面向け。開始導線を邪魔しない短い免責を先に見せ、詳細は展開式にする。
   * "compact": 支援入力画面のフッターなど、画面の主目的を邪魔しない一文で足りる場所向け
   * (NFR-52、TICKET-0017 の「アンケート画面はフッター等の控えめな一文で可」と同じ考え方)。
   */
  variant?: "full" | "top" | "compact";
}

/**
 * 非診断の免責表示(NFR-51・NFR-52・NFR-53)。
 * 「診断」「判定」「あなたは○○です」等の断定表現を避け、全画面での再利用を想定した
 * 共通コンポーネント(components/common に配置)。
 * 禁止語・推奨言い換え・免責の正文は `src/lib/copy/banned-words.ts` と対応する。
 *
 * "full"/"top" 正文の最終行(TICKET-0059 AC-2 追補)は、「回答時の気分・環境によって結果が
 * 変わりうる」「30問の簡易的なチェックであり全特性を網羅しない」という2点の具体的な限界表現を
 * 1文に集約したもの(簡潔さ優先、AC-4 のアクセシビリティ配慮と同じ方針)。単一コンポーネントの
 * 改訂で全画面(トップ・アンケート・結果・支援情報案内)に反映される。
 * 設問プール総数(242問)は AnswerScopeSection(ResultView.tsx)と同じ理由(「正式な検査から
 * 抽出した」という誤解を招きうる)で開示しない。
 */
export function DisclaimerNotice({ variant = "full" }: DisclaimerNoticeProps = {}) {
  if (variant === "compact") {
    return (
      <p role="note" className="text-center text-xs text-muted-foreground">
        これは医学的な診断ではありません。傾向を知るための、日常の困りごとチェックの目安です。
      </p>
    );
  }

  if (variant === "top") {
    return (
      <details className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm text-foreground">
        <summary className="cursor-pointer list-none font-semibold marker:hidden">
          これは医学的な診断ではありません。
          <span className="mt-1 block font-normal text-muted-foreground">
            <span>傾向を知るための、日常の困りごとチェックです。</span>
            <span className="ml-1 whitespace-nowrap text-foreground underline underline-offset-4">詳細を確認</span>
          </span>
        </summary>
        <div className="mt-3 border-t border-border pt-3">
          <p>結果は自己理解の目安としてご利用ください。</p>
          <p className="mt-1">診断や治療が必要かどうかは、医療機関や専門の相談窓口にご確認ください。</p>
          <p className="mt-1">
            設問は本プロジェクトで独自に作成したものであり、ASRS・AQ・RAADS等の既存の心理尺度は使用していません。
          </p>
          <p className="mt-1">
            回答時の気分や環境によって結果は変わることがあり、30問の簡易的なチェックのためすべての特性を網羅するものではありません。
          </p>
        </div>
      </details>
    );
  }

  return (
    <div role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm text-foreground">
      <p className="font-semibold">これは医学的な診断ではありません。</p>
      <p className="mt-1">傾向を知るための、日常の困りごとチェックです。</p>
      <p className="mt-1">結果は自己理解の目安としてご利用ください。</p>
      <p className="mt-1">診断や治療が必要かどうかは、医療機関や専門の相談窓口にご確認ください。</p>
      <p className="mt-1">
        設問は本プロジェクトで独自に作成したものであり、ASRS・AQ・RAADS等の既存の心理尺度は使用していません。
      </p>
      <p className="mt-1">
        回答時の気分や環境によって結果は変わることがあり、30問の簡易的なチェックのためすべての特性を網羅するものではありません。
      </p>
    </div>
  );
}
