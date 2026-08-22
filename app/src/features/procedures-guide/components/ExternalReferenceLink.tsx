interface ExternalReferenceLinkProps {
  label: string;
  /** `null`/空文字の場合はリンク化せず、通常のテキストとして表示する(リンク切れ時のフォールバック、AC-3)。 */
  url: string | null;
}

/**
 * 外部参考リンクの表示(TICKET-0057 AC-3)。
 *
 * `src/components/common/SourceCredit.tsx`(出典・外部リンク表示パターン)と同様、
 * `url` が存在する場合のみ実際のリンクとして描画し、存在しない場合はプレーンテキストとして
 * 表示することで、リンク切れ・URL未確定の状態でも表示崩れしない(NFR-25 の考え方を踏襲)。
 * 本ガイドは静的コンテンツのみで構成し(AC-4)、実行時にURLの生死を確認する通信は行わない。
 */
export function ExternalReferenceLink({ label, url }: ExternalReferenceLinkProps) {
  if (!url) {
    return <span className="text-foreground">{label}(リンク準備中)</span>;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-foreground">
      {label}
    </a>
  );
}
