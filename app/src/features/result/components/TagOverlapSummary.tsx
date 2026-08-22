import type { SupportTag } from "@/features/support/services/category-tag-mapping";

interface TagOverlapSummaryProps {
  tags: readonly SupportTag[];
  sentence: string | null;
}

/**
 * 「困りごとの組み合わせ」の表示。診断カテゴリ名・パーセンテージは一切表示しない。
 * `buildTagOverlap()` が返した相談分野タグ(SUPPORT_TAGS)と文章をそのまま描画するだけの
 * 純粋な表示コンポーネント(旧 VennDiagram.tsx の置き換え)。
 */
export function TagOverlapSummary({ tags, sentence }: TagOverlapSummaryProps) {
  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">今回は、特に高めに出ている項目はありませんでした。</p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <ul className="flex flex-wrap justify-center gap-2">
        {tags.map((tag) => (
          <li key={tag} className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
            {tag}
          </li>
        ))}
      </ul>
      {sentence ? (
        <p className="max-w-xl text-center text-sm text-foreground">{sentence}</p>
      ) : (
        <p className="max-w-xl text-center text-sm text-muted-foreground">
          「{tags[0]}」の傾向が比較的高めに出ています。
        </p>
      )}
    </div>
  );
}
