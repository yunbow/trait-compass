interface SourceCreditProps {
  /** formatSourceCredit() が組み立てた「出典: {title}({source_org})、{license}」文字列。 */
  credit: string;
  sourceUrl: string | null;
}

/**
 * 出典クレジット表示(FR-026, NFR-54)。CC BY 4.0 等を引用する箇所すべてに表示する共通部品。
 * データセットの source_url が存在する場合のみ、データセット本体へのリンクを併記する。
 */
export function SourceCredit({ credit, sourceUrl }: SourceCreditProps) {
  return (
    <p className="text-xs text-muted-foreground">
      {credit}
      {sourceUrl && (
        <>
          {" "}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            データセットを見る
          </a>
        </>
      )}
    </p>
  );
}
