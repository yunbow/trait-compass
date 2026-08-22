interface AiThinkingIndicatorProps {
  /** 状況に応じた文言(既定: 「回答を作成しています…」)。 */
  label?: string;
}

/**
 * AI応答待ちの共通インジケータ(方針: 画面読み込みは Skeleton、AI応答待ちは本コンポーネントで統一する)。
 * `role="status"` によりスクリーンリーダーにも状態変化を伝える。3点バウンスドット
 * (`nd-dot-wave`、globals.css)で応答待ちであることを視覚的に表現する。
 * `prefers-reduced-motion: reduce` 環境ではアニメーションを無効化する(globals.css 側で対応済み)。
 */
export function AiThinkingIndicator({ label = "回答を作成しています…" }: AiThinkingIndicatorProps) {
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="nd-dot-wave size-2 rounded-full bg-current"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {label}
    </p>
  );
}
